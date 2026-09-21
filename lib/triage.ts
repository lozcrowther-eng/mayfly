import { generateObject } from "ai";
import { z } from "zod";

// Cheap, fast, general-purpose — this is small structured extraction over a few hundred
// tokens of boot output, not reasoning. Picked from the live AI Gateway catalog
// (https://ai-gateway.vercel.sh/v1/models): $0.10/$0.40 per million tokens, explicitly
// tagged "fast," and unlike its gpt-5-nano sibling it actually supports `temperature`
// (gpt-5-nano's catalog entry lists `"temperature": false`) — needed since low temperature
// is the whole point of a deterministic-ish classification call. inference-net's
// "schematron" models looked tempting for the "structured-output" tag alone, but their
// catalog description scopes them to HTML extraction specifically, not arbitrary log text,
// so a general-purpose model was the more honest fit for this input domain.
const TRIAGE_MODEL = "openai/gpt-4.1-nano";
const TEMPERATURE = 0.1;
const MAX_OUTPUT_TOKENS = 300;

export const TriageSchema = z.object({
  cause: z.string().describe("A concise technical diagnosis of why the sandbox never became healthy."),
  remediation: z.string().describe("A concrete, actionable next step to fix it."),
  retryable: z
    .boolean()
    .describe(
      "True only if creating a fresh sandbox and running the exact same, unchanged code again would plausibly succeed (a network blip pulling an image, a dependency not ready yet, a legitimately slow but still-in-progress startup). False if the exact same failure would happen again identically — wrong port number, a missing required file/env var/secret, or broken application code. A retry changes nothing about the sandbox's configuration or code, so if the failure is caused by either of those, it is never retryable.",
    ),
  confidence: z.number().min(0).max(1).describe("Confidence in this diagnosis, from 0 to 1."),
});
export type Triage = z.infer<typeof TriageSchema>;

// Every captured output includes these two lines from the health-check probe itself (see
// waitForHealthy in app/workflows/instance-lifecycle.ts) — `HTTP_STATUS:000`/`CURL_EXIT:7`
// for "couldn't connect at all" is IDENTICAL whether the real cause is a port mismatch, a
// slow boot, or nothing ever listening. A first pass of scripts/eval-triage.ts (against
// fixtures/triage/) found the model defaulting to a generic "connection issue, maybe retry"
// diagnosis for exactly the fixtures where this probe line was the most prominent signal,
// ignoring distinguishing detail sitting a few lines above it in the app's own boot log.
// Splitting the two apart below and explicitly labeling the probe line as usually
// uninformative on its own is the fix for that.
const PROBE_LINE_PATTERN = /^(HTTP_STATUS:.*|CURL_EXIT:.*)$/gm;

/**
 * The one place this repo calls out to an LLM. Takes raw captured sandbox output (stdout
 * and stderr are merged at capture time — see lib/sandbox/real-client.ts's LOG_PATH — so
 * there is no real separation to preserve here) and returns a structured diagnosis.
 *
 * Exported directly (not just as a workflow step) so scripts/eval-triage.ts can call it
 * against fixtures without spinning up a workflow run.
 */
export async function triageBootFailure(bootOutput: string): Promise<Triage> {
  const probeLines = [...bootOutput.matchAll(PROBE_LINE_PATTERN)].map((m) => m[0]).join(" ");
  const appLog = bootOutput.replace(PROBE_LINE_PATTERN, "").trim();

  const { object } = await generateObject({
    model: TRIAGE_MODEL,
    schema: TriageSchema,
    schemaName: "triage",
    schemaDescription: "Diagnosis of why a CTF challenge sandbox failed its health check.",
    temperature: TEMPERATURE,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    prompt: [
      "A CTF challenge sandbox failed repeated health checks and its create/boot retries",
      "were exhausted.",
      "",
      "--- health-check probe result ---",
      probeLines || "(none captured)",
      "This line only tells you the health check couldn't get a 200 response. It looks",
      "almost identical across totally different root causes (wrong port, slow boot,",
      "nothing listening, or the process crashed outright) — do not base cause or",
      "retryable mainly on this line.",
      "--- end probe result ---",
      "",
      "--- application boot log (stdout+stderr, merged) — this is the primary evidence ---",
      appLog || "(nothing was captured — the process likely never started)",
      "--- end application boot log ---",
      "",
      "Diagnose the most likely root cause using the application boot log above the probe",
      "result whenever both are present.",
      "",
      "For retryable, worked examples of the exact judgment call to make:",
      '  - "OOM killed the process" -> retryable: false (the memory limit is unchanged on a retry, it OOMs again)',
      '  - "missing required env var / secret" -> retryable: false (still unset on a retry)',
      '  - "server listening on port 3000 but health check hit a different port" -> retryable: false (the port numbers do not change on a retry)',
      '  - "exec format error / entrypoint not found" -> retryable: false (the image is still broken on a retry)',
      '  - "image registry timed out / DNS failure pulling the image" -> retryable: true (a fresh attempt may simply not hit the same transient network blip)',
      '  - "still running migrations / dependency install when checks were exhausted" -> retryable: true (more wall-clock time on a fresh attempt may let it finish)',
      "The pattern: retryable is true only for a one-off external hiccup unrelated to this",
      "sandbox's own configuration or code. Anything that is a fixed property of the",
      "configuration or code itself is false, even when the failure mode superficially",
      "resembles a connectivity or timing issue.",
    ].join("\n"),
  });

  return object;
}
