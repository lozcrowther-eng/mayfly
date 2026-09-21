/** Lifecycle states for a challenge instance, driven by the durable workflow run. */
export type InstanceState =
  | "queued"
  | "provisioning"
  | "healthy"
  | "expiring"
  | "reaped"
  | "failed";

/**
 * Identifies one player-facing challenge instance. challengeId + teamId + runId
 * together form the Sandbox name (`${challengeId}-${teamId}-${runId}`, see CLAUDE.md) —
 * reusing a name resumes a previous player's box, so runId must be fresh per launch.
 */
export interface InstanceRequest {
  challengeId: string;
  teamId: string;
  runId: string;
  ttlSeconds: number;
}

export interface InstanceFailure {
  code:
    | "provision_failed"
    | "health_check_failed"
    | "publish_failed"
    | "reap_failed"
    | "timeout";
  message: string;
  occurredAt: string; // ISO 8601
}

export interface InstanceCost {
  vcpus: number;
  memoryMb: number;
  durationMs: number;
  estimatedCostUsd: number;
}

export interface Instance {
  challengeId: string;
  teamId: string;
  runId: string;
  state: InstanceState;
  url: string | null;
  flag: string | null;
  createdAt: string; // ISO 8601
  expiresAt: string | null; // ISO 8601 — when the reaper is scheduled to fire
  reapedAt: string | null; // ISO 8601
  failure: InstanceFailure | null;
  cost: InstanceCost | null;
}
