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
  /** Model to use for analysis */
  MODEL: 'gpt-5.2',
  /** Temperature for deterministic responses */
  TEMPERATURE: 0.3,
  /** Maximum completion tokens */
  MAX_COMPLETION_TOKENS: 16384,
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Base retry delay in milliseconds */
  RETRY_DELAY_MS: 1000,
} as const;

/** Artifact and file processing limits */
export const ARTIFACTS = {
  /** Maximum files to show from PR diff */
  MAX_PR_DIFF_FILES: 30,
  /** Maximum patch lines to include per file */
  MAX_PATCH_LINES: 20,
  /** Maximum relevant files to show in repair context */
  MAX_RELEVANT_FILES: 10,
  /** Preview length for logs in prompts */
  LOG_PREVIEW_LENGTH: 1000,
  /** Preview length for patches */
  PATCH_PREVIEW_LENGTH: 500,
} as const;

/** Summary and output formatting */
export const FORMATTING = {
  /** Maximum length for Slack summary */
  SLACK_MAX_LENGTH: 2900,
  /** Maximum length for brief summaries */
  BRIEF_SUMMARY_MAX_LENGTH: 500,
  /** Maximum length for main summaries */
  MAIN_SUMMARY_MAX_LENGTH: 1000,
  /** Truncation point before max length */
  TRUNCATION_BUFFER: 100,
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

export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];

/** Test issue categories for classification */
export const TEST_ISSUE_CATEGORIES = {
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  VISIBILITY: 'VISIBILITY',
  ASSERTION: 'ASSERTION',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN',
} as const;

export type TestIssueCategory = typeof TEST_ISSUE_CATEGORIES[keyof typeof TEST_ISSUE_CATEGORIES];

/** Auto-fix feature configuration */
export const AUTO_FIX = {
  /** Default minimum confidence to apply auto-fix */
  DEFAULT_MIN_CONFIDENCE: 70,
  /** Branch prefix for auto-fix branches */
  BRANCH_PREFIX: 'fix/triage-agent/',
} as const;
