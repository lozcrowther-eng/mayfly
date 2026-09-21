import { start } from "workflow/api";
import { instanceLifecycle } from "@/app/workflows/instance-lifecycle";
import { getChallenge } from "@/lib/fixtures/challenges";
import type { LaunchInput } from "@/lib/types";
import type { LaunchRequest } from "./schemas";

export class UnknownChallengeError extends Error {}

/**
 * Shared by both launch entrypoints: the HMAC-signed /api/instances (the CTFd plugin's
 * contract, see CLAUDE.md) and the unsigned /api/launch (same-origin browser calls from the
 * player view — there's no shared secret a browser could hold without leaking it to every
 * player, so that boundary simply doesn't apply to it the way it does to CTFd<->Vercel).
 */
export async function launchInstance(input: LaunchRequest): Promise<{ runId: string }> {
  const challenge = getChallenge(input.challengeId);
  if (!challenge) {
    throw new UnknownChallengeError(`unknown challengeId: ${input.challengeId}`);
  }

  const launchInput: LaunchInput = {
    challengeId: input.challengeId,
    teamId: input.teamId,
    ttlSeconds: input.ttlSeconds,
    ports: challenge.ports,
  };

  // Enqueue and return immediately — never block this response on provisioning. CTFd's
  // gunicorn worker pool is bounded, and an event's opening rush would exhaust it otherwise.
  const run = await start(instanceLifecycle, [launchInput]);
  return { runId: run.runId };
}
