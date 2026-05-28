/**
 * Centralized configuration constants for the triage agent
 */

/** Log size limits for different data sources */
export const LOG_LIMITS = {
  /** Maximum size for GitHub Actions logs (50KB) */
  GITHUB_MAX_SIZE: 50_000,
  /** Soft cap for artifact logs (20KB) */
  ARTIFACT_SOFT_CAP: 20_000,
  /** Characters of context to include before error */
  ERROR_CONTEXT_BEFORE: 500,
  /** Characters of context to include after error */
  ERROR_CONTEXT_AFTER: 1500,
  /** Extended context for server verification errors */
  SERVER_ERROR_CONTEXT_BEFORE: 1000,
  /** Extended context for server verification errors */
  SERVER_ERROR_CONTEXT_AFTER: 2000,
  /** Hard cap for combined log payload sent to the model (~50K tokens) */
  PROMPT_MAX_LOG_SIZE: 200_000,
} as const;

/** Confidence calculation constants */
export const CONFIDENCE = {
  /** Base confidence score */
  BASE: 70,
  /** Bonus per indicator found */
  INDICATOR_BONUS: 5,
  /** Maximum bonus from indicators */
  MAX_INDICATOR_BONUS: 15,
  /** Bonus for having screenshots */
  SCREENSHOT_BONUS: 10,
  /** Bonus for multiple screenshots */
  MULTIPLE_SCREENSHOT_BONUS: 5,
  /** Bonus for having logs */
  LOGS_BONUS: 5,
  /** Bonus for having PR diff */
  PR_DIFF_BONUS: 5,
  /** Bonus for known framework */
  FRAMEWORK_BONUS: 5,
  /** Maximum possible confidence */
  MAX_CONFIDENCE: 95,
  /** Minimum confidence to generate fix recommendation */
  MIN_FIX_CONFIDENCE: 50,
} as const;

/** OpenAI API configuration */
export const OPENAI = {
  /** @deprecated Use LEGACY_MODEL or UPGRADED_MODEL. Kept for backward compat with tests/scripts that reference OPENAI.MODEL. */
  MODEL: 'gpt-5.5',
  /** Default model for classification, analysis, and investigation. */
  LEGACY_MODEL: 'gpt-5.5',
  /** Model family used by fix-generation and review agents. */
  UPGRADED_MODEL: 'gpt-5.5',
  /** Maximum completion tokens */
  MAX_COMPLETION_TOKENS: 24000,
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Base retry delay in milliseconds */
  RETRY_DELAY_MS: 1000,
} as const;

/**
 * Per-agent model selection. Entries explicitly name the legacy model
 * for unchanged agents so reverting the upgrade is a one-line edit
 * (flip AGENT_MODEL.fixGeneration and AGENT_MODEL.review back to
 * OPENAI.LEGACY_MODEL).
 */
export const AGENT_MODEL = {
  classification: OPENAI.LEGACY_MODEL,
  analysis: OPENAI.LEGACY_MODEL,
  investigation: OPENAI.LEGACY_MODEL,
  fixGeneration: OPENAI.UPGRADED_MODEL,
  review: OPENAI.UPGRADED_MODEL,
} as const;

/**
 * Per-agent reasoning effort. Classification, analysis, and investigation
 * use high reasoning; fix-generation and review use xhigh.
 */
export const REASONING_EFFORT = {
  classification: 'high',
  analysis: 'high',
  investigation: 'high',
  fixGeneration: 'xhigh',
  review: 'xhigh',
} as const;

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export function supportsReasoningEffort(model: string): boolean {
  return model.startsWith('gpt-5.5');
}

/** Short SHA display length */
export const SHORT_SHA_LENGTH = 7;

/** Artifact and file processing limits */
export const ARTIFACTS = {
  /** Maximum files to show from PR diff */
  MAX_PR_DIFF_FILES: 30,
  /** Maximum patch lines to include per file */
  MAX_PATCH_LINES: 20,
} as const;

/** Summary and output formatting */
export const FORMATTING = {
  /** Maximum length for main summaries */
  MAIN_SUMMARY_MAX_LENGTH: 1000,
} as const;

