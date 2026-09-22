import { NextResponse } from "next/server";
import { HookNotFoundError } from "workflow/errors";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { getRunIdentity } from "@/lib/api/run-lookup";

/**
 * Shared by /stop and /extend: both just resume the same lifecycleHook with a different
 * reason. The hook is live for the whole run, from just after it goes healthy until reap
 * (see instance-lifecycle.ts) — but there's a brief window on every loop iteration between
 * one hook's dispose() and the next one's create() where no hook exists yet, and resuming
 * a run that's already terminal (reaped/failed) hits the same case. Either way this is a
 * 409, not a 404 — the run exists, it's just not currently waiting on this hook. resume()
 * throws HookNotFoundError for that case rather than returning null (contrary to
 * defineHook's documented `Promise<HookEntity | null>` return type) — verified against the
 * installed SDK by actually triggering it, not assumed from the docs.
 */
export async function resumeLifecycle(
  runId: string,
  reason: "stopped" | "extend",
): Promise<NextResponse> {
  const identity = await getRunIdentity(runId);
  if (!identity) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await lifecycleHook.resume(hookToken(identity), { reason });
  } catch (error) {
    if (error instanceof HookNotFoundError) {
      return NextResponse.json(
        { error: "instance is not currently in its expiry window" },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
