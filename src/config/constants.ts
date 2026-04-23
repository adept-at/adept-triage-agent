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
  MODEL: 'gpt-5.3-codex',
  /** Pre-v1.51 model — used by classification, analysis, investigation, single-shot */
  LEGACY_MODEL: 'gpt-5.3-codex',
  /** v1.51+ model — used by fix-generation and review agents */
  UPGRADED_MODEL: 'gpt-5.4',
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
  singleShot: OPENAI.LEGACY_MODEL,
} as const;

/**
 * Per-agent reasoning effort. 'none' means no `reasoning` field in the
 * Responses-API call — bit-exact with today's pre-v1.51 behavior. Only
 * the upgraded agents send an effort value.
 */
export const REASONING_EFFORT = {
  classification: 'none',
  analysis: 'none',
  investigation: 'none',
  fixGeneration: 'xhigh',
  review: 'xhigh',
  singleShot: 'none',
} as const;

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

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
} as const;

/** Agentic repair system configuration */
/** The product repository. All browser-test repos target learn-webapp. */
export const DEFAULT_PRODUCT_REPO = 'adept-at/learn-webapp';

/** Production URL for learn-webapp. Used as the default preview URL for validation. */
export const DEFAULT_PRODUCT_URL = 'https://learn.adept.at';

export const AGENT_CONFIG = {
  /** Enable multi-agent repair approach (default: true) */
  ENABLE_AGENTIC_REPAIR: process.env.ENABLE_AGENTIC_REPAIR !== 'false',
  /** Maximum iterations for the fix generation/review loop */
  MAX_AGENT_ITERATIONS: 3,
  /**
   * Total timeout for the entire agent orchestration. Bumped from
   * 120_000 (2 min) to 300_000 (5 min) in v1.51.0 to accommodate
   * xhigh reasoning-effort latency on fix-gen + review. A 3-iteration
   * repair at xhigh can reach ~245s; 300s provides margin. See R3 in
   * docs/gpt-5-4-upgrade-plan.md.
   *
   * This is the value passed as `totalTimeoutMs` into the orchestrator
   * at construction time (simplified-repair-agent.ts), which overrides
   * the `DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs` default — so both
   * must be bumped for the increase to take effect in production.
   */
  AGENT_TIMEOUT_MS: 300_000,
  /** Minimum confidence required to accept a fix from review agent */
  REVIEW_REQUIRED_CONFIDENCE: 70,
  /** Below this confidence, chain analysis context into investigation for richer context */
  INVESTIGATION_CHAIN_CONFIDENCE: 80,
} as const;

/** Iterative fix-validate loop configuration */
export const FIX_VALIDATE_LOOP = {
  MAX_ITERATIONS: 3,
  /** Maximum time for a single local test run (5 minutes) */
  TEST_TIMEOUT_MS: 300_000,
} as const;

/**
 * When a spec has been auto-fixed at least this many times within the
 * short/long flakiness window (see FLAKY_THRESHOLDS in skill-store.ts),
 * the coordinator will skip auto-fix and surface the analysis for human
 * review instead. The signal is that the agent is "stacking fallbacks"
 * rather than addressing the underlying synchronization/product issue,
 * and another auto-fix is unlikely to help.
 */
export const CHRONIC_FLAKINESS_THRESHOLD = 3;

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
   * Cap for the *scaling* portion of requiredConfidence — we never push the
   * threshold beyond this via blast-radius boosts, because the model rarely
   * emits >95 and doing so would reject viable fixes. Callers passing a
   * higher explicit floor (e.g. `autoFixMinConfidence = 100`) are honored
   * — the cap never demotes the caller's explicit threshold.
   */
  MAX_REQUIRED_CONFIDENCE: 95,
} as const;