/** Error classification categories */
export const ERROR_TYPES = {
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  ELEMENT_NOT_VISIBLE: 'ELEMENT_NOT_VISIBLE',
  ELEMENT_COVERED: 'ELEMENT_COVERED',
  ELEMENT_DETACHED: 'ELEMENT_DETACHED',
  INVALID_ELEMENT_TYPE: 'INVALID_ELEMENT_TYPE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

/** Test issue categories for classification */
export const TEST_ISSUE_CATEGORIES = {
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  VISIBILITY: 'VISIBILITY',
  ASSERTION: 'ASSERTION',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN',
} as const;

export type TestIssueCategory =
  (typeof TEST_ISSUE_CATEGORIES)[keyof typeof TEST_ISSUE_CATEGORIES];

/** Auto-fix feature configuration */
export const AUTO_FIX = {
  /** Default minimum confidence to apply auto-fix */
  DEFAULT_MIN_CONFIDENCE: 70,
  /** Branch prefix for auto-fix branches */
  BRANCH_PREFIX: 'fix/triage-agent/',
  /**
   * Window during which an existing fix branch for the same spec causes
   * a new fix attempt to be refused. Audit runs `25751919179` and
   * `25752503143` produced overlapping branches for the same spec within
   * 12 minutes. 6 hours is generous enough to cover flaky-test retries
   * within a workday but short enough that an operator who deleted the
   * stale branch can rerun the agent without waiting.
   */
  BRANCH_DEDUPE_WINDOW_MS: 6 * 60 * 60 * 1000,
} as const;

/** Agentic repair system configuration */
/** The product repository. All browser-test repos target learn-webapp. */
export const DEFAULT_PRODUCT_REPO = 'adept-at/learn-webapp';

/** Production URL for learn-webapp. Used as the default preview URL for validation. */
export const DEFAULT_PRODUCT_URL = 'https://learn.adept.at';

/**
 * Absolute confidence threshold for accepting an InvestigationAgent
 * `verdictOverride` that flags the failure as `APP_CODE` (product-side).
 *
 * Pre this constant the orchestrator compared `verdictOverride.confidence`
 * to `analysis.confidence` directly, but the two scales mean different
 * things: analysis confidence measures certainty in a *root-cause
 * category* (e.g. "selector mismatch vs timing"), while the override
 * confidence measures certainty in a *defect location* (test code vs
 * product code). When AnalysisAgent was 95% confident the symptom was a
 * selector mismatch but InvestigationAgent was 90% confident the bug was
 * actually product-side, the override gate `90 >= 95` evaluated false
 * and the agent shipped a test-side fix that papered over a real product
 * regression. (See `code_review_may_2026.md` finding #4.)
 *
 * Replacing the comparison with an absolute threshold eliminates the
 * scale mismatch: a confident product-side override fires regardless of
 * how confident analysis was in its (different) categorization. 70% is
 * conservative enough to avoid spurious overrides — InvestigationAgent
 * has the full code-reading context and more evidence than analysis when
 * it produces an override at all — and it matches the
 * `AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE` floor used elsewhere as
 * "this is a non-trivial signal."
 */
export const VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD = 70;

export const AGENT_CONFIG = {
  /** Maximum iterations for the fix generation/review loop */
  MAX_AGENT_ITERATIONS: 3,
  /**
   * Total timeout for the entire agent orchestration. GPT-5.5 xhigh can
   * spend several minutes on fix-generation + review, especially across
   * the 3-iteration loop, so the action allows a 15-minute orchestration
   * budget before giving up.
   *
   * This is the value passed as `totalTimeoutMs` into the orchestrator
   * at construction time (simplified-repair-agent.ts), which overrides
   * the `DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs` default — so both
   * must be bumped for the increase to take effect in production.
   */
  AGENT_TIMEOUT_MS: 900_000,
  /** Minimum confidence required to accept a fix from review agent */
  REVIEW_REQUIRED_CONFIDENCE: 70,
  /** Below this confidence, chain analysis context into investigation for richer context */
  INVESTIGATION_CHAIN_CONFIDENCE: 80,
} as const;

/** Iterative fix-validate loop configuration */
export const FIX_VALIDATE_LOOP = {
  MAX_ITERATIONS: 3,
  /** Maximum time for a single local test run (15 minutes) */
  TEST_TIMEOUT_MS: 900_000,
} as const;

/**
 * Blast-radius confidence scaling.
 *
 * A fix that touches a widely-shared file (page objects, helpers, commands,
 * fixtures) can break many tests at once, so we require higher confidence
 * than a spec-local fix. Likewise, a fix that spans multiple files is less
 * tightly scoped than a single-file change and deserves more scrutiny.
 *
 * Usage: validator/coordinator adds these offsets to the base
 * `minConfidence` (DEFAULT_MIN_CONFIDENCE or user override) when computing
 * the required confidence for the current fix. Values are additive and
 * capped at 95 so we never demand a confidence the model cannot emit.
 */
export const BLAST_RADIUS = {
  /**
   * Directory fragments that indicate shared code (test infra, page objects,
   * helpers). Matched case-insensitively against the file path with a leading
   * slash prepended, so `test/PageObjects/X.ts` and `PageObjects/X.ts` both
   * match `/pageobjects/`. Paths list canonical lowercase fragments.
   */
  SHARED_CODE_PATTERNS: [
    '/pageobjects/',
    '/page-objects/',
    '/pages/',
    '/screens/',
    '/helpers/',
    '/utils/',
    '/commands/',
    '/fixtures/',
    '/support/',
    '/shared/',
    '/common/',
    '/step-definitions/',
  ] as readonly string[],
  /** Added to minConfidence when any proposedChange touches shared code. */
  SHARED_CODE_BOOST: 10,
  /** Added to minConfidence when the fix spans 2+ distinct files. */
  MULTI_FILE_BOOST: 5,
  /**
   * Semantic blast-radius factors — beyond file paths and file count, a fix
   * can have wide impact via the *kind* of change it makes. These factors
   * detect specific patterns in the proposed `newCode` and add a confidence
   * boost when present.
   *
   * Rationale: a 1-line null check in a shared helper has narrow blast (the
   * helper's existing callers are already paying the null-check tax). A
   * global timeout multiplier in the same helper has wide blast — every
   * test that uses the helper now waits longer, which can extend total
   * suite duration, mask other regressions, or cascade into Sauce minute
   * budgets. Path-only blast-radius scoring cannot distinguish these two.
   */
  /**
   * Regex (case-insensitive, source string) matched against each
   * proposedChange.newCode. If at least one change introduces a global wait
   * / timeout multiplier (e.g. `timeout: 300000`, `setTimeout(..., 60000)`),
   * the confidence threshold is bumped because the change affects every
   * test that flows through that code path, not just the failing one.
   *
   * Conservative pattern: only match when the timeout value is large
   * (≥30s as a literal millisecond number). Smaller waits are routine
   * and shouldn't trigger the gate.
   */
  GLOBAL_TIMEOUT_PATTERN:
    'timeout\\s*[:=]\\s*([3-9]\\d{4}|[1-9]\\d{5,})|setTimeout\\s*\\(\\s*[^,]+,\\s*([3-9]\\d{4}|[1-9]\\d{5,})',
  /** Added when a change introduces or extends a large global timeout (>=30s). */
  GLOBAL_TIMEOUT_BOOST: 5,
  /**
   * Recent same-spec failed-trajectory penalty.
   *
   * When the skill store contains a `validatedLocally=false` skill for the
   * same spec saved within `RECENT_FAILED_WINDOW_MS`, that skill represents
   * a fix the agent already shipped that already failed validation. Trying
   * again on the same spec without strong new signal is unlikely to
   * succeed; the gate raises the required confidence by this amount per
   * recent failure (capped by `MAX_REQUIRED_CONFIDENCE`).
   *
   * The signal already exists in DynamoDB (failed trajectories are saved
   * with `validatedLocally=false` per v1.52.5 / v1.52.9). Pre this change,
   * retrieval surfaced those skills into agent prompts but did not change
   * the auto-apply gate — so a duplicate fix attempt could still ship
   * minutes later. See audit run `25752503143` (run B), which retrieved
   * run A's failed trajectory `da37c077` from 12 minutes earlier and
   * still auto-applied at 90% confidence.
   */
  RECENT_FAILED_TRAJECTORY_BOOST: 8,
  /** Window (ms) within which a saved failed trajectory still counts as "recent." 24h. */
  RECENT_FAILED_WINDOW_MS: 24 * 60 * 60 * 1000,
  /** Cap on the per-trajectory boost — at most this many points from prior failures. */
  RECENT_FAILED_MAX_BOOST: 16,
  /**
   * Heuristic: if a fix in a shared file (helper / page-object / utils)
   * also changes the EXPORTED FUNCTION SIGNATURE or rethrows where the
   * old code returned, every existing caller is now affected. Detected
   * by the fix touching a shared file AND a `newCode` block introducing
   * `throw` where `oldCode` did not — i.e. the helper's contract changed
   * from "swallow on error" to "rethrow." This is the pattern that
   * caused run B's strict-before-hook validation failure in the audit.
   */
  HELPER_CONTRACT_CHANGE_BOOST: 5,
  /**
   * Cap for the *scaling* portion of requiredConfidence — we never push the
   * threshold beyond this via blast-radius boosts, because the model rarely
   * emits >95 and doing so would reject viable fixes. Callers passing a
   * higher explicit floor (e.g. `autoFixMinConfidence = 100`) are honored
   * — the cap never demotes the caller's explicit threshold.
   */
  MAX_REQUIRED_CONFIDENCE: 95,
} as const;
