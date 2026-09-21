import { Sandbox } from "@vercel/sandbox";
import { getChallenge } from "../fixtures/challenges";
import type { Challenge } from "../fixtures/challenges";
import type { InstanceRequest } from "../types";
import type { SandboxClient, SandboxCreateResult } from "./client";

function sandboxName(request: InstanceRequest): string {
  // Matches the Sandbox naming rule in CLAUDE.md: reusing a name resumes a previous
  // player's box, so runId must be fresh per launch (enforced in app/api/instances).
  return `${request.challengeId}-${request.teamId}-${request.runId}`;
}

// Two clocks, never equal (CLAUDE.md) — the workflow's sleep(ttl) -> reap() is the intended
// lifecycle; this is only a backstop for a lost run, so it sits BEHIND the workflow by this
// grace window. On extend, RealSandboxClient.extendTimeout() grows this clock by the same
// amount the workflow grows its own sleep by — see instance-lifecycle.ts's extend loop.
const GRACE_SECONDS = 300;

const LOG_PATH = "/vercel/app.log";

/** Talks to the real Vercel Sandbox SDK. See CLAUDE.md invariants referenced inline below. */
export class RealSandboxClient implements SandboxClient {
  async create(request: InstanceRequest, flag: string): Promise<SandboxCreateResult> {
    const challenge = getChallenge(request.challengeId);
    if (!challenge) throw new Error(`unknown challenge ${request.challengeId}`);

    // getOrCreate, not create() — steps are retried by default (see CLAUDE.md: durable
    // retries), and a create() side effect can register on Vercel's side even if this step
    // invocation is reported as failed (network blip, function interruption). A second
    // create() with the same deterministic name then legitimately 400s as a duplicate.
    const sandbox = await Sandbox.getOrCreate({
      name: sandboxName(request), // unique per run
      persistent: false, // disposable — no snapshot storage cost for a box that dies with its run
      ports: request.ports, // ports from the request, resolved from the challenge fixture at launch
      resources: { vcpus: challenge.vcpus },
      // HOST=0.0.0.0, not just FLAG — CLAUDE.md: an app bound to 127.0.0.1 returns 502
      // SANDBOX_NOT_LISTENING because the edge proxy reaches the VM from outside it.
      env: { FLAG: flag, HOST: "0.0.0.0" },
      timeout: (request.ttlSeconds + GRACE_SECONDS) * 1000,
    });

    // Deliberately NOT in getOrCreate's onCreate: that hook only fires the one time
    // getOrCreate itself creates the sandbox, so if THIS attempt of createSandbox is a retry
    // after an earlier attempt died partway through starting the challenge, onCreate would
    // never fire again on the resumed sandbox and it would never actually start. Starting it
    // here, unconditionally, on every attempt, and skipping if it's already answering, is
    // what actually makes the retry safe — the same idempotency the Workflow SDK docs
    // describe for step side effects, applied at the sandbox level rather than trusting the
    // hook alone.
    if (challenge.compose) {
      // The challenge's docker-compose.yml is expected to already be on the sandbox
      // filesystem (e.g. via a `source: { type: "git", ... }` above) — not wired up yet,
      // since this repo has no real challenge images. This documents the invocation shape.
      // `docker compose up -d` is itself idempotent — a no-op against already-running
      // containers — so it's safe to call on every attempt too.
      //
      // Containers started this way do NOT inherit the sandbox's own egress proxy CA. If the
      // challenge makes outbound HTTPS calls from inside a container, that TLS handshake
      // fails even though the same curl works from the sandbox's own shell — mount the
      // proxy's CA into the container (volume + NODE_EXTRA_CA_CERTS/REQUESTS_CA_BUNDLE, or
      // bake it into the container's trust store at build time) before it can reach anything
      // over HTTPS.
      const compose = await sandbox.runCommand({ cmd: "docker", args: ["compose", "up", "-d"], sudo: true });
      if (compose.exitCode !== 0) {
        throw new Error(`docker compose up failed for ${sandbox.name}: ${await compose.stderr()}`);
      }
    } else {
      await ensureChallengeRunning(sandbox, challenge, request.ports[0]);
    }

    return { sandboxId: sandbox.name, url: sandbox.domain(request.ports[0]) };
  }

