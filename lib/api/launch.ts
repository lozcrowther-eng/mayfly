import { start } from "workflow/api";
import { instanceLifecycle } from "@/app/workflows/instance-lifecycle";
import { mintRunToken } from "@/lib/auth/run-token";
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
export async function launchInstance(input: LaunchRequest): Promise<{ runId: string; runToken: string }> {
  let ports: number[];
  let image: string | undefined;
  let vcpus: number | undefined;
  let startCommand: string | undefined;

  if (input.image) {
    // The caller supplied its own challenge config directly (the CTFd plugin, whose
    // MayflyChallengeModel already owns image/port/vcpus/start_command per challenge) — no
    // fixture lookup, and challengeId doesn't need to match anything in
    // lib/fixtures/challenges.ts at all. This is what lets a CTFd-configured challenge whose
    // id is just an auto-incrementing integer actually provision the right sandbox.
    if (!input.port) {
      throw new UnknownChallengeError("port is required when image is provided");
    }
    ports = [input.port];
    image = input.image;
    vcpus = input.vcpus ?? 1;
    startCommand = input.startCommand;
  } else {
    const challenge = getChallenge(input.challengeId);
    if (!challenge) {
      throw new UnknownChallengeError(`unknown challengeId: ${input.challengeId}`);
    }
    ports = challenge.ports;
    image = challenge.image;
    vcpus = challenge.vcpus;
    startCommand = challenge.startCommand;
  }

  const launchInput: LaunchInput = {
    challengeId: input.challengeId,
    teamId: input.teamId,
    ttlSeconds: input.ttlSeconds,
    ports,
    image,
    vcpus,
    startCommand,
  };

  // Enqueue and return immediately — never block this response on provisioning. CTFd's
  // gunicorn worker pool is bounded, and an event's opening rush would exhaust it otherwise.
  const run = await start(instanceLifecycle, [launchInput]);
  return { runId: run.runId, runToken: mintRunToken(run.runId) };
}
