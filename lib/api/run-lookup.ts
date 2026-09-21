import { getRun } from "workflow/api";
import type { PublishedStatus } from "@/app/workflows/instance-lifecycle";

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

async function readLatestStatus(runId: string): Promise<PublishedStatus | null> {
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
