import { getRun } from "workflow/api";
import type { PublishedStatus, PublishedTriage } from "@/lib/types";

/**
 * Reads back what the workflow itself published to its run's stream (see
 * app/workflows/instance-lifecycle.ts's publishStatus step) — not the World/observability
 * step-output APIs. Every field a workflow run holds — input, step output, stream frames —
 * is encrypted at rest on Vercel's World by default; world.steps.list()/hydrateResourceIO()
 * hand back ciphertext unless the caller has separate, audited decrypt permission (the
 * CLI/dashboard's `--decrypt` flow). getReadable() is the first-class, non-observability
 * channel a workflow uses to hand data to the rest of the app, so it comes back as plain
 * data with no extra step — this replaced an earlier design that read step output via the
 * World APIs directly and got ciphertext back.
 *
 * A short timeout, not an unbounded await, bounds each read: nothing has been published yet
 * before the mintFlag step runs, and the stream has no more chunks to deliver at that point,
 * so a read would otherwise hang waiting for a chunk that isn't coming until later.
 */
const READ_TIMEOUT_MS = 500;

/** Just enough to address a hook or answer a status query — see hookToken in instance-lifecycle.ts. */
export interface RunIdentity {
  challengeId: string;
  teamId: string;
  runId: string;
}

export async function readLatestStatus(runId: string): Promise<PublishedStatus | null> {
  let stream: ReturnType<ReturnType<typeof getRun>["getReadable"]>;
  try {
    stream = getRun(runId).getReadable<PublishedStatus>({ startIndex: -1 });
  } catch {
    return null;
  }

  const reader = stream.getReader();
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<PublishedStatus>>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), READ_TIMEOUT_MS),
      ),
    ]);
    return (result.value as PublishedStatus | undefined) ?? null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function getRunIdentity(runId: string): Promise<RunIdentity | null> {
  const run = getRun(runId);
  if (!(await run.exists)) return null;

  const status = await readLatestStatus(runId);
  if (!status) return null; // nothing published yet — provisioning hasn't started

  return { challengeId: status.challengeId, teamId: status.teamId, runId };
}

export async function getLatestStatus(runId: string): Promise<PublishedStatus | null> {
  return readLatestStatus(runId);
}

/**
 * There's no index from (challengeId, teamId) to a run id — CTFd's submission webhook only
 * knows the challenge and team. "One sandbox per team per challenge" (CLAUDE.md) makes a
 * linear scan over currently-running instances well-defined; this app's scale (a CTF
 * event's concurrent instances, capped by SANDBOX_MAX_CONCURRENT) makes it cheap enough to
 * skip building a real index for.
 */
export async function findRunningInstance(challengeId: string, teamId: string): Promise<RunIdentity | null> {
  const { getWorld } = await import("workflow/runtime");
  const world = getWorld();
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    // Metadata-only listing (resolveData: "none") — run/step listing is used here only to
    // enumerate candidate run ids; matching itself still reads plaintext via each
    // candidate's own stream (readLatestStatus), never via decrypted World I/O.
    const { data, cursor: next } = await world.runs.list({
      status: "running",
      pagination: { cursor, limit: 50 },
      resolveData: "none",
    });

    for (const run of data) {
      const status = await readLatestStatus(run.runId);
      if (status?.challengeId === challengeId && status?.teamId === teamId) {
        return { challengeId, teamId, runId: run.runId };
      }
    }

    if (!next) break;
    cursor = next;
  }

  return null;
}

export interface ActiveCounts {
  total: number;
  perTeam: Map<string, number>;
}

/**
 * Backs the admission check (lib/admission.ts) — counts currently-running workflow runs
 * instead of a separately-maintained counter, so "how many instances are live" has exactly
 * one source of truth (the workflow run) rather than a second store that can drift from it.
 * excludeRunId omits the run doing the counting: start() has already created it, so without
 * this every admission check would count itself and over-reject by one.
 *
 * A run that hasn't published anything yet (still inside admitInstance/mintFlag) can't be
 * attributed to a team via its stream — it's counted toward `total` but not `perTeam`. That
 * narrow window is an accepted imprecision, not a correctness gap: the alternative is a
 * separate store, which is the exact thing being removed here.
 */
