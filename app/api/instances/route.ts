import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { instanceLifecycle } from "@/app/workflows/instance-lifecycle";
import { LaunchRequestSchema } from "@/lib/api/schemas";
import { getChallenge } from "@/lib/fixtures/challenges";
import { readVerifiedBody, requireSigningSecret, SignedRequestError } from "@/lib/http/signed-request";
import type { LaunchInput } from "@/lib/types";

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

  const challenge = getChallenge(parsed.data.challengeId);
  if (!challenge) {
    return NextResponse.json({ error: `unknown challengeId: ${parsed.data.challengeId}` }, { status: 400 });
  }

  const launchInput: LaunchInput = {
    challengeId: parsed.data.challengeId,
    teamId: parsed.data.teamId,
    ttlSeconds: parsed.data.ttlSeconds,
    ports: challenge.ports,
  };

  // Enqueue and return immediately — never block this response on provisioning. CTFd's
  // gunicorn worker pool is bounded, and an event's opening rush would exhaust it otherwise.
  // run.runId (not one minted here) is the run's one true id — see lib/types.ts (LaunchInput)
  // and app/workflows/instance-lifecycle.ts's getWorkflowMetadata() resolution.
  const run = await start(instanceLifecycle, [launchInput]);

  return NextResponse.json({ runId: run.runId });
}
