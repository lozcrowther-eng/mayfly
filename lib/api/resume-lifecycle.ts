import { NextResponse } from "next/server";
import { HookNotFoundError } from "workflow/errors";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { getRunIdentity } from "@/lib/api/run-lookup";

/**
 * Shared by /stop and /extend: both just resume the same lifecycleHook with a different
 * reason. The hook only exists once the workflow reaches its post-TTL expiry window (see
 * instance-lifecycle.ts), so resuming earlier or after it's already been resumed is a 409,
 * not a 404 — the run exists, it's just not currently waiting on this hook. resume() throws
 * HookNotFoundError for that case rather than returning null (contrary to defineHook's
 * documented `Promise<HookEntity | null>` return type) — verified against the installed
 * SDK by actually triggering it, not assumed from the docs.
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
