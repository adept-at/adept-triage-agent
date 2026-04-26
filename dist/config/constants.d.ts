export declare const LOG_LIMITS: {
    readonly GITHUB_MAX_SIZE: 50000;
    readonly ARTIFACT_SOFT_CAP: 20000;
    readonly ERROR_CONTEXT_BEFORE: 500;
    readonly ERROR_CONTEXT_AFTER: 1500;
    readonly SERVER_ERROR_CONTEXT_BEFORE: 1000;
    readonly SERVER_ERROR_CONTEXT_AFTER: 2000;
    readonly PROMPT_MAX_LOG_SIZE: 200000;
};
export declare const CONFIDENCE: {
    readonly BASE: 70;
    readonly INDICATOR_BONUS: 5;
    readonly MAX_INDICATOR_BONUS: 15;
    readonly SCREENSHOT_BONUS: 10;
    readonly MULTIPLE_SCREENSHOT_BONUS: 5;
    readonly LOGS_BONUS: 5;
    readonly PR_DIFF_BONUS: 5;
    readonly FRAMEWORK_BONUS: 5;
    readonly MAX_CONFIDENCE: 95;
    readonly MIN_FIX_CONFIDENCE: 50;
};
export declare const OPENAI: {
    readonly MODEL: "gpt-5.5";
    readonly LEGACY_MODEL: "gpt-5.5";
    readonly UPGRADED_MODEL: "gpt-5.5";
    readonly MAX_COMPLETION_TOKENS: 24000;
    readonly MAX_RETRIES: 3;
    readonly RETRY_DELAY_MS: 1000;
};
export declare const AGENT_MODEL: {
    readonly classification: "gpt-5.5";
    readonly analysis: "gpt-5.5";
    readonly investigation: "gpt-5.5";
    readonly fixGeneration: "gpt-5.5";
    readonly review: "gpt-5.5";
};
export declare const REASONING_EFFORT: {
    readonly classification: "high";
    readonly analysis: "high";
    readonly investigation: "high";
    readonly fixGeneration: "xhigh";
    readonly review: "xhigh";
};
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
export declare function supportsReasoningEffort(model: string): boolean;
export declare const SHORT_SHA_LENGTH = 7;
export declare const ARTIFACTS: {
    readonly MAX_PR_DIFF_FILES: 30;
    readonly MAX_PATCH_LINES: 20;
};
export declare const FORMATTING: {
    readonly MAIN_SUMMARY_MAX_LENGTH: 1000;
};
export declare const ERROR_TYPES: {
    readonly ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND";
    readonly TIMEOUT: "TIMEOUT";
    readonly ASSERTION_FAILED: "ASSERTION_FAILED";
    readonly NETWORK_ERROR: "NETWORK_ERROR";
    readonly ELEMENT_NOT_VISIBLE: "ELEMENT_NOT_VISIBLE";
    readonly ELEMENT_COVERED: "ELEMENT_COVERED";
    readonly ELEMENT_DETACHED: "ELEMENT_DETACHED";
    readonly INVALID_ELEMENT_TYPE: "INVALID_ELEMENT_TYPE";
    readonly UNKNOWN: "UNKNOWN";
};
export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];
export declare const TEST_ISSUE_CATEGORIES: {
    readonly ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND";
    readonly TIMEOUT: "TIMEOUT";
    readonly VISIBILITY: "VISIBILITY";
    readonly ASSERTION: "ASSERTION";
    readonly NETWORK: "NETWORK";
    readonly UNKNOWN: "UNKNOWN";
};
export type TestIssueCategory = (typeof TEST_ISSUE_CATEGORIES)[keyof typeof TEST_ISSUE_CATEGORIES];
export declare const AUTO_FIX: {
    readonly DEFAULT_MIN_CONFIDENCE: 70;
    readonly BRANCH_PREFIX: "fix/triage-agent/";
};
export declare const DEFAULT_PRODUCT_REPO = "adept-at/learn-webapp";
export declare const DEFAULT_PRODUCT_URL = "https://learn.adept.at";
export declare const AGENT_CONFIG: {
    readonly MAX_AGENT_ITERATIONS: 3;
    readonly AGENT_TIMEOUT_MS: 900000;
    readonly REVIEW_REQUIRED_CONFIDENCE: 70;
    readonly INVESTIGATION_CHAIN_CONFIDENCE: 80;
};
export declare const FIX_VALIDATE_LOOP: {
    readonly MAX_ITERATIONS: 3;
    readonly TEST_TIMEOUT_MS: 900000;
};
export declare const CHRONIC_FLAKINESS_THRESHOLD = 3;
export declare const BLAST_RADIUS: {
    readonly SHARED_CODE_PATTERNS: readonly string[];
    readonly SHARED_CODE_BOOST: 10;
    readonly MULTI_FILE_BOOST: 5;
    readonly MAX_REQUIRED_CONFIDENCE: 95;
};
//# sourceMappingURL=constants.d.ts.map