import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TriageSchema, triageBootFailure } from "../lib/triage";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures", "triage");

interface Fixture {
  name: string;
  bootOutput: string;
  expectedCause: string;
  expectedRetryable: boolean;
  note?: string;
}

interface Result {
  fixture: Fixture;
  schemaValid: boolean;
  causeMatch: boolean;
  retryableMatch: boolean;
  actual?: { cause: string; remediation: string; retryable: boolean; confidence: number };
  error?: string;
}

/**
 * "Cause classification accuracy" doesn't mean exact string equality against
 * expectedCause — the model's `cause` is free text, not an enum (that's deliberate: a
 * fixed taxonomy would force real failures into the nearest bucket instead of describing
 * what's actually wrong). A fixture's expectedCause is instead a small set of keywords that
 * a CORRECT diagnosis should mention; this is a substring/keyword check, not exact match.
 */
const CAUSE_KEYWORDS: Record<string, string[]> = {
  "oom-kill": ["memory", "oom", "killed"],
  "port-mismatch": ["port", "wrong port", "different port", "mismatch"],
  "missing-env-var": ["environment variable", "env var", "missing", "database_url"],
  "image-pull-failure": ["pull", "registry", "image"],
  "slow-boot": ["migration", "still", "initializ", "slow", "not finished", "in progress"],
  "crash-loop": ["crash", "restart", "undefined", "exception", "typeerror"],
  "bad-entrypoint": ["entrypoint", "start.sh", "not found", "cannot execute"],
  "flag-not-injected": ["flag", "environment variable"],
  "nothing-listening": ["not listening", "no port", "never bound", "not bound", "nothing listening"],
  "healthcheck-500": ["500", "internal server error", "redis", "econnrefused"],
};

function causeMatches(fixtureName: string, actualCause: string): boolean {
  const keywords = CAUSE_KEYWORDS[fixtureName] ?? [];
  const lower = actualCause.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) as Fixture);
}

async function runFixture(fixture: Fixture): Promise<Result> {
  try {
    const triage = await triageBootFailure(fixture.bootOutput);

    // triageBootFailure already returns a Zod-parsed object (generateObject validates
    // against TriageSchema internally and throws on failure) — re-validating here makes
    // "schema-validity rate" measure the same contract an eval reader would expect to see
    // checked explicitly, rather than relying on triageBootFailure never having thrown.
    const parsed = TriageSchema.safeParse(triage);

    return {
      fixture,
      schemaValid: parsed.success,
      causeMatch: parsed.success && causeMatches(fixture.name, parsed.data.cause),
      retryableMatch: parsed.success && parsed.data.retryable === fixture.expectedRetryable,
      actual: parsed.success ? parsed.data : undefined,
    };
  } catch (error) {
    return {
      fixture,
      schemaValid: false,
      causeMatch: false,
      retryableMatch: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const fixtures = loadFixtures();
  console.log(`Running triage eval against ${fixtures.length} fixtures...\n`);

  const results: Result[] = [];
  for (const fixture of fixtures) {
    const result = await runFixture(fixture);
    results.push(result);

    const status = result.error ? "ERROR" : result.schemaValid ? "ok" : "INVALID SCHEMA";
    console.log(`[${status}] ${fixture.name}`);
    if (result.actual) {
      console.log(`  cause:      ${result.actual.cause}`);
      console.log(`  retryable:  ${result.actual.retryable} (expected ${fixture.expectedRetryable}) ${result.retryableMatch ? "✓" : "✗"}`);
      console.log(`  confidence: ${result.actual.confidence}`);
      console.log(`  cause match: ${result.causeMatch ? "✓" : "✗"}`);
    } else if (result.error) {
      console.log(`  ${result.error}`);
    }
    console.log("");
  }

  const total = results.length;
  const schemaValidCount = results.filter((r) => r.schemaValid).length;
  const causeMatchCount = results.filter((r) => r.causeMatch).length;
  const retryableMatchCount = results.filter((r) => r.retryableMatch).length;

  console.log("=== Summary ===");
  console.log(`Schema validity:        ${schemaValidCount}/${total} (${((schemaValidCount / total) * 100).toFixed(0)}%)`);
  console.log(`Cause classification:   ${causeMatchCount}/${total} (${((causeMatchCount / total) * 100).toFixed(0)}%)`);
  console.log(`Retryable classification: ${retryableMatchCount}/${total} (${((retryableMatchCount / total) * 100).toFixed(0)}%)`);

  const failedSchema = results.filter((r) => !r.schemaValid);
  if (failedSchema.length > 0) {
    console.log(`\nSchema failures: ${failedSchema.map((r) => r.fixture.name).join(", ")}`);
  }
  const failedCause = results.filter((r) => r.schemaValid && !r.causeMatch);
  if (failedCause.length > 0) {
    console.log(`Cause mismatches: ${failedCause.map((r) => r.fixture.name).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
