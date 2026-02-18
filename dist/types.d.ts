export type Verdict = 'TEST_ISSUE' | 'PRODUCT_ISSUE';
export interface ErrorData {
    message: string;
    stackTrace?: string;
    framework?: string;
    failureType?: string;
    context?: string;
    testName?: string;
    fileName?: string;
    screenshots?: Screenshot[];
    logs?: string[];
    testArtifactLogs?: string;
    prDiff?: PRDiff;
    structuredSummary?: StructuredErrorSummary;
}
export interface Screenshot {
    name: string;
    path: string;
    base64Data?: string;
    url?: string;
    timestamp?: string;
}
export interface RepairContext {
    testFile: string;
    errorLine?: number;
    testName: string;
    errorType: string;
    errorSelector?: string;
    errorMessage: string;
    workflowRunId: string;
    jobName: string;
    commitSha: string;
    branch: string;
    repository: string;
    prNumber?: string;
    targetAppPrNumber?: string;
}
export interface AnalysisResult {
    verdict: Verdict;
    confidence: number;
    reasoning: string;
    summary?: string;
    indicators?: string[];
    suggestedSourceLocations?: SourceLocation[];
    evidence?: string[];
    suggestedAction?: string;
    category?: string;
    affectedTests?: string[];
    patterns?: Record<string, unknown>;
    repairContext?: RepairContext;
    fixRecommendation?: FixRecommendation;
}
export interface FixRecommendation {
    confidence: number;
    summary: string;
    proposedChanges: {
        file: string;
        line: number;
        oldCode: string;
        newCode: string;
        justification: string;
    }[];
    evidence: string[];
    reasoning: string;
}
export interface SourceLocation {
    file: string;
    lines: string;
    reason: string;
}
export interface OpenAIResponse {
    verdict: Verdict;
    reasoning: string;
    indicators: string[];
    suggestedSourceLocations?: SourceLocation[];
}
export interface FewShotExample {
    error: string;
    verdict: Verdict;
    reasoning: string;
}
export interface ActionInputs {
    githubToken: string;
    openaiApiKey: string;
    errorMessage?: string;
    workflowRunId?: string;
    jobName?: string;
    confidenceThreshold: number;
    prNumber?: string;
    commitSha?: string;
    repository?: string;
    testFrameworks?: string;
    enableAutoFix?: boolean;
    autoFixBaseBranch?: string;
    autoFixMinConfidence?: number;
    autoFixTargetRepo?: string;
    branch?: string;
    enableValidation?: boolean;
    validationWorkflow?: string;
    validationPreviewUrl?: string;
    validationSpec?: string;
    enableAgenticRepair?: boolean;
}
export interface PRDiff {
    files: PRDiffFile[];
    totalChanges: number;
    additions: number;
    deletions: number;
}
export interface PRDiffFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}
export interface StructuredErrorSummary {
    primaryError: {
        type: string;
        message: string;
        location?: {
            file: string;
            line: number;
            isTestCode: boolean;
            isAppCode: boolean;
        };
    };
    testContext: {
        testName: string;
        testFile: string;
        duration?: string;
        browser?: string;
        framework: string;
    };
    failureIndicators: {
        hasNetworkErrors: boolean;
        hasNullPointerErrors: boolean;
        hasTimeoutErrors: boolean;
        hasDOMErrors: boolean;
        hasAssertionErrors: boolean;
        isMobileTest: boolean;
        hasLongTimeout: boolean;
        hasAltTextSelector: boolean;
        hasElementExistenceCheck: boolean;
        hasVisibilityIssue: boolean;
        hasViewportContext: boolean;
    };
    prRelevance?: {
        testFileModified: boolean;
        relatedSourceFilesModified: string[];
        riskScore: 'high' | 'medium' | 'low' | 'none';
    };
    keyMetrics: {
        totalTestCommands?: number;
        lastCommand?: string;
        hasScreenshots: boolean;
        logSize: number;
    };
}
//# sourceMappingURL=types.d.ts.map