import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { getCtfdClient } from "@/lib/clients";
import type { ScoreboardEntry } from "@/lib/ctfd/client";

/**
 * The one player-facing route this repo actually renders (see next.config.ts's rewrites —
 * everything else on this domain proxies straight through to CTFd). It's a deliberate
 * demonstration of Cache Components' three-way split:
 *
 *  - STATIC:  the header below — no runtime or cached data at all, so it's prerendered at
 *             build time and served from the edge with zero per-request cost.
 *  - CACHED:  getScores()'s return value, tagged "scoreboard" — most requests are served
 *             straight from cache with no CTFd round trip.
 *  - DYNAMIC (via Suspense): <ScoreboardTable>, which awaits that cached call. It's wrapped
 *             in Suspense not because its data is uncached, but because a cache miss (right
 *             after an invalidation) still means a real fetch — Suspense lets the static
 *             shell above paint instantly while only the table waits on that fetch.
 */
export default function ScoreboardPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Scoreboard</h1>
        <p className="text-sm text-muted-foreground">
          Rendered by Vercel — every other path on this domain proxies through to CTFd.
        </p>
      </header>

      <Suspense fallback={<ScoreboardSkeleton />}>
        <ScoreboardTable />
      </Suspense>
    </div>
  );
}

async function ScoreboardTable() {
  const scores = await getScores();

  if (scores.length === 0) {
    return <p className="text-sm text-muted-foreground">No solves yet.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
          <th className="py-2 pr-4 font-medium">Rank</th>
          <th className="py-2 pr-4 font-medium">Team</th>
          <th className="py-2 text-right font-medium">Score</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((entry, i) => (
          <tr key={entry.teamId} className="border-b border-border/60 text-foreground last:border-0">
            <td className="py-2 pr-4 tabular-nums text-muted-foreground">{i + 1}</td>
            <td className="py-2 pr-4 font-medium">{entry.teamId}</td>
            <td className="py-2 text-right tabular-nums">{entry.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The old shape of this read was a query against CTFd's regional MySQL, likely sitting
 * behind a per-instance Redis cache with a time-based TTL — every instance guesses how long
 * "fresh enough" is, and a real solve still waits out that TTL before anyone sees it move.
 *
 * This replaces that with a single edge cache, invalidated on the event that actually
 * changes the data: the CTFd submission webhook calls
 * `revalidateTag("scoreboard", { expire: 0 })` (app/api/webhooks/ctfd/submission/route.ts)
 * the instant a submission lands, correct or not, forcing the very next read to miss and
 * refetch rather than serve anything stale. `cacheLife("minutes")` is only the *backstop*
 * for a revalidation that never arrives — the tag is what actually keeps this fresh in the
 * common case.
 */
async function getScores(): Promise<ScoreboardEntry[]> {
  "use cache";
  cacheTag("scoreboard");
  cacheLife("minutes");
  return getCtfdClient().getScoreboard();
}

function ScoreboardSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
