import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A per-run capability token — closes the gap flagged when auditing public/openapi.yaml:
 * GET/extend/stop on /api/instances/{runId} had nothing but an unguessable runId gating
 * them. This is deliberately NOT the CTFd<->Vercel HMAC contract (lib/hmac.ts): that secret
 * proves "this caller is the CTFd plugin", but both the demo console's browser and CTFd's
 * player-facing browser JS need to prove "this caller was handed this specific run at launch
 * time" without ever holding a secret that would leak to every player's devtools. So this is
 * minted once per run (mintRunToken, called from lib/api/launch.ts) and handed back in the
 * launch response; the only thing anything downstream needs to do with it is echo it back
 * unchanged on later calls — nobody outside this file ever computes or checks the signature,
 * including CTFd's Python side, which just stores and forwards the opaque string.
 *
 * No independent expiry beyond a generous ceiling: a run's own lifecycle already bounds its
 * usefulness (Vercel Sandbox's Hobby-plan cap is 45 minutes total, see
 * lib/sandbox/real-client.ts's MAX_SESSION_SECONDS), so a captured token is worthless long
 * before this TTL would matter — it exists only so a token isn't valid forever if ever
 * logged somewhere.
 */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.RUN_TOKEN_SECRET;
  if (!value) throw new Error("RUN_TOKEN_SECRET must be set");
  return value;
}

function signaturePayload(runId: string, expiresAtMs: number): string {
  return `${runId}.${expiresAtMs}`;
}

export function mintRunToken(runId: string): string {
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  const signature = createHmac("sha256", secret()).update(signaturePayload(runId, expiresAtMs)).digest("hex");
  return `${expiresAtMs}.${signature}`;
}

export function verifyRunToken(runId: string, token: string | null): boolean {
  if (!token) return false;

  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;

  const expiresAtMs = Number(token.slice(0, separatorIndex));
  const signature = token.slice(separatorIndex + 1);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const expected = createHmac("sha256", secret()).update(signaturePayload(runId, expiresAtMs)).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");

  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}
