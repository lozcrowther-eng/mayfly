import { sign } from "../lib/hmac";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
// 30 min, not 1h — RealSandboxClient adds a 300s grace buffer on top of this (see
// lib/sandbox/real-client.ts's GRACE_SECONDS), and Vercel Hobby plans cap sandbox sessions
// at 45 min total, so a 1h default would 400 on create() before ever reaching the sandbox
// (confirmed by hitting exactly this with SANDBOX_MODE=real and no ttlSeconds argument).
const DEFAULT_TTL_SECONDS = 1800;

// Not part of the CTFd plugin's contract — Vercel's own Deployment Protection sits in front
// of preview URLs, orthogonal to mayfly's HMAC auth below. This lets `pnpm launch` reach a
// protected preview from local dev; the real CTFd plugin talks to production, which isn't
// behind this wall.
const VERCEL_BYPASS_HEADERS: Record<string, string> = process.env.VERCEL_OIDC_TOKEN
  ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN }
  : {};

function usage(): never {
  console.error("Usage: pnpm launch <challengeId> <teamId> [ttlSeconds]");
  process.exit(1);
}

async function main() {
  const [challengeId, teamId, ttlArg] = process.argv.slice(2);
  if (!challengeId || !teamId) usage();

  const secret = process.env.MAYFLY_SIGNING_SECRET;
  if (!secret) {
    console.error("MAYFLY_SIGNING_SECRET must be set — this is what the CTFd plugin will sign with too.");
    process.exit(1);
  }

  const ttlSeconds = ttlArg ? Number(ttlArg) : DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    console.error(`Invalid ttlSeconds: ${ttlArg}`);
    process.exit(1);
  }

  // Signs the raw JSON bytes, exactly as the CTFd plugin will — never a re-serialised
  // object, since json.dumps and JSON.stringify disagree on whitespace and key order.
  const rawBody = JSON.stringify({ challengeId, teamId, ttlSeconds });
  const timestampMs = Date.now();
  const signature = sign(rawBody, secret, timestampMs);

  console.log(`Launching ${challengeId} for ${teamId} (ttl ${ttlSeconds}s)...`);

  const launchResponse = await fetch(`${APP_BASE_URL}/api/instances`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mayfly-timestamp": String(timestampMs),
      "x-mayfly-signature": signature,
      ...VERCEL_BYPASS_HEADERS,
    },
    body: rawBody,
  });

  if (!launchResponse.ok) {
    console.error(`Launch failed: ${launchResponse.status} ${await launchResponse.text()}`);
    process.exit(1);
  }

  const { runId, runToken } = (await launchResponse.json()) as { runId: string; runToken: string };
  console.log(`runId: ${runId}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${APP_BASE_URL}/api/instances/${runId}`, {
      headers: { ...VERCEL_BYPASS_HEADERS, "x-mayfly-run-token": runToken },
    });
    const instance = (await statusResponse.json()) as { state: string; url: string | null };

    console.log(`  state: ${instance.state}`);

    // Check the URL, not state === "healthy": a short ttlSeconds can carry the workflow
    // through healthy into expiring between one poll and the next (activeSeconds can be 0
    // once ttlSeconds is under the expiring-notice window), so "healthy" itself is not a
    // reliable poll target — but once a URL has been published it stays published.
    if (instance.url) {
      console.log(`Instance URL: ${instance.url}`);
      process.exit(0);
    }
    if (instance.state === "failed") {
      console.error("Instance failed to become healthy.");
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.error("Timed out waiting for instance to become healthy.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
