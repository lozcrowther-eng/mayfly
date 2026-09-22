import { NextResponse } from "next/server";
import { listLiveInstances, listRecentFailures } from "@/lib/api/run-lookup";
import { estimateCost } from "@/lib/pricing";

const DEFAULT_GLOBAL_CONCURRENCY_CAP = 8;

// Reads live workflow-run state on every request — with Cache Components, that's the
// default for anything without a "use cache" boundary, so there's nothing to opt into here.
export async function GET() {
  const globalCap = Number(process.env.SANDBOX_MAX_CONCURRENT ?? DEFAULT_GLOBAL_CONCURRENCY_CAP);
  const [liveRows, failures] = await Promise.all([listLiveInstances(), listRecentFailures()]);
  const now = Date.now();

  const rows = liveRows.map((row) => {
    // vcpus is resolved once at launch time (lib/api/launch.ts, for both the fixture and
    // caller-supplied-config path) and published by the workflow (see PublishedStatus) --
    // not re-derived here by looking challengeId up in lib/fixtures/challenges.ts, which
    // has no entry for a CTFd-driven challengeId (just an auto-incrementing integer) and
    // silently came back 0 for every real launch.
    const vcpus = row.vcpus ?? 0;
    const elapsedMs = now - new Date(row.createdAt).getTime();
    const cost = estimateCost(vcpus, elapsedMs);
    const ttlRemainingMs = row.expiresAt ? new Date(row.expiresAt).getTime() - now : null;

    return {
      runId: row.runId,
      challengeId: row.challengeId,
      teamId: row.teamId,
      state: row.state,
      url: row.url,
      vcpus,
      elapsedMs,
      ttlRemainingMs,
      cost,
    };
  });

  const totalActiveCpuHours = rows.reduce((sum, row) => sum + row.cost.cpuHours, 0);
  const estimatedSpendUsd = rows.reduce((sum, row) => sum + row.cost.totalUsd, 0);

  return NextResponse.json({
    globalCap,
    instancesLive: rows.length,
    totalActiveCpuHours,
    estimatedSpendUsd,
    capHit: rows.length >= globalCap,
    rows,
    failures,
  });
}
