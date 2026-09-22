import { FatalError, RetryableError, defineHook, getWorkflowMetadata, getWritable, sleep } from "workflow";
import { AdmissionDeniedError, admit } from "@/lib/admission";
import { getCtfdClient, getSandboxClient } from "@/lib/clients";
import { EXTEND_SECONDS } from "@/lib/constants";
import { triageBootFailure } from "@/lib/triage";
import type { InstanceRequest, InstanceState, LaunchInput, PublishedStatus, PublishedTriage } from "@/lib/types";

const TEAM_CONCURRENCY_CAP = 2;
const DEFAULT_GLOBAL_CONCURRENCY_CAP = 8;
const EXPIRING_NOTICE_SECONDS = 300;
const EXPIRING_GRACE_MS = 5 * 60 * 1000;

export const lifecycleHook = defineHook<{ reason: "solved" | "stopped" | "extend" }>();

/** Only challengeId/teamId/runId are ever needed to address a hook — callers outside the
 * workflow (lib/api/run-lookup.ts) recover exactly these three from the run's own stream,
 * not a full InstanceRequest. */
export function hookToken(request: Pick<InstanceRequest, "challengeId" | "teamId" | "runId">): string {
  return `lifecycle:${request.challengeId}:${request.teamId}:${request.runId}`;
}

async function admitInstance(request: InstanceRequest): Promise<void> {
  "use step";

  const globalCap = Number(process.env.SANDBOX_MAX_CONCURRENT ?? DEFAULT_GLOBAL_CONCURRENCY_CAP);

  try {
    await admit(request, { teamCap: TEAM_CONCURRENCY_CAP, globalCap });
  } catch (error) {
    if (error instanceof AdmissionDeniedError) {
      // A policy rejection, not a transient failure — retrying won't free up capacity.
      throw new FatalError(error.message);
    }
    throw error;
  }
}

/**
 * The run's own stream, not the World/observability step-output APIs (world.steps.list /
 * hydrateResourceIO), is how the app reads state back — see lib/api/run-lookup.ts. Every
 * field a workflow run holds (input, step output, stream frames) is encrypted at rest on
 * Vercel's World by default; the CLI/dashboard can decrypt it for a human with the right
 * project permissions (an explicit, audited action), but that's not a channel this app's
 * own polling route should reach for. getWritable()/getReadable() is the first-class,
 * non-observability path for a workflow to hand data to the rest of the app — the run's
 * own execution context can read it back as plain data with no separate decrypt step.
 */
async function publishStatus(
  request: InstanceRequest,
  state: InstanceState,
  url: string | null,
  opts?: { logs?: string; expiresAt?: string | null; triage?: PublishedTriage },
): Promise<void> {
  "use step";

  const status: PublishedStatus = {
    challengeId: request.challengeId,
    teamId: request.teamId,
    state,
    url,
    vcpus: request.vcpus,
    logs: opts?.logs,
    expiresAt: opts?.expiresAt ?? null,
    triage: opts?.triage,
  };
  const writer = getWritable<PublishedStatus>().getWriter();
  try {
    await writer.write(status);
  } finally {
    writer.releaseLock();
  }
}

async function mintFlag(request: InstanceRequest): Promise<string> {
  "use step";
  return getCtfdClient().mintFlag(request);
}

async function createSandbox(request: InstanceRequest, flag: string): Promise<string> {
  "use step";
  const { url } = await getSandboxClient().create(request, flag);
  return url;
}

async function waitForHealthy(request: InstanceRequest): Promise<void> {
  "use step";

  try {
    await getSandboxClient().healthUrl(request);
  } catch (error) {
    // Boot-time race, not a permanent failure — the step retry policy backs off and tries again.
    // Keep the underlying error's detail (e.g. curl output) instead of a generic message —
    // that detail is what makes a real boot failure distinguishable from a slow one in logs.
    const detail = error instanceof Error ? error.message : String(error);
    throw new RetryableError(`sandbox for ${request.runId} not yet healthy: ${detail}`);
  }
}

async function publishReady(request: InstanceRequest, url: string, expiresAt: string | null): Promise<void> {
  "use step";
  await getCtfdClient().publishUrl(request, url, expiresAt);
}

async function notifyExpiring(request: InstanceRequest): Promise<void> {
  "use step";
  console.log(
    `[mayfly] instance expiring soon: ${request.challengeId}/${request.teamId}/${request.runId}`,
  );
}

