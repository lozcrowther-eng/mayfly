"use client";

import { ChallengeCard } from "@/components/challenge-card";
import { Input } from "@/components/ui/input";
import { usePersistentState } from "@/hooks/use-persistent-state";
import type { Challenge } from "@/lib/fixtures/challenges";

const DEFAULT_TEAM_ID = "team-1";

export function ChallengeBoard({ challenges }: { challenges: Challenge[] }) {
  // No CTFd session is wired up here — this page stands in for it, so team identity is just
  // a locally-remembered value rather than something derived from an authenticated session.
  const [teamId, setTeamId] = usePersistentState("mayfly:teamId", DEFAULT_TEAM_ID);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-sm tracking-[0.3em] text-zinc-500">CHALLENGE BOARD</h1>
        <label className="flex items-center gap-2">
          <span className="font-mono text-xs tracking-wide text-zinc-500">TEAM</span>
          <Input
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="h-8 w-32 border-zinc-800 bg-black font-mono text-sm text-zinc-100"
          />
        </label>
      </div>

      {/* items-start, not grid's default stretch — otherwise every card in a row inflates
          to match its tallest sibling (confirmed: exactly the "other challenges look too
          big" bug, triggered by the AI triage panel making one card much taller). */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {challenges.map((challenge) => (
          <ChallengeCard key={challenge.id} challenge={challenge} teamId={teamId} />
        ))}
      </div>
    </div>
  );
}
