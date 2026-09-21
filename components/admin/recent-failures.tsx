import type { PublishedTriage } from "@/lib/types";

export interface FailureRow {
  runId: string;
  challengeId: string | null;
  teamId: string | null;
  failedAt: string;
  triage: PublishedTriage | null;
}

export function RecentFailures({ failures }: { failures: FailureRow[] }) {
  if (failures.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-mono text-sm tracking-[0.3em] text-zinc-500">RECENT FAILURES</h2>
      <div className="flex flex-col divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-950/60">
        {failures.map((row) => (
          <div key={row.runId} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-zinc-200">
                {row.teamId ?? "—"} / {row.challengeId ?? "—"}
              </span>
              {row.triage && (
                <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                  {Math.round(row.triage.confidence * 100)}% confidence
                  {row.triage.retryable ? " · retried" : ""}
                </span>
              )}
            </div>
            {row.triage ? (
              <>
                <p className="font-mono text-xs text-red-300">{row.triage.cause}</p>
                <p className="font-mono text-[11px] text-red-300/60">→ {row.triage.remediation}</p>
              </>
            ) : (
              <p className="font-mono text-xs text-zinc-500">no triage available</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
