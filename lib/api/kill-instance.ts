import { getRun } from "workflow/api";
import { HookNotFoundError } from "workflow/errors";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { getCtfdClient, getSandboxClient } from "@/lib/clients";
import { getRunIdentity } from "@/lib/api/run-lookup";

/**
 * Admin kill must work even in the rare case the hook genuinely isn't there — the
 * lifecycleHook is live for essentially the whole run (see app/workflows/instance-
 * lifecycle.ts), but there's a narrow window on every loop iteration between one hook's
 * dispose() and the next one's create() where resuming would hit HookNotFoundError, and an
 * operator can't be made to wait for that window to pass. So this doesn't route through the
 * hook as the only mechanism:
 *
 * 1. Try resumeHook first. This is the overwhelmingly common path now that the hook covers
 *    the healthy period too, not just "expiring" — the workflow's own finally block does
 *    the reap, publishes a final "reaped" status, and completes itself. Nothing else to do.
 * 2. If no hook exists (HookNotFoundError — the narrow race above, or the run is already
 *    terminal), there is no graceful path to fall back on: reap directly
 *    (getSandboxClient().reap()/getCtfdClient().markReaped() are idempotent no-ops if there's nothing
 *    to reap, so this is safe even if timed against something else), then cancel the
 *    workflow run so it stops appearing in /admin's "live instances" listing (which reads
 *    world.runs.list({status:'running'})) — otherwise it would keep sleeping in the
 *    background with no sandbox left under it. Deliberately NOT done when (1) succeeds:
 *    the workflow is already mid-cleanup at that point, and cancelling it there would
 *    interrupt that cleanup instead of letting it finish.
 *
 * A run killed via (2) can't publish a final status itself (publishing happens from inside
 * its own step execution, which cancel() ends) — app/api/instances/[runId]/route.ts checks
 * run.status directly for exactly this case, and /admin treats a row that drops out of the
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
  await getSandboxClient().reap(request);
  await getCtfdClient().markReaped(request);
  await getRun(runId).cancel();

  return true;
}
