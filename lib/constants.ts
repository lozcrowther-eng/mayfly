// Shared between app/workflows/instance-lifecycle.ts (what an Extend actually grants) and
// the player-view UI (what the countdown should jump to when Extend succeeds) — one number,
// not two that could drift apart.
export const EXTEND_SECONDS = 15 * 60;
