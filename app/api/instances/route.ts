import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { instanceLifecycle } from "@/app/workflows/instance-lifecycle";
import { LaunchRequestSchema } from "@/lib/api/schemas";
import { getChallenge } from "@/lib/fixtures/challenges";
import { readVerifiedBody, requireSigningSecret, SignedRequestError } from "@/lib/http/signed-request";
import { recordRun } from "@/lib/runs";
import type { InstanceRequest } from "@/lib/types";

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

  const instanceRequest: InstanceRequest = {
    challengeId: parsed.data.challengeId,
    teamId: parsed.data.teamId,
    // Fresh per launch — CLAUDE.md: reusing a sandbox name resumes a previous player's box.
    runId: crypto.randomUUID(),
    ttlSeconds: parsed.data.ttlSeconds,
    ports: challenge.ports,
  };

  // Enqueue and return immediately — never block this response on provisioning. CTFd's
  // gunicorn worker pool is bounded, and an event's opening rush would exhaust it otherwise.
  const run = await start(instanceLifecycle, [instanceRequest]);
  recordRun(instanceRequest, run.runId);

  return NextResponse.json({ runId: instanceRequest.runId });
}
