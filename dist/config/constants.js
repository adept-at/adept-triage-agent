"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLAST_RADIUS = exports.CHRONIC_FLAKINESS_THRESHOLD = exports.FIX_VALIDATE_LOOP = exports.AGENT_CONFIG = exports.DEFAULT_PRODUCT_URL = exports.DEFAULT_PRODUCT_REPO = exports.AUTO_FIX = exports.TEST_ISSUE_CATEGORIES = exports.ERROR_TYPES = exports.FORMATTING = exports.ARTIFACTS = exports.SHORT_SHA_LENGTH = exports.REASONING_EFFORT = exports.AGENT_MODEL = exports.OPENAI = exports.CONFIDENCE = exports.LOG_LIMITS = void 0;
exports.LOG_LIMITS = {
    GITHUB_MAX_SIZE: 50_000,
    ARTIFACT_SOFT_CAP: 20_000,
    ERROR_CONTEXT_BEFORE: 500,
    ERROR_CONTEXT_AFTER: 1500,
    SERVER_ERROR_CONTEXT_BEFORE: 1000,
    SERVER_ERROR_CONTEXT_AFTER: 2000,
    PROMPT_MAX_LOG_SIZE: 200_000,
};
exports.CONFIDENCE = {
    BASE: 70,
    INDICATOR_BONUS: 5,
    MAX_INDICATOR_BONUS: 15,
    SCREENSHOT_BONUS: 10,
    MULTIPLE_SCREENSHOT_BONUS: 5,
    LOGS_BONUS: 5,
    PR_DIFF_BONUS: 5,
    FRAMEWORK_BONUS: 5,
    MAX_CONFIDENCE: 95,
    MIN_FIX_CONFIDENCE: 50,
};
exports.OPENAI = {
    MODEL: 'gpt-5.3-codex',
    LEGACY_MODEL: 'gpt-5.3-codex',
    UPGRADED_MODEL: 'gpt-5.4',
    MAX_COMPLETION_TOKENS: 24000,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
};
exports.AGENT_MODEL = {
    classification: exports.OPENAI.LEGACY_MODEL,
    analysis: exports.OPENAI.LEGACY_MODEL,
    investigation: exports.OPENAI.LEGACY_MODEL,
    fixGeneration: exports.OPENAI.UPGRADED_MODEL,
    review: exports.OPENAI.UPGRADED_MODEL,
    singleShot: exports.OPENAI.LEGACY_MODEL,
};
exports.REASONING_EFFORT = {
    classification: 'none',
    analysis: 'none',
    investigation: 'none',
    fixGeneration: 'xhigh',
    review: 'xhigh',
    singleShot: 'none',
};
exports.SHORT_SHA_LENGTH = 7;
exports.ARTIFACTS = {
    MAX_PR_DIFF_FILES: 30,
    MAX_PATCH_LINES: 20,
};
exports.FORMATTING = {
    MAIN_SUMMARY_MAX_LENGTH: 1000,
};
exports.ERROR_TYPES = {
    ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
    TIMEOUT: 'TIMEOUT',
    ASSERTION_FAILED: 'ASSERTION_FAILED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    ELEMENT_NOT_VISIBLE: 'ELEMENT_NOT_VISIBLE',
    ELEMENT_COVERED: 'ELEMENT_COVERED',
    ELEMENT_DETACHED: 'ELEMENT_DETACHED',
    INVALID_ELEMENT_TYPE: 'INVALID_ELEMENT_TYPE',
    UNKNOWN: 'UNKNOWN',
};
exports.TEST_ISSUE_CATEGORIES = {
    ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
    TIMEOUT: 'TIMEOUT',
    VISIBILITY: 'VISIBILITY',
    ASSERTION: 'ASSERTION',
    NETWORK: 'NETWORK',
    UNKNOWN: 'UNKNOWN',
};
exports.AUTO_FIX = {
    DEFAULT_MIN_CONFIDENCE: 70,
    BRANCH_PREFIX: 'fix/triage-agent/',
};
exports.DEFAULT_PRODUCT_REPO = 'adept-at/learn-webapp';
exports.DEFAULT_PRODUCT_URL = 'https://learn.adept.at';
exports.AGENT_CONFIG = {
    ENABLE_AGENTIC_REPAIR: process.env.ENABLE_AGENTIC_REPAIR !== 'false',
    MAX_AGENT_ITERATIONS: 3,
    AGENT_TIMEOUT_MS: 300_000,
    REVIEW_REQUIRED_CONFIDENCE: 70,
    INVESTIGATION_CHAIN_CONFIDENCE: 80,
};
exports.FIX_VALIDATE_LOOP = {
    MAX_ITERATIONS: 3,
    TEST_TIMEOUT_MS: 300_000,
};
exports.CHRONIC_FLAKINESS_THRESHOLD = 3;
exports.BLAST_RADIUS = {
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
    ],
    SHARED_CODE_BOOST: 10,
    MULTI_FILE_BOOST: 5,
    MAX_REQUIRED_CONFIDENCE: 95,
};
//# sourceMappingURL=constants.js.map