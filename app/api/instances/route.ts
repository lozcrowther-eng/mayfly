import { NextResponse } from "next/server";
import { launchInstance, UnknownChallengeError } from "@/lib/api/launch";
import { LaunchRequestSchema } from "@/lib/api/schemas";
import { readVerifiedBody, requireSigningSecret, SignedRequestError } from "@/lib/http/signed-request";

/** The CTFd plugin's launch contract — HMAC-signed (see CLAUDE.md). Player-browser launches use /api/launch instead. */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await readVerifiedBody(request, requireSigningSecret());
  } catch (error) {
    if (error instanceof SignedRequestError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = LaunchRequestSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { runId, runToken } = await launchInstance(parsed.data);
    return NextResponse.json({ runId, runToken });
  } catch (error) {
    if (error instanceof UnknownChallengeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
