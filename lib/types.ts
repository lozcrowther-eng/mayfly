/** Lifecycle states for a challenge instance, driven by the durable workflow run. */
export type InstanceState =
  | "queued"
  | "provisioning"
  | "healthy"
  | "expiring"
  | "reaped"
  | "failed";

/**
 * What the launch endpoint knows before a workflow run exists. runId isn't part of this —
 * it doesn't exist yet; start() assigns it, and the workflow resolves it via
 * getWorkflowMetadata() (see app/workflows/instance-lifecycle.ts) rather than the caller
 * inventing one, so there's exactly one source of truth for the run's identity.
 */
export interface LaunchInput {
  challengeId: string;
  teamId: string;
  ttlSeconds: number;
  /** Ports the challenge listens on, resolved from lib/fixtures/challenges.ts at launch time. */
  ports: number[];
}

/**
 * Identifies one player-facing challenge instance. challengeId + teamId + runId
 * together form the Sandbox name (`${challengeId}-${teamId}-${runId}`, see CLAUDE.md) —
 * reusing a name resumes a previous player's box, so runId must be fresh per launch.
 */
export interface InstanceRequest extends LaunchInput {
  runId: string;
}

/** What the workflow publishes to its run's own stream — see app/workflows/instance-lifecycle.ts. */
export interface PublishedStatus {
  challengeId: string;
  teamId: string;
  state: InstanceState;
  url: string | null;
  /** Populated only on "failed", from the sandbox's own log file — see triageFailure. */
  logs?: string;
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
