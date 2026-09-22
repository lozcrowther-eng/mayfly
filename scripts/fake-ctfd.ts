import { sign } from "../lib/hmac";

/**
 * Plays the CTFd plugin's side of the integration — the two HMAC-signed contracts this repo
 * exposes (POST /api/instances to launch, POST /api/webhooks/ctfd/submission on a flag
 * submission) — so the whole lifecycle can be rehearsed against this app before the real
 * plugin (plan §8) exists. `pnpm launch` already covers a quick launch-and-poll smoke test;
 * this covers the part that matters for going live: the signed contract, end to end,
 * including the submission webhook that neither `pnpm launch` nor the demo console at `/`
 * ever exercises (the demo console's /api/launch is deliberately unsigned — a different
 * trust boundary, see that route's comment).
 */
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_TTL_SECONDS = 3600;

// Not part of the CTFd contract — Vercel's own Deployment Protection sits in front of
// preview URLs, orthogonal to mayfly's HMAC auth below. See scripts/launch.ts.
const VERCEL_BYPASS_HEADERS: Record<string, string> = process.env.VERCEL_OIDC_TOKEN
  ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN }
  : {};

function requireSecret(): string {
  const secret = process.env.MAYFLY_SIGNING_SECRET;
  if (!secret) {
    console.error("MAYFLY_SIGNING_SECRET must be set — this is what the real CTFd plugin will sign with too.");
    process.exit(1);
  }
  return secret;
}

/**
 * The one function standing in for the plugin's HMAC client — signs the raw JSON bytes,
 * never a re-serialised object (see CLAUDE.md: json.dumps and JSON.stringify disagree on
 * whitespace and key order), and is shared by every signed command below.
 */
