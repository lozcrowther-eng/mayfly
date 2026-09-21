import { createHmac, timingSafeEqual } from "node:crypto";

// Bounds the replay window for a signed request: a captured (body, signature, timestamp)
// triple stops verifying this long after it was issued.
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Signs the RAW request body bytes, never a re-serialised object — see CLAUDE.md:
 * json.dumps and JSON.stringify disagree on whitespace and key order, so a signer and
 * verifier on different stacks (this file's Python counterpart included) must hash the
 * exact bytes that were sent, not a reparsed-and-restringified copy.
 */
export function sign(rawBody: Buffer | string, secret: string, timestampMs: number): string {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return createHmac("sha256", secret)
    .update(String(timestampMs))
    .update(".")
    .update(body)
    .digest("hex");
}

export interface VerifyResult {
  valid: boolean;
  reason?: "bad_signature" | "timestamp_out_of_window";
}

export interface VerifyOptions {
  nowMs?: number;
  windowMs?: number;
}

export function verify(
  rawBody: Buffer | string,
  secret: string,
  signature: string,
  timestampMs: number,
  options: VerifyOptions = {},
): VerifyResult {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  if (Math.abs(nowMs - timestampMs) > windowMs) {
    return { valid: false, reason: "timestamp_out_of_window" };
  }

  const expected = Buffer.from(sign(rawBody, secret, timestampMs), "hex");
  const actual = Buffer.from(signature, "hex");

  // Length check first: timingSafeEqual throws on mismatched lengths, and the length
  // itself carries no secret-dependent information (hex digest length is fixed).
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { valid: false, reason: "bad_signature" };
  }

  return { valid: true };
}
