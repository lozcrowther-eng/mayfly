import { NextResponse } from "next/server";
import { verifyRunToken } from "@/lib/auth/run-token";

export const RUN_TOKEN_HEADER = "x-mayfly-run-token";

/** Gates the three routes addressed by runId alone (status/extend/stop) — see run-token.ts. */
export function checkRunToken(request: Request, runId: string): NextResponse | null {
  const token = request.headers.get(RUN_TOKEN_HEADER);
  if (!verifyRunToken(runId, token)) {
    return NextResponse.json({ error: "missing or invalid run token" }, { status: 401 });
  }
  return null;
}
