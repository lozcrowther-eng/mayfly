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
  /** Ports the challenge listens on — resolved from lib/fixtures/challenges.ts, or straight
   * from the request when a caller supplies its own config (see image below). Either way
   * this is always populated by the time the workflow runs; nothing downstream branches on
   * where it came from. */
  ports: number[];
  /**
   * Optional per-request challenge config, provided directly by a caller that already owns
   * this data (e.g. the CTFd plugin's own MayflyChallengeModel) instead of challengeId
   * needing to match a lib/fixtures/challenges.ts entry. When image is present,
   * RealSandboxClient uses these instead of looking the challenge up by id — see
   * launchInstance() in lib/api/launch.ts and resolveChallengeConfig() in
   * lib/sandbox/real-client.ts.
   */
  image?: string;
  vcpus?: number;
  startCommand?: string;
}

/**
 * Identifies one player-facing challenge instance. challengeId + teamId + runId
 * together form the Sandbox name (`${challengeId}-${teamId}-${runId}`, see CLAUDE.md) —
 * reusing a name resumes a previous player's box, so runId must be fresh per launch.
 */
export interface InstanceRequest extends LaunchInput {
  runId: string;
}

/**
 * The shape of lib/triage.ts's Triage, duplicated rather than imported so this
 * dependency-free base types module doesn't pull in `ai`/`zod` for everything that
 * imports it just to read a run's published state.
 */
export interface PublishedTriage {
  cause: string;
  remediation: string;
  retryable: boolean;
  confidence: number;
}

/** What the workflow publishes to its run's own stream — see app/workflows/instance-lifecycle.ts. */
export interface PublishedStatus {
  challengeId: string;
  teamId: string;
  state: InstanceState;
  url: string | null;
  /** Populated only on "failed", from the sandbox's own log file — see triageFailure. */
  logs?: string;
  /** ISO 8601 — when the current active window ends and the workflow re-enters "expiring". Set on "healthy"/"expiring", null otherwise. */
  expiresAt?: string | null;
  /** Populated only when a health-check exhaustion went through AI triage — see app/workflows/instance-lifecycle.ts. */
  triage?: PublishedTriage;
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
