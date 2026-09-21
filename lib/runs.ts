import type { InstanceRequest } from "./types";

interface RunRecord {
  sdkRunId: string;
  request: InstanceRequest;
}

/**
 * Correlates our own domain runId (the one CTFd and players see) with the Workflow SDK's
 * internal run id, plus a reverse index by (challengeId, teamId) so the CTFd submission
 * webhook — which only knows the challenge and team, not our runId — can find the right hook
 * to resume. Ephemeral and in-memory, not the database CLAUDE.md rules out: CTFd remains the
 * system of record for the challenge/team/flag data itself, this just indexes live run ids
 * for one process, the same way lib/admission.ts and lib/ctfd/fake-store.ts do.
 *
 * Keyed off globalThis because Next.js compiles each route bundle separately (see the same
 * fix in lib/ctfd/fake-store.ts).
 */
interface RunIndexState {
  byRunId: Map<string, RunRecord>;
  byChallengeTeam: Map<string, string>; // "challengeId:teamId" -> runId
}

const GLOBAL_KEY = Symbol.for("mayfly.runIndex");

function state(): RunIndexState {
  const g = globalThis as unknown as Record<symbol, RunIndexState | undefined>;
  return (g[GLOBAL_KEY] ??= { byRunId: new Map(), byChallengeTeam: new Map() });
}

function challengeTeamKey(challengeId: string, teamId: string): string {
  return `${challengeId}:${teamId}`;
}

export function recordRun(request: InstanceRequest, sdkRunId: string): void {
  const { byRunId, byChallengeTeam } = state();
  byRunId.set(request.runId, { sdkRunId, request });
  byChallengeTeam.set(challengeTeamKey(request.challengeId, request.teamId), request.runId);
}

export function getRunRecord(runId: string): RunRecord | undefined {
  return state().byRunId.get(runId);
}

export function getRunRecordByChallengeTeam(challengeId: string, teamId: string): RunRecord | undefined {
  const runId = state().byChallengeTeam.get(challengeTeamKey(challengeId, teamId));
  return runId ? state().byRunId.get(runId) : undefined;
}