  async healthUrl(request: InstanceRequest): Promise<string> {
    const sandbox = await Sandbox.get({ name: sandboxName(request) });
    const port = request.ports[0];

    // Checked from inside the VM, not by fetching the public domain from here — the public
    // route can 404/524 for reasons unrelated to the app's own readiness (cold routing, DNS).
    const ping = await sandbox.runCommand({
      cmd: "bash",
      args: [
        "-c",
        `curl -sf -w '\\nHTTP_STATUS:%{http_code}\\n' http://localhost:${port} 2>&1 || (echo CURL_EXIT:$?; cat ${LOG_PATH} 2>&1)`,
      ],
    });
    const output = await ping.stdout();
    if (!output.includes("HTTP_STATUS:200")) {
      throw new Error(`port ${port} not yet answering inside sandbox ${sandbox.name}: ${output}`);
    }

    return sandbox.domain(port);
  }

  async readLogs(request: InstanceRequest): Promise<string> {
    const sandbox = await Sandbox.get({ name: sandboxName(request) });
    return sandbox.fs.readFile(LOG_PATH, "utf8").catch(() => "");
  }

  async extendTimeout(request: InstanceRequest, extraSeconds: number): Promise<void> {
    const sandbox = await Sandbox.get({ name: sandboxName(request) });
    await sandbox.extendTimeout(extraSeconds * 1000);
  }

  async reap(request: InstanceRequest): Promise<void> {
    let sandbox: Sandbox;
    try {
      sandbox = await Sandbox.get({ name: sandboxName(request), resume: false });
    } catch {
      // Nothing to reap — createSandbox never succeeded, or it's already gone. Reap must be
      // a safe no-op here: it runs on every workflow exit path, including failed ones.
      return;
    }

    await sandbox.stop(); // stop() then delete() — CLAUDE.md
    await sandbox.delete();
  }
}

/**
 * Idempotent across step retries (the "already up" check below), and generic across
 * challenges (CLAUDE.md: "onboarding a new challenge must never require a control-plane
 * change"). Tries, in order:
 *   1. `/start.sh` — the convention every real challenge image is expected to follow.
 *   2. `challenge.startCommand` — an explicit fallback for an untouched image that has no
 *      `/start.sh`, configured once per challenge rather than requiring an image rebuild.
 *   3. A demo-only placeholder server — none of the fixtures in
 *      lib/fixtures/challenges.ts have a real image yet, so there is nothing to launch
 *      until (1) or (2) applies; this exists only to prove the Sandbox plumbing
 *      (name/ports/resources/env/timeout) end to end.
 */
async function ensureChallengeRunning(sandbox: Sandbox, challenge: Challenge, port: number): Promise<void> {
  const alreadyUp = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", `curl -sf http://localhost:${port} >/dev/null && echo up || echo down`],
  });
  if ((await alreadyUp.stdout()).trim() === "up") return; // an earlier attempt already got this far

  const hasStartScript = await sandbox.runCommand({ cmd: "bash", args: ["-lc", "test -x /start.sh"] });

  if (hasStartScript.exitCode === 0) {
    await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", `exec /start.sh > ${LOG_PATH} 2>&1`],
      detached: true,
    });
    return;
  }

  if (challenge.startCommand) {
    await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", `exec ${challenge.startCommand} > ${LOG_PATH} 2>&1`],
      detached: true,
    });
    return;
  }

  await sandbox.writeFiles([
    {
      path: "index.html",
      content: Buffer.from(`<h1>${challenge.name}</h1><p>Placeholder instance — no real challenge image yet.</p>`),
    },
  ]);

  await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", `python3 -m http.server ${port} --bind 0.0.0.0 > ${LOG_PATH} 2>&1`],
    cwd: "/vercel",
    detached: true,
  });
}
