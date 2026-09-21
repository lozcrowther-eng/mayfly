import type { InstanceRequest } from "../types";

export interface SandboxCreateResult {
  sandboxId: string;
  url: string;
}

/**
 * The only place this repo talks to Vercel Sandbox. See CLAUDE.md invariants:
 * persistent:false, a unique name per run, and stop() then delete() on reap.
 */
export interface SandboxClient {
  create(request: InstanceRequest): Promise<SandboxCreateResult>;
  healthUrl(request: InstanceRequest): Promise<string>;
  readLogs(request: InstanceRequest): Promise<string>;
  reap(request: InstanceRequest): Promise<void>;
}

function key(request: InstanceRequest): string {
  // Matches the Sandbox naming rule in CLAUDE.md: reusing a name resumes a previous
  // player's box, so the fake client enforces the same per-run uniqueness as the real one.
  return `${request.challengeId}-${request.teamId}-${request.runId}`;
}

interface FakeSandbox {
  sandboxId: string;
  url: string;
  logs: string[];
  reaped: boolean;
}

// Keyed off globalThis because Next.js compiles each route/step bundle separately — a plain
// module-level (or instance-level) Map would give createSandbox/reap their own private copy
// instead of sharing one (see the same fix in lib/ctfd/fake-store.ts).
const GLOBAL_KEY = Symbol.for("mayfly.fakeSandboxes");

function sandboxes(): Map<string, FakeSandbox> {
  const g = globalThis as unknown as Record<symbol, Map<string, FakeSandbox> | undefined>;
  return (g[GLOBAL_KEY] ??= new Map());
}

/** In-memory Sandbox stand-in for local dev (SANDBOX_MODE=fake) — provisions instantly, no microVM. */
export class FakeSandboxClient implements SandboxClient {
  async create(request: InstanceRequest): Promise<SandboxCreateResult> {
    const name = key(request);
    const sandbox: FakeSandbox = {
      sandboxId: name,
      url: `https://fake-sandbox.local/${name}`,
      logs: [`[fake] sandbox ${name} created`],
      reaped: false,
    };
    sandboxes().set(name, sandbox);
    return { sandboxId: sandbox.sandboxId, url: sandbox.url };
  }

  async healthUrl(request: InstanceRequest): Promise<string> {
    const sandbox = sandboxes().get(key(request));
    if (!sandbox) throw new Error(`healthUrl called before create for ${key(request)}`);
    if (request.challengeId === "broken-web") {
      // Fixture (lib/fixtures/challenges.ts): deliberately never becomes healthy, so the
      // workflow's failure path — waitForHealthy's retries exhausting, reap still firing
      // in `finally` — has something real to exercise against the fakes.
      throw new Error(`${request.challengeId} never becomes healthy (fixture)`);
    }
    return `${sandbox.url}/healthz`;
  }

  async readLogs(request: InstanceRequest): Promise<string> {
    const sandbox = sandboxes().get(key(request));
    if (!sandbox) throw new Error(`readLogs called before create for ${key(request)}`);
    return sandbox.logs.join("\n");
  }

  async reap(request: InstanceRequest): Promise<void> {
    // A no-op for a sandbox that never got created — reap runs on every workflow exit
    // path, including one where createSandbox itself never succeeded.
    const sandbox = sandboxes().get(key(request));
    if (!sandbox) return;
    sandbox.reaped = true;
  }
}

/** Talks to the real Vercel Sandbox SDK. Stubbed until the workflow that drives it exists. */
export class RealSandboxClient implements SandboxClient {
  async create(): Promise<SandboxCreateResult> {
    throw new Error("not implemented");
  }

  async healthUrl(): Promise<string> {
    throw new Error("not implemented");
  }

  async readLogs(): Promise<string> {
    throw new Error("not implemented");
  }

  async reap(): Promise<void> {
    throw new Error("not implemented");
  }
}
