import { NextResponse } from "next/server";
import { HookNotFoundError } from "workflow/errors";
import { hookToken, lifecycleHook } from "@/app/workflows/instance-lifecycle";
import { SubmissionWebhookSchema } from "@/lib/api/schemas";
import { findRunningInstance } from "@/lib/api/run-lookup";
import { getCtfdClient } from "@/lib/clients";
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

  if (correct) {
    // Real mode: a no-op, CTFd already owns this score (see CtfdClient.recordSolve). Fake
    // mode: the only place the fake scoreboard's data comes from. Written before the
    // revalidation below so the next request's cache miss reads the score that caused it.
    await getCtfdClient().recordSolve(challengeId, teamId);

    // CTFd knows the challenge and team, not our runId — this reverse lookup exists because
    // "one sandbox per team per challenge" (CLAUDE.md) makes it well-defined.
    const identity = await findRunningInstance(challengeId, teamId);
    if (identity) {
      try {
        await lifecycleHook.resume(hookToken(identity), { reason: "solved" });
      } catch (error) {
        // The hook is live for essentially the whole run (see instance-lifecycle.ts), so
        // this should be rare — a narrow race on the workflow's own loop iteration, or the
        // run already reaching a terminal state on its own. Either way it's not this
        // webhook's job to retry: the instance still reaps on its normal TTL regardless.
        if (!(error instanceof HookNotFoundError)) throw error;
      }
    }
  }

  return NextResponse.json({ ok: true });
}