/**
 * Moves the sandbox's own clock forward — CLAUDE.md: "On extend, call sandbox.extendTimeout()
 * as well as extending the sleep — move both clocks." Returns what was actually granted:
 * the sandbox's own platform session cap (see real-client.ts) can mean this is less than
 * requested, or 0 once the cap is reached, and the workflow's own ttlSeconds/expiresAt must
 * grow by that real number rather than by whatever was merely asked for — growing them by
 * the request instead of the grant is exactly the mismatch CLAUDE.md's "two clocks, never
 * equal" invariant warns about, just introduced by extend rather than by create.
 */
async function extendInstance(
  request: InstanceRequest,
  extraSeconds: number,
  currentTtlSeconds: number,
): Promise<number> {
  "use step";
  return getSandboxClient().extendTimeout(request, extraSeconds, currentTtlSeconds);
}

/**
 * Reads whatever the sandbox logged before things went wrong. "The detached command
 * handle," per CLAUDE.md's phrasing, is a live object from the createSandbox step's own
 * invocation; it cannot cross into this, a later and separate step invocation. What *does*
 * cross that boundary is the durable log file on the sandbox's own filesystem (LOG_PATH in
 * real-client.ts) that the detached command was launched with its output redirected into —
 * readLogs() re-fetches the sandbox by its deterministic name and reads that file, which is
 * the cross-invocation-safe equivalent of "keeping a reference" in an execution model where
 * steps don't share memory. Used both as the raw log fallback for non-health-check failures
 * and as the AI triage's input for health-check exhaustion (see triageHealthCheckFailure).
 */
async function captureBootOutput(request: InstanceRequest): Promise<string> {
  "use step";
  return getSandboxClient().readLogs(request).catch(() => "");
}

/**
 * Only called after waitForHealthy's own step-level retries are exhausted (the default 3
 * retries backing off on RetryableError) — a sustained failure, not a boot-time blip, so
 * it's worth spending an LLM call on. One step, not two: the boot output and the triage of
 * it are always needed together, and bundling them means the eval script
 * (scripts/eval-triage.ts) exercises the exact same triageBootFailure() this step calls,
 * just without the sandbox-log read in front of it.
 */
async function triageHealthCheckFailure(request: InstanceRequest): Promise<{ logs: string; triage: PublishedTriage }> {
  "use step";
  const logs = await getSandboxClient().readLogs(request).catch(() => "");
  const triage = await triageBootFailure(logs);
  return { logs, triage };
}

async function reap(request: InstanceRequest): Promise<void> {
  "use step";

  // Both fakes are idempotent no-ops for an instance that was never created/minted, so this
  // is always safe to call regardless of how far the workflow got before failing.
  await getSandboxClient().reap(request);
  await getCtfdClient().markReaped(request);
}

