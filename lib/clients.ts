import { CtfdClient, FakeCtfdClient, RealCtfdClient } from "./ctfd/client";
import { SandboxClient, FakeSandboxClient, RealSandboxClient } from "./sandbox/client";

type Mode = "fake" | "real";

function resolveMode(name: string, value: string | undefined): Mode {
  if (value === "fake" || value === "real") return value;
  throw new Error(`${name} must be set to 'fake' or 'real', got: ${value ?? "(unset)"}`);
}

// Resolved lazily, on first call, and memoized after that — never at module evaluation.
// `next build` imports every route module (including fully dynamic ones) while collecting
// each route's segment config, so a module-level throw here would fail the build itself
// whenever CTFD_MODE/SANDBOX_MODE aren't set — which includes CI, a fresh clone, or a fork,
// none of which have any reason to hold real secrets. This keeps CLAUDE.md's "resolved
// exactly once" invariant; it only moves WHEN that one-time resolution happens, from
// build/import time to first actual use. Callers call these accessors, never branch on the
// env var themselves.
let cachedCtfdClient: CtfdClient | undefined;
let cachedSandboxClient: SandboxClient | undefined;

export function getCtfdClient(): CtfdClient {
  if (!cachedCtfdClient) {
    const mode = resolveMode("CTFD_MODE", process.env.CTFD_MODE);
    cachedCtfdClient = mode === "fake" ? new FakeCtfdClient() : new RealCtfdClient();
  }
  return cachedCtfdClient;
}

export function getSandboxClient(): SandboxClient {
  if (!cachedSandboxClient) {
    const mode = resolveMode("SANDBOX_MODE", process.env.SANDBOX_MODE);
    cachedSandboxClient = mode === "fake" ? new FakeSandboxClient() : new RealSandboxClient();
  }
  return cachedSandboxClient;
}
