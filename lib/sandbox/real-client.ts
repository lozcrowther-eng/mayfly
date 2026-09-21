import { Sandbox } from "@vercel/sandbox";
import { getChallenge } from "../fixtures/challenges";
import type { InstanceRequest } from "../types";
import type { SandboxClient, SandboxCreateResult } from "./client";

function sandboxName(request: InstanceRequest): string {
  // Matches the Sandbox naming rule in CLAUDE.md: reusing a name resumes a previous
  // player's box, so runId must be fresh per launch (enforced in app/api/instances).
  return `${request.challengeId}-${request.teamId}-${request.runId}`;
}

// Defence in depth, not the reaper (CLAUDE.md) — the workflow's own sleep + hook lifecycle is
// what actually ends the instance. This backstop only matters if that ever gets stuck, so it's
// set comfortably past the workflow's own budget (ttlSeconds, plus the ~5 extra minutes the
// post-expiry hook race can add) rather than tracking it exactly.
const BACKSTOP_BUFFER_MS = 10 * 60 * 1000;

const LOG_PATH = "/vercel/sandbox/app.log";

/** Talks to the real Vercel Sandbox SDK. See CLAUDE.md invariants referenced inline below. */
export class RealSandboxClient implements SandboxClient {
  async create(request: InstanceRequest, flag: string): Promise<SandboxCreateResult> {
    const challenge = getChallenge(request.challengeId);
    if (!challenge) throw new Error(`unknown challenge ${request.challengeId}`);

    const sandbox = await Sandbox.create({
      name: sandboxName(request), // unique per run
      persistent: false, // disposable — no snapshot storage cost for a box that dies with its run
      ports: request.ports, // ports from the request, resolved from the challenge fixture at launch
      resources: { vcpus: challenge.compose ? 2 : 1 },
      env: { FLAG: flag },
      timeout: request.ttlSeconds * 1000 + BACKSTOP_BUFFER_MS,
    });

    if (challenge.compose) {
      // The challenge's docker-compose.yml is expected to already be on the sandbox
      // filesystem (e.g. via a `source: { type: "git", ... }` above) — not wired up yet,
      // since this repo has no real challenge images. This documents the invocation shape.
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
      await startPlaceholderServer(sandbox, request.ports[0], challenge.name);
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
      args: ["-c", `curl -sf http://localhost:${port} >/dev/null && echo up || echo down`],
    });
    if ((await ping.stdout()).trim() !== "up") {
      throw new Error(`port ${port} not yet answering inside sandbox ${sandbox.name}`);
    }

    return sandbox.domain(port);
  }

  async readLogs(request: InstanceRequest): Promise<string> {
    const sandbox = await Sandbox.get({ name: sandboxName(request) });
    return sandbox.fs.readFile(LOG_PATH, "utf8").catch(() => "");
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

async function startPlaceholderServer(sandbox: Sandbox, port: number, challengeName: string): Promise<void> {
  // No real challenge images exist yet (see lib/fixtures/challenges.ts) — this proves the
  // Sandbox plumbing (name/ports/resources/env/timeout) works end to end with something
  // genuinely running and reachable, not a stand-in for an actual challenge container.
  await sandbox.writeFiles([
    {
      path: "index.html",
      content: Buffer.from(`<h1>${challengeName}</h1><p>Placeholder instance — no real challenge image yet.</p>`),
    },
  ]);

  await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", `python3 -m http.server ${port} --bind 0.0.0.0 > ${LOG_PATH} 2>&1`],
    cwd: "/vercel/sandbox",
    detached: true,
  });
}
