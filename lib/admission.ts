import { countActive } from "./api/run-lookup";
import type { InstanceRequest } from "./types";

export interface AdmissionLimits {
  teamCap: number;
  globalCap: number;
}

export class AdmissionDeniedError extends Error {}

/**
 * Counts currently-running workflow runs (via lib/api/run-lookup.ts's countActive) rather
 * than keeping its own counter — see CLAUDE.md: "the workflow run is the source of truth
 * for instance state," and the database ban extends to any new stateful system, in-memory
 * ones included. An earlier version of this file kept a globalThis Map/Set instead; that
 * broke on a real multi-instance deployment because the admitInstance and reap steps that
 * wrote to it can land on different serverless instances with no shared memory, so the
 * counts were unreliable exactly when they mattered. There's no `release()` anymore either
 * — once a run leaves "running" status, the next admit() simply stops counting it.
 */
export async function admit(request: InstanceRequest, limits: AdmissionLimits): Promise<void> {
  const { total, perTeam } = await countActive(request.runId);
  const teamActive = perTeam.get(request.teamId) ?? 0;

  if (teamActive >= limits.teamCap) {
    throw new AdmissionDeniedError(
      `team ${request.teamId} already has ${teamActive} live instance(s), cap is ${limits.teamCap}`,
    );
  }
  if (total >= limits.globalCap) {
    throw new AdmissionDeniedError(`global concurrent instance cap (${limits.globalCap}) reached`);
  }
}
