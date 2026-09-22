import { createHash, randomBytes } from "node:crypto";
import type { InstanceRequest } from "../types";
import { fakeMarkReaped, fakeMintFlag, fakePublishUrl, fakeRecordSolve, fakeScoreboard } from "./fake-store";

export interface ScoreboardEntry {
  teamId: string;
  score: number;
}

/**
 * CTFd owns users, teams, challenges, flags and scores (see CLAUDE.md: the boundary
 * this repo never crosses). This is the only interface used to reach into that world.
 */
export interface CtfdClient {
  /** Mints a fresh, per-instance dynamic flag and registers it against the challenge+team in CTFd. */
  mintFlag(request: InstanceRequest): Promise<string>;
  /** Publishes the live sandbox URL so players see it on the CTFd challenge page. */
  publishUrl(request: InstanceRequest, url: string): Promise<void>;
  /** Tells CTFd the instance has been reaped, so it stops advertising the URL/flag as live. */
  markReaped(request: InstanceRequest): Promise<void>;
  /** Reads the current scoreboard — the source /scoreboard's cached fetch reads through. */
  getScoreboard(): Promise<ScoreboardEntry[]>;
  /**
   * Records a correct submission. In real mode this is a no-op: CTFd computed the solve
   * and score itself before it ever sent us the webhook, so writing it back would be
   * this repo owning score data it doesn't (see CLAUDE.md: the boundary). It exists purely
   * so the fake, in this process, has something to score in local dev.
   */
  recordSolve(challengeId: string, teamId: string): Promise<void>;
}

/**
 * Delegates to the shared fake-store (lib/ctfd/fake-store.ts) so a workflow run and a manual
 * curl to /api/fake-ctfd/* both show up on /debug — this is CTFd for local dev (CTFD_MODE=fake).
 */
export class FakeCtfdClient implements CtfdClient {
  async mintFlag(request: InstanceRequest): Promise<string> {
    return fakeMintFlag(request);
  }

  async publishUrl(request: InstanceRequest, url: string): Promise<void> {
    fakePublishUrl(request, url);
  }

  async markReaped(request: InstanceRequest): Promise<void> {
    fakeMarkReaped(request);
  }

  async getScoreboard(): Promise<ScoreboardEntry[]> {
    return fakeScoreboard();
  }

  async recordSolve(challengeId: string, teamId: string): Promise<void> {
    fakeRecordSolve(challengeId, teamId);
  }
}

function requireCtfdBaseUrl(): string {
  const url = process.env.CTFD_BASE_URL;
  if (!url) throw new Error("CTFD_BASE_URL is required when CTFD_MODE=real");
  return url;
}

function requireCtfdApiToken(): string {
  const token = process.env.CTFD_API_TOKEN;
  if (!token) throw new Error("CTFD_API_TOKEN is required when CTFD_MODE=real");
  return token;
}

// Shared with the CTFd plugin's own INSTANCER_SECRET (see ctfd_mayfly/README.md) — signs
// nothing here (unlike the CTFd->orchestrator launch call, this is the reverse direction:
// orchestrator->CTFd), just sent as a plain header the plugin compares with
// hmac.compare_digest. Reusing MAYFLY_SIGNING_SECRET rather than a third env var keeps one
// secret shared across both directions of this integration instead of two to rotate.
function requireInternalSecret(): string {
  const secret = process.env.MAYFLY_SIGNING_SECRET;
  if (!secret) throw new Error("MAYFLY_SIGNING_SECRET is required when CTFD_MODE=real");
  return secret;
}

async function ctfdInternalRequest(method: string, path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${requireCtfdBaseUrl()}/plugins/ctfd_mayfly/internal${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "X-Mayfly-Internal-Secret": requireInternalSecret(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`CTFd internal API ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
}

/** Talks to the real CTFd plugin's internal API (see ctfd_mayfly/api.py's internal_bp). */
export class RealCtfdClient implements CtfdClient {
  async mintFlag(request: InstanceRequest): Promise<string> {
    // The orchestrator generates and holds the plaintext (it's the one injecting FLAG into
    // the sandbox); CTFd only ever learns the hash, via the plugin's own internal API — see
    // ctfd_mayfly/challenge.py's attempt(), which compares a submission's digest against
    // exactly this, never a plaintext round-trip.
    const flag = `mayfly{${randomBytes(16).toString("hex")}}`;
    const flagHash = createHash("sha256").update(flag, "utf8").digest("hex");
    await ctfdInternalRequest("POST", `/instances/${request.runId}/flag`, { flag_hash: flagHash });
    return flag;
  }

  async publishUrl(request: InstanceRequest, url: string): Promise<void> {
    await ctfdInternalRequest("PATCH", `/instances/${request.runId}`, { url, state: "healthy" });
  }

  async markReaped(request: InstanceRequest): Promise<void> {
    await ctfdInternalRequest("POST", `/instances/${request.runId}/reaped`);
  }

  // Unlike mintFlag/publishUrl/markReaped, this doesn't wait on the not-yet-built CTFd
  // plugin (plan §8) — GET /api/v1/scoreboard is stock CTFd core, present on any CTFd
  // instance today, so /scoreboard can hit it for real right now.
  async getScoreboard(): Promise<ScoreboardEntry[]> {
    // CTFd's token auth is "Authorization: Token <token>", not "Bearer" -- and on a GET it
    // only recognizes the token at all when Content-Type: application/json is also set,
    // otherwise it silently falls through to session-only auth and 302s to /login instead
    // of erroring (confirmed directly against a real CTFd instance).
    const res = await fetch(`${requireCtfdBaseUrl()}/api/v1/scoreboard`, {
      headers: {
        Authorization: `Token ${requireCtfdApiToken()}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`CTFd scoreboard request failed: ${res.status}`);

    const body = (await res.json()) as { data?: Array<{ account_id: number; score: number }> };
    return (body.data ?? []).map((entry) => ({ teamId: String(entry.account_id), score: entry.score }));
  }

  async recordSolve(): Promise<void> {
    // No-op — see the CtfdClient.recordSolve doc comment.
  }
}
