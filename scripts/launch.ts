import { sign } from "../lib/hmac";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_TTL_SECONDS = 3600;

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
    },
    body: rawBody,
  });

  if (!launchResponse.ok) {
    console.error(`Launch failed: ${launchResponse.status} ${await launchResponse.text()}`);
    process.exit(1);
  }

  const { runId } = (await launchResponse.json()) as { runId: string };
  console.log(`runId: ${runId}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${APP_BASE_URL}/api/instances/${runId}`);
    const instance = (await statusResponse.json()) as { state: string; url: string | null };

    console.log(`  state: ${instance.state}`);

    if (instance.state === "healthy") {
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
