import { verify } from "@/lib/hmac";

export const SIGNATURE_HEADER = "x-mayfly-signature";
export const TIMESTAMP_HEADER = "x-mayfly-timestamp";

export class SignedRequestError extends Error {}

export function requireSigningSecret(): string {
  const secret = process.env.MAYFLY_SIGNING_SECRET;
  if (!secret) throw new Error("MAYFLY_SIGNING_SECRET must be set");
  return secret;
}

/**
 * Reads the raw body bytes and verifies them before anything touches JSON.parse — signing a
 * re-serialised object would drift from what the caller actually sent (see CLAUDE.md:
 * json.dumps and JSON.stringify disagree on whitespace and key order).
 */
export async function readVerifiedBody(request: Request, secret: string): Promise<string> {
  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestampHeader = request.headers.get(TIMESTAMP_HEADER);

  if (!signature || !timestampHeader) {
    throw new SignedRequestError("missing signature headers");
  }

  const timestampMs = Number(timestampHeader);
  const rawBody = await request.text();
  const result = verify(rawBody, secret, signature, timestampMs);

  if (!result.valid) {
    throw new SignedRequestError(result.reason ?? "invalid signature");
  }

  return rawBody;
}
