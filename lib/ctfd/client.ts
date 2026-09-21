import type { InstanceRequest } from "../types";
import { fakeMarkReaped, fakeMintFlag, fakePublishUrl } from "./fake-store";

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
