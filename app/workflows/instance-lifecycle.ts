import { FatalError, RetryableError, defineHook, getWorkflowMetadata, getWritable, sleep } from "workflow";
import { AdmissionDeniedError, admit } from "@/lib/admission";
import { ctfdClient, sandboxClient } from "@/lib/clients";
import { EXTEND_SECONDS } from "@/lib/constants";
import type { InstanceRequest, InstanceState, LaunchInput, PublishedStatus } from "@/lib/types";

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

async function admitInstance(request: InstanceRequest): Promise<void> {
  "use step";

  const globalCap = Number(process.env.SANDBOX_MAX_CONCURRENT ?? DEFAULT_GLOBAL_CONCURRENCY_CAP);

  try {
    await admit(request, { teamCap: TEAM_CONCURRENCY_CAP, globalCap });
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
async function publishStatus(
  request: InstanceRequest,
  state: InstanceState,
  url: string | null,
  opts?: { logs?: string; expiresAt?: string | null },
): Promise<void> {
  "use step";

  const status: PublishedStatus = {
    challengeId: request.challengeId,
    teamId: request.teamId,
    state,
    url,
    logs: opts?.logs,
    expiresAt: opts?.expiresAt ?? null,
  };
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

/** Moves the sandbox's own clock forward — CLAUDE.md: "On extend, call sandbox.extendTimeout() as well as extending the sleep — move both clocks." */
async function extendInstance(request: InstanceRequest, extraSeconds: number): Promise<void> {
  "use step";
  await sandboxClient.extendTimeout(request, extraSeconds);
}

/**
 * Reads whatever the sandbox logged before things went wrong — CLAUDE.md names this
 * `triageFailure` and ties it to "the detached command handle." That handle is a live
 * object from the createSandbox step's own invocation; it cannot cross into this, a later
 * and separate step invocation. What *does* cross that boundary is the durable log file on
 * the sandbox's own filesystem (LOG_PATH in real-client.ts) that the detached command was
 * launched with its output redirected into — readLogs() re-fetches the sandbox by its
 * deterministic name and reads that file, which is the cross-invocation-safe equivalent of
 * "keeping a reference" in an execution model where steps don't share memory.
 */
async function triageFailure(request: InstanceRequest): Promise<string> {
  "use step";
  return sandboxClient.readLogs(request).catch(() => "");
}

async function reap(request: InstanceRequest): Promise<void> {
  "use step";

  // Both fakes are idempotent no-ops for an instance that was never created/minted, so this
  // is always safe to call regardless of how far the workflow got before failing.
  await sandboxClient.reap(request);
  await ctfdClient.markReaped(request);
}

export async function instanceLifecycle(input: LaunchInput): Promise<void> {
  "use workflow";

  // The run's own id, not one minted by the launch endpoint — see lib/types.ts (LaunchInput).
  // getRun(request.runId) from any API route then always resolves this exact run, with no
  // separate correlation table to keep in sync (and no risk of it living on a different
  // serverless instance than whatever reads it back).
  const { workflowRunId } = getWorkflowMetadata();
  const request: InstanceRequest = { ...input, runId: workflowRunId };

  let url: string | null = null;
  let terminalState: "reaped" | "failed" = "reaped";
  let logs: string | undefined;

  try {
    // Inside the try, not before it: an admission rejection is a real terminal outcome
    // (the run stays otherwise silent — no publishStatus, no reap — if this throws outside
    // the block that's actually responsible for reporting failure and cleaning up).
    await admitInstance(request);

    const flag = await mintFlag(request);
    await publishStatus(request, "provisioning", null);

    url = await createSandbox(request, flag);
    await waitForHealthy(request);
    await publishReady(request, url);

    // This replaces a Kubernetes reaper CronJob. There is no external process that has to
    // notice the instance is old and go find it: this sleep is a continuation of the exact
    // run that created the sandbox, so the reap() in `finally` is guaranteed to fire even if
    // the workflow backend restarts in the meantime — durability, not a scheduler, is the reaper.
    let ttlSeconds = request.ttlSeconds;
    let activeSeconds = Math.max(ttlSeconds - EXPIRING_NOTICE_SECONDS, 0);
    // Date.now() is workflow-safe (the docs explicitly allow seeded time/random APIs here);
    // this is what /admin's TTL-remaining column counts down to, published alongside state
    // so it survives a page refresh without the client needing its own copy of ttlSeconds.
    let expiresAt = new Date(Date.now() + activeSeconds * 1000).toISOString();
    await publishStatus(request, "healthy", url, { expiresAt });
    await sleep(activeSeconds * 1000);

    // TTL expiry is the most common exit in practice — players abandon challenge instances
    // without ever pressing "Stop," so most runs fall through this loop via the sleep("5
    // minutes") arm below, not because someone solved, stopped, or extended it. Looping
    // (rather than a single race) is what makes repeated Extends work: each lap grows both
    // clocks by EXTEND_SECONDS and gives the hook another window to fire in.
    for (;;) {
      await notifyExpiring(request);
      await publishStatus(request, "expiring", url, { expiresAt });

      const hook = lifecycleHook.create({ token: hookToken(request) });
      const result = await Promise.race([hook, sleep("5 minutes")]);
      // A single `await hook` does not auto-dispose it (only `for await` iterating to
      // completion, or an explicit dispose(), releases the token) — without this, a stale
      // resume() against this same deterministic token could still succeed after the
      // workflow has already moved past this iteration, silently doing nothing real.
      hook.dispose();

      if (result?.reason !== "extend") break; // solved, stopped, or the 5-minute window lapsed

      ttlSeconds += EXTEND_SECONDS;
      await extendInstance(request, EXTEND_SECONDS); // the sandbox's own clock, moved with the workflow's

      activeSeconds = Math.max(EXTEND_SECONDS - EXPIRING_NOTICE_SECONDS, 0);
      expiresAt = new Date(Date.now() + activeSeconds * 1000).toISOString();
      await publishStatus(request, "healthy", url, { expiresAt });
      await sleep(activeSeconds * 1000);
    }
  } catch (error) {
    terminalState = "failed";
    logs = await triageFailure(request);
    url = null;
    throw error;
  } finally {
    // Runs on every exit: the happy path above, an early return, or any step throwing.
    await publishStatus(request, terminalState, url, { logs });
    await reap(request);
  }
}
