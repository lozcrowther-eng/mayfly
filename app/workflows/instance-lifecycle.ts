import { FatalError, RetryableError, defineHook, sleep } from "workflow";
import { AdmissionDeniedError, admit, release } from "@/lib/admission";
import { ctfdClient, sandboxClient } from "@/lib/clients";
import type { InstanceRequest } from "@/lib/types";

const TEAM_CONCURRENCY_CAP = 2;
const DEFAULT_GLOBAL_CONCURRENCY_CAP = 8;
const EXPIRING_NOTICE_SECONDS = 300;

export const lifecycleHook = defineHook<{ reason: "solved" | "stopped" | "extend" }>();

export function hookToken(request: InstanceRequest): string {
  return `lifecycle:${request.challengeId}:${request.teamId}:${request.runId}`;
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

async function mintFlag(request: InstanceRequest): Promise<string> {
  "use step";
  return ctfdClient.mintFlag(request);
}

async function createSandbox(request: InstanceRequest): Promise<string> {
  "use step";
  const { url } = await sandboxClient.create(request);
  return url;
}

async function waitForHealthy(request: InstanceRequest): Promise<void> {
  "use step";

  try {
    await sandboxClient.healthUrl(request);
  } catch {
    // Boot-time race, not a permanent failure — the step retry policy backs off and tries again.
    throw new RetryableError(`sandbox for ${request.runId} not yet healthy`);
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

export async function instanceLifecycle(request: InstanceRequest): Promise<void> {
  "use workflow";

  await admitInstance(request);

  try {
    await mintFlag(request);
    const url = await createSandbox(request);
    await waitForHealthy(request);
    await publishReady(request, url);

    const activeSeconds = Math.max(request.ttlSeconds - EXPIRING_NOTICE_SECONDS, 0);
    // This replaces a Kubernetes reaper CronJob. There is no external process that has to
    // notice the instance is old and go find it: this sleep is a continuation of the exact
    // run that created the sandbox, so the reap() in `finally` is guaranteed to fire even if
    // the workflow backend restarts in the meantime — durability, not a scheduler, is the reaper.
    await sleep(activeSeconds * 1000);

    await notifyExpiring(request);

    const hook = lifecycleHook.create({ token: hookToken(request) });

    // TTL expiry — this sleep winning the race — is the most common exit in practice.
    // Players abandon challenge instances without ever pressing "Stop," so most runs end
    // here, not because someone solved or explicitly stopped the challenge.
    await Promise.race([hook, sleep("5 minutes")]);
  } finally {
    // Runs on every exit: the happy path above, an early return, or any step throwing.
    await reap(request);
  }
}
