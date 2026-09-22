export type ChallengeTier = "instanced" | "shared";

export interface Challenge {
  id: string;
  name: string;
  tier: ChallengeTier;
  /** Ports the challenge listens on inside its sandbox. */
  ports: number[];
  /** Sandbox vCPUs to allocate (2048 MB RAM per vCPU) — the one source of truth for both create() and cost estimation. */
  vcpus: number;
  /** CTFd point value — scored on the /scoreboard page via the fake CTFd store's solve ledger. */
  points: number;
  /** Runs multiple processes/services inside its one sandbox (still one sandbox per team per challenge). */
  compose?: boolean;
  /** Shared-tier only — a fixed URL, not a per-run sandbox domain, so there's nothing to launch. */
  url?: string;
  /**
   * Fallback for an image with no `/start.sh` — CLAUDE.md's convention is
   * `bash -lc 'exec /start.sh'`, tried first; this only matters for an untouched image that
   * doesn't follow it.
   */
  startCommand?: string;
  /**
   * A Vercel Container Registry reference (see lib/sandbox/real-client.ts) — e.g.
   * "my-repo:latest", or "team-slug/project-slug/my-repo:tag" for an image in a different
   * project. Sandbox only pulls from VCR, never an external registry directly. Omitted
   * entirely means the default `vercel/sandbox/universal` image, which has no real
   * challenge on it — real-client.ts's placeholder page is all that boots without this.
   */
  image?: string;
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
  { id: "juice-shop", name: "OWASP Juice Shop", tier: "instanced", ports: [3000], vcpus: 1, points: 100 },
  // Deliberately never becomes healthy — exercises the failure path (waitForHealthy's
  // retries exhausting, reap still firing in `finally`) end to end against the fakes.
  { id: "broken-web", name: "Broken Web", tier: "instanced", ports: [3000], vcpus: 1, points: 150 },
  { id: "vuln-api", name: "Vulnerable API", tier: "instanced", ports: [8080], vcpus: 2, compose: true, points: 250 },
  { id: "static-web", name: "Static Web", tier: "shared", ports: [8080], vcpus: 1, url: "https://static-web.mayfly.example", points: 50 },
  // Real challenge — a Snyk CTF box (directory traversal via an old `st` version). Its
  // /start.sh writes $FLAG over the app's static flag file before starting it, which is
  // what makes the flag actually per-team instead of the same baked-in value every launch.
  { id: "file-explorer", name: "File Explorer", tier: "instanced", ports: [3001], vcpus: 1, points: 40, image: "file-explorer:latest" },
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((challenge) => challenge.id === id);
}
