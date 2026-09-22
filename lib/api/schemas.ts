import { z } from "zod";

// Mayfly lives about a day at most (see README) — a generous upper bound, not a promise
// any given challenge actually needs that long.
const MAX_TTL_SECONDS = 24 * 60 * 60;

export const LaunchRequestSchema = z.object({
  challengeId: z.string().min(1),
  teamId: z.string().min(1),
  ttlSeconds: z.number().int().positive().max(MAX_TTL_SECONDS),
  // Optional per-request challenge config. A caller that already owns this data (the CTFd
  // plugin's own MayflyChallengeModel, see ctfd_mayfly/challenge.py) provisions directly
  // with these instead of challengeId needing to match a lib/fixtures/challenges.ts entry —
  // see launchInstance() in lib/api/launch.ts for exactly how the two paths split.
  // No `.min(1)` on the strings: an HTML form submits "" for an unfilled optional field,
  // not an omitted key, and .optional() only tolerates the key being absent/undefined, not
  // present-and-empty — confirmed by CTFd's own admin create form doing exactly this for
  // startCommand. lib/api/launch.ts treats an empty string the same as "not provided" as
  // well, so relaxing validation here doesn't just move the problem downstream.
  image: z.string().optional(),
  port: z.number().int().positive().optional(),
  vcpus: z.number().int().positive().optional(),
  startCommand: z.string().optional(),
});
export type LaunchRequest = z.infer<typeof LaunchRequestSchema>;

export const SubmissionWebhookSchema = z.object({
  challengeId: z.string().min(1),
  teamId: z.string().min(1),
  correct: z.boolean(),
});
export type SubmissionWebhook = z.infer<typeof SubmissionWebhookSchema>;
