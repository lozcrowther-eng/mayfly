import { describe, expect, it } from "vitest";
import { sign, verify } from "./hmac";
import vectors from "../fixtures/hmac-vectors.json";

// These vectors are the cross-language contract: a Python signer for the CTFd plugin
// must reproduce the same signatures from the same (payload, secret, timestampMs).
describe("hmac vectors", () => {
  for (const vector of vectors) {
    it(`reproduces signature for payload=${JSON.stringify(vector.payload).slice(0, 40)}...`, () => {
      expect(sign(vector.payload, vector.secret, vector.timestampMs)).toBe(vector.signature);
    });

    it(`verifies as valid at issue time for the same vector`, () => {
      const result = verify(vector.payload, vector.secret, vector.signature, vector.timestampMs, {
        nowMs: vector.timestampMs,
      });
      expect(result).toEqual({ valid: true });
    });
  }
});

describe("verify", () => {
  const [vector] = vectors;

  it("rejects a signature for a different body", () => {
    const result = verify("tampered", vector.secret, vector.signature, vector.timestampMs, {
      nowMs: vector.timestampMs,
    });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects a timestamp outside the window", () => {
    const result = verify(vector.payload, vector.secret, vector.signature, vector.timestampMs, {
      nowMs: vector.timestampMs + 10 * 60 * 1000,
      windowMs: 5 * 60 * 1000,
    });
    expect(result).toEqual({ valid: false, reason: "timestamp_out_of_window" });
  });

  it("accepts a timestamp inside a widened window", () => {
    const result = verify(vector.payload, vector.secret, vector.signature, vector.timestampMs, {
      nowMs: vector.timestampMs + 10 * 60 * 1000,
      windowMs: 15 * 60 * 1000,
    });
    expect(result).toEqual({ valid: true });
  });
});
