import type { InstanceRequest } from "./types";

export interface AdmissionLimits {
  teamCap: number;
  globalCap: number;
}

export class AdmissionDeniedError extends Error {}

/**
 * Ephemeral, per-process concurrency tracking — fine for CTFD_MODE=fake, where there's no
 * CTFd to ask "how many instances are live for this team." A real deployment would query
 * CTFd's API (the system of record) for that count instead of keeping it here; this is not
 * the database CLAUDE.md rules out, it's scoped to one dev process the same way the fakes are.
 *
 * Keyed off globalThis because Next.js compiles each route/step bundle separately — a plain
 * module-level Map would give the admitInstance and reap steps their own private copy instead
 * of sharing one (see the same fix in lib/ctfd/fake-store.ts).
 */
interface AdmissionState {
  activeByTeam: Map<string, Set<string>>;
  active: Set<string>;
}

const GLOBAL_KEY = Symbol.for("mayfly.admissionState");

function state(): AdmissionState {
  const g = globalThis as unknown as Record<symbol, AdmissionState | undefined>;
  return (g[GLOBAL_KEY] ??= { activeByTeam: new Map(), active: new Set() });
}

function runKey(request: InstanceRequest): string {
  return `${request.challengeId}:${request.teamId}:${request.runId}`;
}

export function admit(request: InstanceRequest, limits: AdmissionLimits): void {
  const { activeByTeam, active } = state();
  const key = runKey(request);
  const teamRuns = activeByTeam.get(request.teamId) ?? new Set<string>();

  if (teamRuns.size >= limits.teamCap) {
    throw new AdmissionDeniedError(
      `team ${request.teamId} already has ${teamRuns.size} live instance(s), cap is ${limits.teamCap}`,
    );
  }
  if (active.size >= limits.globalCap) {
    throw new AdmissionDeniedError(`global concurrent instance cap (${limits.globalCap}) reached`);
  }

  teamRuns.add(key);
  activeByTeam.set(request.teamId, teamRuns);
  active.add(key);
}

export function release(request: InstanceRequest): void {
  const { activeByTeam, active } = state();
  const key = runKey(request);
  activeByTeam.get(request.teamId)?.delete(key);
  active.delete(key);
}
