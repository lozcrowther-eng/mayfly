import { z } from "zod";

// Mayfly lives about a day at most (see README) — a generous upper bound, not a promise
// any given challenge actually needs that long.
const MAX_TTL_SECONDS = 24 * 60 * 60;

export const LaunchRequestSchema = z.object({
  challengeId: z.string().min(1),
  teamId: z.string().min(1),
  ttlSeconds: z.number().int().positive().max(MAX_TTL_SECONDS),
});
export type LaunchRequest = z.infer<typeof LaunchRequestSchema>;

export const SubmissionWebhookSchema = z.object({
  challengeId: z.string().min(1),
  teamId: z.string().min(1),
  correct: z.boolean(),
});
export type SubmissionWebhook = z.infer<typeof SubmissionWebhookSchema>;
