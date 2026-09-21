import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { fakeInstanceStatus } from "@/lib/ctfd/fake-store";
import { getRunRecord } from "@/lib/runs";
import type { InstanceState } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const record = getRunRecord(runId);
  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const run = getRun(record.sdkRunId);
  if (!(await run.exists)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // The SDK only tracks coarse workflow status (running/completed/failed). CTFD_MODE=fake's
  // store gives us the finer-grained signal (minted vs. published) needed to distinguish
  // 'queued' / 'provisioning' / 'healthy' while the run is still 'running'. A real deployment
  // would get this detail from CTFd's own API instead — not a new stateful system.
  const status = await run.status;
  const ctfd = process.env.CTFD_MODE === "fake" ? fakeInstanceStatus(record.request) : null;

  let state: InstanceState;
  if (status === "failed") {
    state = "failed";
  } else if (status === "completed") {
    state = "reaped";
  } else if (ctfd?.url) {
    state = "healthy";
  } else if (ctfd) {
    state = "provisioning";
  } else {
    state = "queued";
  }

  return NextResponse.json({
    runId,
    challengeId: record.request.challengeId,
    teamId: record.request.teamId,
    state,
    url: ctfd?.url ?? null,
  });
}
