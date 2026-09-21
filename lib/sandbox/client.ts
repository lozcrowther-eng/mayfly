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

/** In-memory Sandbox stand-in for local dev (SANDBOX_MODE=fake) — provisions instantly, no microVM. */
export class FakeSandboxClient implements SandboxClient {
  private sandboxes = new Map<string, FakeSandbox>();

  async create(request: InstanceRequest): Promise<SandboxCreateResult> {
    const name = key(request);
    const sandbox: FakeSandbox = {
      sandboxId: name,
      url: `https://fake-sandbox.local/${name}`,
      logs: [`[fake] sandbox ${name} created`],
      reaped: false,
    };
    this.sandboxes.set(name, sandbox);
    return { sandboxId: sandbox.sandboxId, url: sandbox.url };
  }

  async healthUrl(request: InstanceRequest): Promise<string> {
    const sandbox = this.sandboxes.get(key(request));
    if (!sandbox) throw new Error(`healthUrl called before create for ${key(request)}`);
    return `${sandbox.url}/healthz`;
  }

  async readLogs(request: InstanceRequest): Promise<string> {
    const sandbox = this.sandboxes.get(key(request));
    if (!sandbox) throw new Error(`readLogs called before create for ${key(request)}`);
    return sandbox.logs.join("\n");
  }

  async reap(request: InstanceRequest): Promise<void> {
    const sandbox = this.sandboxes.get(key(request));
    if (!sandbox) throw new Error(`reap called before create for ${key(request)}`);
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
