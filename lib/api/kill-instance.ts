import { getRun } from "workflow/api";
import { HookNotFoundError } from "workflow/errors";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { ctfdClient, sandboxClient } from "@/lib/clients";
import { getRunIdentity } from "@/lib/api/run-lookup";

/**
 * Admin kill must work regardless of lifecycle state — the player-facing Stop button only
 * works during "expiring" because that's the only window the workflow's own hook exists in
 * (see app/workflows/instance-lifecycle.ts). An operator can't wait for that window, so this
 * doesn't route through the hook as the only mechanism:
 *
 * 1. Try resumeHook first. If the run happens to already be in "expiring", this is the
 *    clean path — the workflow's own finally block does the reap, publishes a final
 *    "reaped" status, and completes itself. Nothing else to do here.
 * 2. If no hook exists (HookNotFoundError — the common case, since most kills happen while
 *    still "healthy"), there is no graceful path to fall back on: reap directly
 *    (sandboxClient.reap()/ctfdClient.markReaped() are idempotent no-ops if there's nothing
 *    to reap, so this is safe even if timed against something else), then cancel the
 *    workflow run so it stops appearing in /admin's "live instances" listing (which reads
 *    world.runs.list({status:'running'})) — otherwise it would keep sleeping in the
 *    background with no sandbox left under it. Deliberately NOT done when (1) succeeds:
 *    the workflow is already mid-cleanup at that point, and cancelling it there would
 *    interrupt that cleanup instead of letting it finish.
 *
 * A run killed via (2) can't publish a final status itself (publishing happens from inside
 * its own step execution, which cancel() ends) — /admin treats a row that drops out of the
 * "running" listing as gone, rather than waiting for a status it will never see.
 */
export async function killInstance(runId: string): Promise<boolean> {
  const identity = await getRunIdentity(runId);
  if (!identity) return false;

  try {
    await lifecycleHook.resume(hookToken(identity), { reason: "stopped" });
    return true; // the workflow's own finally block reaps and terminates itself
  } catch (error) {
    if (!(error instanceof HookNotFoundError)) throw error;
  }

  const request = { ...identity, ttlSeconds: 0, ports: [] };
  await sandboxClient.reap(request);
  await ctfdClient.markReaped(request);
  await getRun(runId).cancel();

  return true;
}