async function signedPost(path: string, body: unknown): Promise<Response> {
  const secret = requireSecret();
  const rawBody = JSON.stringify(body);
  const timestampMs = Date.now();
  const signature = sign(rawBody, secret, timestampMs);

  return fetch(`${APP_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mayfly-timestamp": String(timestampMs),
      "x-mayfly-signature": signature,
      ...VERCEL_BYPASS_HEADERS,
    },
    body: rawBody,
  });
}

interface InstanceStatus {
  runId: string;
  challengeId: string | null;
  teamId: string | null;
  state: string;
  url: string | null;
  logs?: string | null;
  triage?: unknown;
}

async function getStatus(runId: string): Promise<InstanceStatus> {
  const response = await fetch(`${APP_BASE_URL}/api/instances/${runId}`, { headers: VERCEL_BYPASS_HEADERS });
  return (await response.json()) as InstanceStatus;
}

async function launch(challengeId: string, teamId: string, ttlSeconds: number): Promise<string> {
  console.log(`[ctfd plugin] player clicks Launch on ${challengeId} (team ${teamId}, ttl ${ttlSeconds}s)`);
  const response = await signedPost("/api/instances", { challengeId, teamId, ttlSeconds });
  if (!response.ok) {
    throw new Error(`launch failed: ${response.status} ${await response.text()}`);
  }
  const { runId } = (await response.json()) as { runId: string };
  console.log(`[ctfd plugin] runId ${runId} returned immediately — launch never blocked on provisioning`);
  return runId;
}

async function pollUntilUrlOrFailed(runId: string): Promise<InstanceStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getStatus(runId);
    console.log(`  state: ${status.state}${status.url ? ` (${status.url})` : ""}`);
    // Check the URL, not state === "healthy" — same reasoning as scripts/launch.ts: a short
    // TTL can carry a run past healthy into expiring between two polls.
    if (status.url || status.state === "failed") return status;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("timed out waiting for instance to become healthy");
}

async function submit(challengeId: string, teamId: string, correct: boolean): Promise<void> {
  console.log(`[ctfd plugin] team ${teamId} submits a ${correct ? "correct" : "incorrect"} flag for ${challengeId}`);
  const response = await signedPost("/api/webhooks/ctfd/submission", { challengeId, teamId, correct });
  if (!response.ok) {
    throw new Error(`submission webhook failed: ${response.status} ${await response.text()}`);
  }
  console.log(
    correct
      ? "[ctfd plugin] webhook fired — scoreboard revalidates and, if the instance is in its expiry window, resumes as solved"
      : "[ctfd plugin] webhook fired — scoreboard revalidates (score unchanged), nothing else happens",
  );
}

// Both below are unsigned — not part of the CTFd plugin's HMAC contract. They mirror the
// player's browser calling these directly by runId (same trust boundary as /api/launch).
async function extend(runId: string): Promise<void> {
  const response = await fetch(`${APP_BASE_URL}/api/instances/${runId}/extend`, {
    method: "POST",
    headers: VERCEL_BYPASS_HEADERS,
  });
  console.log(`[player browser] Extend clicked -> ${response.status} ${await response.text()}`);
}

async function stop(runId: string): Promise<void> {
  const response = await fetch(`${APP_BASE_URL}/api/instances/${runId}/stop`, {
    method: "POST",
    headers: VERCEL_BYPASS_HEADERS,
  });
  console.log(`[player browser] Stop clicked -> ${response.status} ${await response.text()}`);
}

async function rehearse(challengeId: string, teamId: string, ttlSeconds: number): Promise<void> {
  const runId = await launch(challengeId, teamId, ttlSeconds);
  const launched = await pollUntilUrlOrFailed(runId);

  if (!launched.url) {
    console.log(`[ctfd plugin] instance failed to become healthy — triage: ${JSON.stringify(launched.triage)}`);
    return;
  }
  console.log(`[ctfd plugin] instance is live at ${launched.url}`);

  await submit(challengeId, teamId, false);
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`  state after incorrect submission: ${(await getStatus(runId)).state}`);

  await submit(challengeId, teamId, true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  console.log(`  state after correct submission: ${(await getStatus(runId)).state}`);

  console.log(`\nCheck ${APP_BASE_URL}/scoreboard — ${teamId} should now show points for ${challengeId}.`);
  console.log(`Check ${APP_BASE_URL}/admin — this run should show as solved/reaping.`);
}

function usage(): never {
  console.error(
    [
      "Simulates the real CTFd plugin's side of the integration — signed launch and signed",
      "submission webhook — so the full lifecycle can be rehearsed before CTFd exists.",
      "",
      "Usage:",
      "  pnpm fake-ctfd rehearse <challengeId> <teamId> [ttlSeconds]",
      "      launch -> wait healthy -> submit wrong -> submit correct -> report",
      "  pnpm fake-ctfd launch <challengeId> <teamId> [ttlSeconds]",
      "  pnpm fake-ctfd submit <challengeId> <teamId> <correct|incorrect>",
      "  pnpm fake-ctfd status <runId>",
      "  pnpm fake-ctfd extend <runId>   # unsigned — mirrors the player browser's Extend button",
      "  pnpm fake-ctfd stop <runId>     # unsigned — mirrors the player browser's Stop button",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "rehearse": {
      const [challengeId, teamId, ttlArg] = args;
      if (!challengeId || !teamId) usage();
      await rehearse(challengeId, teamId, ttlArg ? Number(ttlArg) : DEFAULT_TTL_SECONDS);
      return;
    }
    case "launch": {
      const [challengeId, teamId, ttlArg] = args;
      if (!challengeId || !teamId) usage();
      const runId = await launch(challengeId, teamId, ttlArg ? Number(ttlArg) : DEFAULT_TTL_SECONDS);
      const status = await pollUntilUrlOrFailed(runId);
      console.log(status.url ? `Instance URL: ${status.url}` : `Instance failed: ${JSON.stringify(status.triage)}`);
      return;
    }
    case "submit": {
      const [challengeId, teamId, verdict] = args;
      if (!challengeId || !teamId || (verdict !== "correct" && verdict !== "incorrect")) usage();
      await submit(challengeId, teamId, verdict === "correct");
      return;
    }
    case "status": {
      const [runId] = args;
      if (!runId) usage();
      console.log(await getStatus(runId));
      return;
    }
    case "extend": {
      const [runId] = args;
      if (!runId) usage();
      await extend(runId);
      return;
    }
    case "stop": {
      const [runId] = args;
      if (!runId) usage();
      await stop(runId);
      return;
    }
    default:
      usage();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
