export type ChallengeTier = "instanced" | "shared";

export interface Challenge {
  id: string;
  name: string;
  tier: ChallengeTier;
  /** Ports the challenge listens on inside its sandbox. */
  ports: number[];
  /** Runs multiple processes/services inside its one sandbox (still one sandbox per team per challenge). */
  compose?: boolean;
  /** Shared-tier only — a fixed URL, not a per-run sandbox domain, so there's nothing to launch. */
  url?: string;
  /**
   * Fallback for an image with no `/start.sh` — CLAUDE.md's convention is
   * `bash -lc 'exec /start.sh'`, tried first; this only matters for an untouched image that
   * doesn't follow it. None of the fixtures below need it (none have a real image at all yet).
   */
  startCommand?: string;
}

/**
 * Tiering is a cost decision, not a security one — every challenge here is already isolated
 * at build time, so a shared deployment is just as safe as an instanced one. What actually
 * forces a dedicated, per-team Sandbox is per-team STATE (a database or session that one
 * team's actions could corrupt for another) or per-team FLAGS (a dynamic secret that must
 * differ per team). Static content and CTF challenges without either can be served once,
 * shared, instead of paying for N ephemeral microVMs that all serve the same bytes.
 */
export const CHALLENGES: Challenge[] = [
  { id: "juice-shop", name: "OWASP Juice Shop", tier: "instanced", ports: [3000] },
  // Deliberately never becomes healthy — exercises the failure path (waitForHealthy's
  // retries exhausting, reap still firing in `finally`) end to end against the fakes.
  { id: "broken-web", name: "Broken Web", tier: "instanced", ports: [3000] },
  { id: "vuln-api", name: "Vulnerable API", tier: "instanced", ports: [8080], compose: true },
  { id: "static-web", name: "Static Web", tier: "shared", ports: [8080], url: "https://static-web.mayfly.example" },
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((challenge) => challenge.id === id);
}
