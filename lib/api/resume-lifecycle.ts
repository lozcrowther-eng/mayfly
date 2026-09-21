import { NextResponse } from "next/server";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { getRunIdentity } from "@/lib/api/run-lookup";

/**
 * Shared by /stop and /extend: both just resume the same lifecycleHook with a different
 * reason. The hook only exists once the workflow reaches its post-TTL expiry window (see
 * instance-lifecycle.ts), so resuming earlier or after it's already been resumed is a 409,
 * not a 404 — the run exists, it's just not currently waiting on this hook.
 */
export async function resumeLifecycle(
  runId: string,
  reason: "stopped" | "extend",
): Promise<NextResponse> {
  const identity = await getRunIdentity(runId);
  if (!identity) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await lifecycleHook.resume(hookToken(identity), { reason });
  if (!result) {
    return NextResponse.json(
      { error: "instance is not currently in its expiry window" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
