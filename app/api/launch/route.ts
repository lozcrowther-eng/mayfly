import { NextResponse } from "next/server";
import { launchInstance, UnknownChallengeError } from "@/lib/api/launch";
import { LaunchRequestSchema } from "@/lib/api/schemas";

/**
 * Same-origin browser launches from the player view (app/page.tsx) — no HMAC signature,
 * unlike /api/instances. That signing contract exists specifically for the CTFd-plugin<
 * ->Vercel boundary (see CLAUDE.md); a browser has no secret it could hold to sign with
 * that wouldn't also be readable by every player who opened devtools.
 */
export async function POST(request: Request) {
  const parsed = LaunchRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { runId } = await launchInstance(parsed.data);
    return NextResponse.json({ runId });
  } catch (error) {
    if (error instanceof UnknownChallengeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
