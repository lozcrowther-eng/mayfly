import type { InstanceRequest } from "../types";

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
}

function key(request: InstanceRequest): string {
  return `${request.challengeId}:${request.teamId}:${request.runId}`;
}

interface FakeRecord {
  flag: string;
  url: string | null;
  reaped: boolean;
}

/** In-memory CTFd stand-in for local dev (CTFD_MODE=fake) — never persists past the process. */
export class FakeCtfdClient implements CtfdClient {
  private records = new Map<string, FakeRecord>();

  async mintFlag(request: InstanceRequest): Promise<string> {
    const flag = `flag{fake-${key(request)}-${Math.random().toString(36).slice(2, 10)}}`;
    this.records.set(key(request), { flag, url: null, reaped: false });
    return flag;
  }

  async publishUrl(request: InstanceRequest, url: string): Promise<void> {
    const record = this.records.get(key(request));
    if (!record) throw new Error(`publishUrl called before mintFlag for ${key(request)}`);
    record.url = url;
  }

  async markReaped(request: InstanceRequest): Promise<void> {
    const record = this.records.get(key(request));
    if (!record) throw new Error(`markReaped called before mintFlag for ${key(request)}`);
    record.reaped = true;
  }
}

/** Talks to the real CTFd API on GCP. Stubbed until the CTFd plugin (plan §8) exists. */
export class RealCtfdClient implements CtfdClient {
  async mintFlag(): Promise<string> {
    throw new Error("not implemented");
  }

  async publishUrl(): Promise<void> {
    throw new Error("not implemented");
  }

  async markReaped(): Promise<void> {
    throw new Error("not implemented");
  }
}
