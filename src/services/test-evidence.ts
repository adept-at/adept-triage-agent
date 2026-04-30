/**
 * Test-runner evidence verification.
 *
 * Both validation paths (LocalFixValidator and GitHubFixApplier) used to
 * trust runner exit code / workflow conclusion as proof a fix passed.
 * Two real-world failure modes proved this insufficient:
 *
 *   1. A consumer's `validate-fix.yml` piped Cypress through `tee` without
 *      `set -o pipefail`, so the step exited 0 even when Cypress crashed
 *      with "Can't run because no spec files were found." Validation was
 *      reported as passed; PRs were marked "Fix Validated Successfully";
 *      no tests had actually run.
 *
 *   2. The triage agent passed bare spec basenames to remote validators.
 *      When the consumer didn't resolve them, Cypress saw zero specs and
 *      exited 0.
 *
 * The skill store would then be poisoned with `validatedLocally=true`
 * skills built on lies. To prevent this regardless of the consumer's
 * shell or workflow shape, every "passed" signal must additionally
 * survive a log-evidence check before being trusted.
 *
 * This helper is intentionally framework-agnostic. It looks for either
 * explicit "no tests ran" sentinels (downgrade to fail) or concrete
 * "N passing" / "N passed" markers (accept as pass). Absence of either
 * is treated as inconclusive — also a downgrade — because the cost of
 * a false-validated skill polluting memory outweighs the cost of one
 * extra retry.
 */

/**
 * Sentinel patterns indicating the test runner started but ran zero
 * tests. Any of these in the logs is enough to reject a "passed" signal.
 *
 * Sources include Cypress, Mocha, Jest, and WebdriverIO test reporter
 * output. New patterns can be added freely; false positives here only
 * cause an extra retry, which is the safer side to err on.
 */
const NO_TESTS_RAN_PATTERNS: readonly RegExp[] = [
  /Can't run because no spec files were found/i,
  /No spec files? (?:were )?found/i,
  /No tests? (?:were )?run/i,
  /running\s+0\s+tests?\b/i,
  /Tests:\s+0,/i,
  /\b0\s+passing\b/i,
  /\b0\s+tests?\s+passed\b/i,
  /Spec Files:\s+0\s+passed,\s+0\s+failed,\s+0\s+total/i,
];

/**
 * Patterns indicating concrete passing tests. At least one match is
 * required to accept a "passed" signal from the runner.
 *
 * Match the exact captured number on `passing` / `passed` so we can
 * also reject the degenerate `0 passing` case explicitly.
 */
const POSITIVE_EVIDENCE_PATTERNS: readonly RegExp[] = [
  /(\d+)\s+passing\b/i,
  /Tests?:\s+(\d+)\s+passed/i,
  /✔\s+All specs passed/i,
  /\bPASS\b\s+\S+/,
  /Spec Files:\s+(\d+)\s+passed,\s+0\s+failed/i,
];

export interface TestEvidenceResult {
  /**
   * Whether the runner produced trustworthy evidence that at least one
   * test ran AND passed. `false` means the caller should treat this run
   * as failed even if the underlying exit code / workflow conclusion
   * said success.
   */
  trustworthy: boolean;
  /**
   * Short human-readable explanation, suitable for `core.warning` /
   * `core.info`. Stable enough to grep on in operator workflows.
   */
  reason: string;
  /**
   * The matched marker if positive evidence was found, or the matched
   * sentinel if "no tests ran" was found. `undefined` when the verdict
   * is "inconclusive — neither marker present."
   */
  matched?: string;
}

/**
 * Verify that a runner's logs contain concrete evidence of at least one
 * test passing. Used by both validation paths to gate writes that would
 * otherwise mark a fix as validated.
 *
 * Decision order:
 *   1. If a "no tests ran" sentinel is present, return trustworthy=false
 *      regardless of any positive marker (sentinel wins — runners can
 *      legitimately log a "0 passing" rollup alongside a "PASS suite"
 *      noise line).
 *   2. Otherwise, if any positive marker is present, return trustworthy=true.
 *   3. Otherwise, return trustworthy=false — silence is not consent.
 *
 * The function never throws. Empty / undefined input is treated as
 * inconclusive (= not trustworthy).
 */
export function verifyTestEvidence(logs: string | undefined): TestEvidenceResult {
  if (!logs || logs.length === 0) {
    return {
      trustworthy: false,
      reason: 'no logs available to verify test evidence',
    };
  }

  for (const pattern of NO_TESTS_RAN_PATTERNS) {
    const match = logs.match(pattern);
    if (match) {
      return {
        trustworthy: false,
        reason: `runner reported zero tests ran (matched "${match[0]}")`,
        matched: match[0],
      };
    }
  }

  for (const pattern of POSITIVE_EVIDENCE_PATTERNS) {
    const match = logs.match(pattern);
    if (match) {
      return {
        trustworthy: true,
        reason: `concrete pass evidence (matched "${match[0]}")`,
        matched: match[0],
      };
    }
  }

  return {
    trustworthy: false,
    reason:
      'no concrete pass evidence found in logs (neither "N passing" nor a known runner success marker present)',
  };
}
