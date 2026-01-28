export declare const LOG_LIMITS: {
    readonly GITHUB_MAX_SIZE: 50000;
    readonly ARTIFACT_SOFT_CAP: 20000;
    readonly ERROR_CONTEXT_BEFORE: 500;
    readonly ERROR_CONTEXT_AFTER: 1500;
    readonly SERVER_ERROR_CONTEXT_BEFORE: 1000;
    readonly SERVER_ERROR_CONTEXT_AFTER: 2000;
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
    readonly MODEL: "gpt-5.2";
    readonly TEMPERATURE: 0.3;
    readonly MAX_COMPLETION_TOKENS: 16384;
    readonly MAX_RETRIES: 3;
    readonly RETRY_DELAY_MS: 1000;
};
export declare const ARTIFACTS: {
    readonly MAX_PR_DIFF_FILES: 30;
    readonly MAX_PATCH_LINES: 20;
    readonly MAX_RELEVANT_FILES: 10;
    readonly LOG_PREVIEW_LENGTH: 1000;
    readonly PATCH_PREVIEW_LENGTH: 500;
};
export declare const FORMATTING: {
    readonly SLACK_MAX_LENGTH: 2900;
    readonly BRIEF_SUMMARY_MAX_LENGTH: 500;
    readonly MAIN_SUMMARY_MAX_LENGTH: 1000;
    readonly TRUNCATION_BUFFER: 100;
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
export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];
export declare const TEST_ISSUE_CATEGORIES: {
    readonly ELEMENT_NOT_FOUND: "ELEMENT_NOT_FOUND";
    readonly TIMEOUT: "TIMEOUT";
    readonly VISIBILITY: "VISIBILITY";
    readonly ASSERTION: "ASSERTION";
    readonly NETWORK: "NETWORK";
    readonly UNKNOWN: "UNKNOWN";
};
export type TestIssueCategory = typeof TEST_ISSUE_CATEGORIES[keyof typeof TEST_ISSUE_CATEGORIES];
export declare const AUTO_FIX: {
    readonly DEFAULT_MIN_CONFIDENCE: 70;
    readonly BRANCH_PREFIX: "fix/triage-agent/";
};
//# sourceMappingURL=constants.d.ts.map