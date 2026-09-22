/**
 * The in-process stand-in for CTFd itself (CTFD_MODE=fake): both FakeCtfdClient and the
 * /api/fake-ctfd/* route handlers read and write this store, so /debug shows exactly what
 * "CTFd" received regardless of whether the call came from a workflow step or a manual curl.
 */
import { CHALLENGES } from "../fixtures/challenges";

type InstanceKey = { challengeId: string; teamId: string; runId: string };

export interface FakeCtfdEvent {
  id: string;
  kind: "mint_flag" | "publish_url" | "mark_reaped";
  challengeId: string;
  teamId: string;
  runId: string;
  detail: Record<string, unknown>;
  receivedAt: string; // ISO 8601
}

interface FakeInstanceRecord {
  flag: string;
  url: string | null;
  reaped: boolean;
}

export interface FakeScoreEntry {
  teamId: string;
  score: number;
  solvedChallengeIds: string[];
}

interface FakeCtfdState {
  records: Map<string, FakeInstanceRecord>;
  events: FakeCtfdEvent[];
  // teamId -> solved challengeIds. Populated by the submission webhook, read by
  // fakeScoreboard() — this is the fake stand-in for CTFd's own scores table.
  solves: Map<string, Set<string>>;
}

// Next.js compiles each route handler and page as a separate bundle, so a plain module-level
// Map here would give the flag/url/reaped routes and the /debug page their own private copy
// instead of a shared store. Keying off globalThis forces every bundle onto the same instance.
const GLOBAL_KEY = Symbol.for("mayfly.fakeCtfdStore");

function state(): FakeCtfdState {
  const g = globalThis as unknown as Record<symbol, FakeCtfdState | undefined>;
  return (g[GLOBAL_KEY] ??= { records: new Map(), events: [], solves: new Map() });
}

function key(instance: InstanceKey): string {
  return `${instance.challengeId}:${instance.teamId}:${instance.runId}`;
}

function record(kind: FakeCtfdEvent["kind"], instance: InstanceKey, detail: Record<string, unknown> = {}): void {
  state().events.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    challengeId: instance.challengeId,
    teamId: instance.teamId,
    runId: instance.runId,
    detail,
    receivedAt: new Date().toISOString(),
  });
}

/** CTFd owns flag generation (see CLAUDE.md: the boundary) — this fake mints one the same way. */
export function fakeMintFlag(instance: InstanceKey): string {
  const flag = `flag{fake-${key(instance)}-${Math.random().toString(36).slice(2, 10)}}`;
  state().records.set(key(instance), { flag, url: null, reaped: false });
  record("mint_flag", instance, { flag });
  return flag;
}

export function fakePublishUrl(instance: InstanceKey, url: string, expiresAt: string | null): void {
  const existing = state().records.get(key(instance));
  if (!existing) throw new Error(`publishUrl called before mintFlag for ${key(instance)}`);
  existing.url = url;
  record("publish_url", instance, { url, expiresAt });
}

/** A no-op for an instance CTFd never heard about — reap must be safe to call on every exit path. */
export function fakeMarkReaped(instance: InstanceKey): void {
  const existing = state().records.get(key(instance));
  if (!existing) return;
  existing.reaped = true;
  record("mark_reaped", instance);
}

/** Newest first — matches how /debug renders them. */
export function fakeCtfdEvents(): FakeCtfdEvent[] {
  return state().events;
}

/** Read-only snapshot for the polling endpoint — null until mintFlag has run for this instance. */
export function fakeInstanceStatus(instance: InstanceKey): FakeInstanceRecord | null {
  return state().records.get(key(instance)) ?? null;
}

/** Called by the submission webhook on a correct submission — see CtfdClient.recordSolve. */
export function fakeRecordSolve(challengeId: string, teamId: string): void {
  const solves = state().solves;
  const solved = solves.get(teamId) ?? new Set<string>();
  solved.add(challengeId);
  solves.set(teamId, solved);
}

/**
 * Scores every team with at least one solve, using each challenge's fixed point value
 * (lib/fixtures/challenges.ts) — the same shape CTFd's own scoreboard API returns, but
 * computed locally instead of over a network call. Sorted highest first, ties broken by
 * teamId for a stable render.
 */
export function fakeScoreboard(): FakeScoreEntry[] {
  const pointsById = new Map(CHALLENGES.map((c) => [c.id, c.points]));

  return [...state().solves.entries()]
    .map(([teamId, solved]) => ({
      teamId,
      solvedChallengeIds: [...solved],
      score: [...solved].reduce((sum, id) => sum + (pointsById.get(id) ?? 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));
}
