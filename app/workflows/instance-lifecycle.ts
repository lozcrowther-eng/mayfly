import { FatalError, RetryableError, defineHook, getWorkflowMetadata, getWritable, sleep } from "workflow";
import { AdmissionDeniedError, admit, release } from "@/lib/admission";
import { ctfdClient, sandboxClient } from "@/lib/clients";
import type { InstanceRequest, InstanceState, LaunchInput } from "@/lib/types";

const TEAM_CONCURRENCY_CAP = 2;
const DEFAULT_GLOBAL_CONCURRENCY_CAP = 8;
const EXPIRING_NOTICE_SECONDS = 300;

export const lifecycleHook = defineHook<{ reason: "solved" | "stopped" | "extend" }>();

/** Only challengeId/teamId/runId are ever needed to address a hook — callers outside the
 * workflow (lib/api/run-lookup.ts) recover exactly these three from the run's own stream,
 * not a full InstanceRequest. */
export function hookToken(request: Pick<InstanceRequest, "challengeId" | "teamId" | "runId">): string {
  return `lifecycle:${request.challengeId}:${request.teamId}:${request.runId}`;
}

export interface PublishedStatus {
  challengeId: string;
  teamId: string;
  state: InstanceState;
  url: string | null;
}

async function admitInstance(request: InstanceRequest): Promise<void> {
  "use step";

  const globalCap = Number(process.env.SANDBOX_MAX_CONCURRENT ?? DEFAULT_GLOBAL_CONCURRENCY_CAP);

  try {
    admit(request, { teamCap: TEAM_CONCURRENCY_CAP, globalCap });
  } catch (error) {
    if (error instanceof AdmissionDeniedError) {
      // A policy rejection, not a transient failure — retrying won't free up capacity.
      throw new FatalError(error.message);
    }
    throw error;
  }
}

/**
 * The run's own stream, not the World/observability step-output APIs (world.steps.list /
 * hydrateResourceIO), is how the app reads state back — see lib/api/run-lookup.ts. Every
 * field a workflow run holds (input, step output, stream frames) is encrypted at rest on
 * Vercel's World by default; the CLI/dashboard can decrypt it for a human with the right
 * project permissions (an explicit, audited action), but that's not a channel this app's
 * own polling route should reach for. getWritable()/getReadable() is the first-class,
 * non-observability path for a workflow to hand data to the rest of the app — the run's
 * own execution context can read it back as plain data with no separate decrypt step.
 */
async function publishStatus(request: InstanceRequest, state: InstanceState, url: string | null): Promise<void> {
  "use step";

  const status: PublishedStatus = { challengeId: request.challengeId, teamId: request.teamId, state, url };
  const writer = getWritable<PublishedStatus>().getWriter();
  try {
    await writer.write(status);
  } finally {
    writer.releaseLock();
  }
}

async function mintFlag(request: InstanceRequest): Promise<string> {
  "use step";
  return ctfdClient.mintFlag(request);
}

async function createSandbox(request: InstanceRequest, flag: string): Promise<string> {
  "use step";
  const { url } = await sandboxClient.create(request, flag);
  return url;
}

async function waitForHealthy(request: InstanceRequest): Promise<void> {
  "use step";

  try {
    await sandboxClient.healthUrl(request);
  } catch (error) {
    // Boot-time race, not a permanent failure — the step retry policy backs off and tries again.
    // Keep the underlying error's detail (e.g. curl output) instead of a generic message —
    // that detail is what makes a real boot failure distinguishable from a slow one in logs.
    const detail = error instanceof Error ? error.message : String(error);
    throw new RetryableError(`sandbox for ${request.runId} not yet healthy: ${detail}`);
  }
}

async function publishReady(request: InstanceRequest, url: string): Promise<void> {
  "use step";
  await ctfdClient.publishUrl(request, url);
}

async function notifyExpiring(request: InstanceRequest): Promise<void> {
  "use step";
  console.log(
    `[mayfly] instance expiring soon: ${request.challengeId}/${request.teamId}/${request.runId}`,
  );
}

async function reap(request: InstanceRequest): Promise<void> {
  "use step";

  // Both fakes are idempotent no-ops for an instance that was never created/minted, so this
  // is always safe to call regardless of how far the workflow got before failing.
  await sandboxClient.reap(request);
  await ctfdClient.markReaped(request);
  release(request);
}

export async function instanceLifecycle(input: LaunchInput): Promise<void> {
  "use workflow";

  // The run's own id, not one minted by the launch endpoint — see lib/types.ts (LaunchInput).
  // getRun(request.runId) from any API route then always resolves this exact run, with no
  // separate correlation table to keep in sync (and no risk of it living on a different
  // serverless instance than whatever reads it back).
  const { workflowRunId } = getWorkflowMetadata();
  const request: InstanceRequest = { ...input, runId: workflowRunId };

  await admitInstance(request);

  let url: string | null = null;
  let terminalState: "reaped" | "failed" = "reaped";

  try {
    const flag = await mintFlag(request);
    await publishStatus(request, "provisioning", null);

    url = await createSandbox(request, flag);
    await waitForHealthy(request);
    await publishReady(request, url);
    await publishStatus(request, "healthy", url);

    const activeSeconds = Math.max(request.ttlSeconds - EXPIRING_NOTICE_SECONDS, 0);
    // This replaces a Kubernetes reaper CronJob. There is no external process that has to
    // notice the instance is old and go find it: this sleep is a continuation of the exact
    // run that created the sandbox, so the reap() in `finally` is guaranteed to fire even if
    // the workflow backend restarts in the meantime — durability, not a scheduler, is the reaper.
    await sleep(activeSeconds * 1000);

    await notifyExpiring(request);
    await publishStatus(request, "expiring", url);

    const hook = lifecycleHook.create({ token: hookToken(request) });

    // TTL expiry — this sleep winning the race — is the most common exit in practice.
    // Players abandon challenge instances without ever pressing "Stop," so most runs end
    // here, not because someone solved or explicitly stopped the challenge.
    await Promise.race([hook, sleep("5 minutes")]);
  } catch (error) {
    terminalState = "failed";
    url = null;
    throw error;
  } finally {
    // Runs on every exit: the happy path above, an early return, or any step throwing.
    await publishStatus(request, terminalState, url);
    await reap(request);
  }
}
