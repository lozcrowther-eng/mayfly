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

  return NextResponse.json({
    runId,
    challengeId: status.challengeId,
    teamId: status.teamId,
    state: status.state,
    url: status.url,
    logs: status.logs ?? null,
    triage: status.triage ?? null,
  });
}
