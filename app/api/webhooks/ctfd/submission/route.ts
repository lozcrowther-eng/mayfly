import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { SubmissionWebhookSchema } from "@/lib/api/schemas";
import { findRunningInstance } from "@/lib/api/run-lookup";
import { readVerifiedBody, requireSigningSecret, SignedRequestError } from "@/lib/http/signed-request";

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

  const parsed = SubmissionWebhookSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { challengeId, teamId, correct } = parsed.data;

  // Every submission changes the scoreboard, correct or not. "max" purges it outright rather
  // than waiting out a cacheLife profile's stale window — Next.js 16 requires this second arg.
  revalidateTag("scoreboard", "max");

  if (correct) {
    // CTFd knows the challenge and team, not our runId — this reverse lookup exists because
    // "one sandbox per team per challenge" (CLAUDE.md) makes it well-defined.
    const identity = await findRunningInstance(challengeId, teamId);
    if (identity) {
      await lifecycleHook.resume(hookToken(identity), { reason: "solved" });
    }
  }

  return NextResponse.json({ ok: true });
}
