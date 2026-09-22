import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { getLatestStatus } from "@/lib/api/run-lookup";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const run = getRun(runId);
  if (!(await run.exists)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Reads the run's own stream — see lib/api/run-lookup.ts — so this is correct regardless
  // of which serverless instance handles this request vs. the one that ran the workflow step.
  const status = await getLatestStatus(runId);
  if (!status) {
    return NextResponse.json({ runId, challengeId: null, teamId: null, state: "queued", url: null });
  }

  // Admin's kill-while-healthy path (lib/api/kill-instance.ts) cancels the run directly when
  // there's no hook to resume — the only way to kill an instance that isn't already in its
  // expiry window. cancel() ends execution before the workflow's own `finally` block can
  // publish a final status, so the stream's last chunk is whatever was true before the kill
  // (e.g. "healthy") and stays that way forever. run.status flips to "cancelled" immediately
  // though, so it's the one signal that's actually authoritative once that's happened —
  // treat it as terminal here rather than trusting a stream chunk the kill already made stale.
  const runStatus = await run.status;
  const state = runStatus === "cancelled" && status.state !== "reaped" ? "reaped" : status.state;

  return NextResponse.json({
    runId,
    challengeId: status.challengeId,
    teamId: status.teamId,
    state,
    url: state === "reaped" ? null : status.url,
    logs: status.logs ?? null,
    triage: status.triage ?? null,
  });
}