export async function countActive(excludeRunId: string): Promise<ActiveCounts> {
  const { getWorld } = await import("workflow/runtime");
  const world = getWorld();
  let cursor: string | undefined;
  let total = 0;
  const perTeam = new Map<string, number>();

  for (let page = 0; page < 20; page++) {
    const { data, cursor: next } = await world.runs.list({
      workflowName: "workflow//./app/workflows/instance-lifecycle//instanceLifecycle",
      status: "running",
      pagination: { cursor, limit: 50 },
      resolveData: "none",
    });

    for (const run of data) {
      if (run.runId === excludeRunId) continue;
      total += 1;
      const status = await readLatestStatus(run.runId);
      if (status) perTeam.set(status.teamId, (perTeam.get(status.teamId) ?? 0) + 1);
    }

    if (!next) break;
    cursor = next;
  }

  return { total, perTeam };
}

export interface LiveInstanceRow {
  runId: string;
  challengeId: string | null;
  teamId: string | null;
  state: PublishedStatus["state"] | "queued";
  url: string | null;
  createdAt: string; // ISO 8601 — run metadata, never encrypted (see readLatestStatus's comment)
  expiresAt: string | null;
  vcpus: number | null;
}

/**
 * Backs /admin. `createdAt` comes straight off the run listing (unencrypted metadata,
 * confirmed in the same audit that moved lib/admission.ts off decrypted World I/O for
 * everything else) — only challengeId/teamId/state/url/expiresAt need the per-run stream
 * read, same as everywhere else in this file.
 */
export async function listLiveInstances(): Promise<LiveInstanceRow[]> {
  const { getWorld } = await import("workflow/runtime");
  const world = getWorld();
  let cursor: string | undefined;
  const rows: LiveInstanceRow[] = [];

  for (let page = 0; page < 20; page++) {
    const { data, cursor: next } = await world.runs.list({
      workflowName: "workflow//./app/workflows/instance-lifecycle//instanceLifecycle",
      status: "running",
      pagination: { cursor, limit: 50 },
      resolveData: "none",
    });

    for (const run of data) {
      const status = await readLatestStatus(run.runId);
      rows.push({
        runId: run.runId,
        challengeId: status?.challengeId ?? null,
        teamId: status?.teamId ?? null,
        state: status?.state ?? "queued",
        url: status?.url ?? null,
        createdAt: new Date(run.createdAt).toISOString(),
        expiresAt: status?.expiresAt ?? null,
        vcpus: status?.vcpus ?? null,
      });
    }

    if (!next) break;
    cursor = next;
  }

  return rows;
}

export interface FailedInstanceRow {
  runId: string;
  challengeId: string | null;
  teamId: string | null;
  failedAt: string; // ISO 8601
  triage: PublishedTriage | null;
}

/**
 * Recent, terminal runs — kept separate from listLiveInstances() rather than merged into
 * one table: a failed run isn't accruing cost anymore, so it has no place in a listing
 * whose header stats (active CPU-hours, estimated spend) are meant to describe currently-
 * billable resources. A run's stream stays readable after it completes (streams are part
 * of the durable event log, not tied to the workflow still executing), so the same
 * readLatestStatus() this file uses everywhere else works unchanged here.
 */
export async function listRecentFailures(limit = 20): Promise<FailedInstanceRow[]> {
  const { getWorld } = await import("workflow/runtime");
  const world = getWorld();

  const { data } = await world.runs.list({
    workflowName: "workflow//./app/workflows/instance-lifecycle//instanceLifecycle",
    status: "failed",
    pagination: { limit },
    resolveData: "none",
  });

  const rows: FailedInstanceRow[] = [];
  for (const run of data) {
    const status = await readLatestStatus(run.runId);
    rows.push({
      runId: run.runId,
      challengeId: status?.challengeId ?? null,
      teamId: status?.teamId ?? null,
      failedAt: new Date(run.completedAt ?? run.updatedAt).toISOString(),
      triage: status?.triage ?? null,
    });
  }

  return rows;
}