export async function instanceLifecycle(input: LaunchInput): Promise<void> {
  "use workflow";

  // The run's own id, not one minted by the launch endpoint — see lib/types.ts (LaunchInput).
  // getRun(request.runId) from any API route then always resolves this exact run, with no
  // separate correlation table to keep in sync (and no risk of it living on a different
  // serverless instance than whatever reads it back).
  const { workflowRunId } = getWorkflowMetadata();
  const request: InstanceRequest = { ...input, runId: workflowRunId };

  let url: string | null = null;
  let terminalState: "reaped" | "failed" = "reaped";
  let logs: string | undefined;
  let triage: PublishedTriage | undefined;

  try {
    // Inside the try, not before it: an admission rejection is a real terminal outcome
    // (the run stays otherwise silent — no publishStatus, no reap — if this throws outside
    // the block that's actually responsible for reporting failure and cleaning up).
    await admitInstance(request);

    const flag = await mintFlag(request);
    await publishStatus(request, "provisioning", null);

    url = await createSandbox(request, flag);

    // Two attempts at most: waitForHealthy's own step-level retries (RetryableError, ~3
    // backoffs) already absorb ordinary boot-time races. Reaching this loop at all means
    // those were exhausted — a sustained failure worth spending an LLM call to diagnose,
    // and worth one full createSandbox retry only if the AI triage itself says the boot
    // output looks transient. Anything it calls non-retryable, or a second exhaustion,
    // fails for good.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await waitForHealthy(request);
        break;
      } catch {
        const result = await triageHealthCheckFailure(request);
        logs = result.logs;
        triage = result.triage;

        if (attempt === 1 && triage.retryable) {
          url = await createSandbox(request, flag);
          continue;
        }

        throw new FatalError(`health check failed: ${triage.cause}`);
      }
    }

    // This replaces a Kubernetes reaper CronJob. There is no external process that has to
    // notice the instance is old and go find it: this sleep is a continuation of the exact
    // run that created the sandbox, so the reap() in `finally` is guaranteed to fire even if
    // the workflow backend restarts in the meantime — durability, not a scheduler, is the reaper.
    let ttlSeconds = request.ttlSeconds;
    let activeSeconds = Math.max(ttlSeconds - EXPIRING_NOTICE_SECONDS, 0);
    // Date.now() is workflow-safe (the docs explicitly allow seeded time/random APIs here);
    // this is what /admin's TTL-remaining column counts down to, published alongside state
    // so it survives a page refresh without the client needing its own copy of ttlSeconds.
    let expiresAt = new Date(Date.now() + activeSeconds * 1000).toISOString();
    await publishReady(request, url, expiresAt);
    await publishStatus(request, "healthy", url, { expiresAt });

    // The hook is live for the whole healthy period, not only once "expiring" — a player
    // solving, or an operator killing from /admin, ends the run right away regardless of
    // how much TTL is left, rather than waiting out whatever happens to remain. TTL expiry
    // with nobody touching anything is still the most common exit in practice — that's the
    // `!notifiedExpiring` timeout branch below, the same two-phase shape as before, just
    // merged into one loop so the hook is never unavailable between phases.
    let notifiedExpiring = false;

    for (;;) {
      const hook = lifecycleHook.create({ token: hookToken(request) });
      // Both branches are plain milliseconds (not "5 minutes" as a string literal) so this
      // ternary stays a single `number` — sleep's overloads don't resolve for a union type.
      const result = await Promise.race([hook, sleep(notifiedExpiring ? EXPIRING_GRACE_MS : activeSeconds * 1000)]);
      // A single `await hook` does not auto-dispose it (only `for await` iterating to
      // completion, or an explicit dispose(), releases the token) — without this, a stale
      // resume() against this same deterministic token could still succeed after the
      // workflow has already moved past this iteration, silently doing nothing real.
      hook.dispose();

      if (result?.reason === "extend") {
        // Ask before growing our own tally, not after -- currentTtlSeconds is what
        // extendInstance needs to know how much headroom is left against the sandbox's
        // platform session cap (see real-client.ts). grantedSeconds can be less than
        // EXTEND_SECONDS, or 0 once that cap is reached.
        const grantedSeconds = await extendInstance(request, EXTEND_SECONDS, ttlSeconds);
        if (grantedSeconds > 0) {
          ttlSeconds += grantedSeconds;
          // Add to whatever's actually still remaining, not the bare granted delta — the
          // previous version replaced activeSeconds with just this, so clicking Extend with
          // e.g. 24 minutes left could make the countdown drop to ~4 (confirmed: this is
          // exactly what "extend goes from 24 mins to approx 4 mins" was).
          const remainingActiveMs = Math.max(new Date(expiresAt).getTime() - Date.now(), 0);
          activeSeconds = Math.floor(remainingActiveMs / 1000) + grantedSeconds;
          expiresAt = new Date(Date.now() + activeSeconds * 1000).toISOString();
          notifiedExpiring = false;
          await publishReady(request, url, expiresAt); // keeps CTFd's own countdown current too
          await publishStatus(request, "healthy", url, { expiresAt });
        }
        // grantedSeconds === 0: already at the platform's session cap. Nothing to grow --
        // leave state/expiresAt as they were rather than publishing a no-op "healthy" that
        // implies more time was actually added.
        continue;
      }

      if (result) break; // solved or stopped — end the run now, whichever phase it was in

      if (!notifiedExpiring) {
        // The healthy window ran out with no interaction — enter the renewable grace
        // period: notify once, then give up to 5 more minutes for a late solve/extend
        // before the next timeout through here gives up for good.
        notifiedExpiring = true;
        await notifyExpiring(request);
        await publishStatus(request, "expiring", url, { expiresAt });
        continue;
      }

      break; // already in the grace period, and it lapsed too — give up
    }
  } catch (error) {
    terminalState = "failed";
    // Only for failures that never went through triageHealthCheckFailure (admission
    // rejection, mintFlag failure, a hook-loop error) — that path already captured logs
    // (and an AI triage) itself, so this would otherwise be a redundant second log read.
    if (logs === undefined) {
      // captureBootOutput needs a sandbox to already exist to read anything from it — a
      // failure here that happened before createSandbox ever succeeded (a transient
      // createSandbox-level error, not a health-check timeout) has nothing to read and
      // comes back empty. Fall back to the thrown error's own message so a real failure at
      // that point is still visible instead of publishing completely blank diagnostics.
      const captured = await captureBootOutput(request);
      logs = captured || `create failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    url = null;
    throw error;
  } finally {
    // Runs on every exit: the happy path above, an early return, or any step throwing.
    await publishStatus(request, terminalState, url, { logs, triage });
    await reap(request);
  }
}
