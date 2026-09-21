import { CtfdClient, FakeCtfdClient, RealCtfdClient } from "./ctfd/client";
import { SandboxClient, FakeSandboxClient, RealSandboxClient } from "./sandbox/client";

type Mode = "fake" | "real";

function resolveMode(name: string, value: string | undefined): Mode {
  if (value === "fake" || value === "real") return value;
  throw new Error(`${name} must be set to 'fake' or 'real', got: ${value ?? "(unset)"}`);
}

// Resolved exactly once, at module load — see CLAUDE.md: two independent mode flags,
// never branch on an env var at a call site. Callers import these singletons only.
const ctfdMode = resolveMode("CTFD_MODE", process.env.CTFD_MODE);
const sandboxMode = resolveMode("SANDBOX_MODE", process.env.SANDBOX_MODE);

export const ctfdClient: CtfdClient =
  ctfdMode === "fake" ? new FakeCtfdClient() : new RealCtfdClient();

export const sandboxClient: SandboxClient =
  sandboxMode === "fake" ? new FakeSandboxClient() : new RealSandboxClient();
