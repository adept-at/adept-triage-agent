import { Octokit } from '@octokit/rest';
export type Verdict = 'TEST_ISSUE' | 'PRODUCT_ISSUE' | 'INCONCLUSIVE' | 'PENDING' | 'ERROR' | 'NO_FAILURE';
export interface SourceFetchContext {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch: string;
}
export interface AIRecommendation {
    confidence: number;
    reasoning: string;
    changes: AIChange[];
    evidence: string[];
    rootCause: string;
}
export interface AIChange {
    file: string;
    line?: number;
    oldCode?: string;
    newCode?: string;
    justification: string;
}
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
    productDiff?: PRDiff;
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
    category?: string;
    fixRecommendation?: FixRecommendation;
    responseId?: string;
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
    validationTestCommand?: string;
    npmToken?: string;
    enableAgenticRepair?: boolean;
    productRepo: string;
    productDiffCommits?: number;
    enableCursorValidation?: boolean;
    cursorApiKey?: string;
    cursorValidationMode?: 'poll' | 'async';
    cursorValidationTimeout?: number;
    triageAwsAccessKeyId?: string;
    triageAwsSecretAccessKey?: string;
    triageAwsRegion?: string;
    triageDynamoTable?: string;
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
export interface CursorValidationResult {
    agentId: string;
    status: 'FINISHED' | 'ERROR' | 'TIMEOUT' | 'CREATING' | 'RUNNING';
    testPassed: boolean | null;
    summary: string;
    conversation?: CursorAgentMessage[];
    agentUrl?: string;
    branchName?: string;
    prUrl?: string;
    artifacts?: CursorAgentArtifact[];
}
export interface CursorAgentMessage {
    id: string;
    type: 'user_message' | 'assistant_message';
    text: string;
}
export interface CursorAgentArtifact {
    absolutePath: string;
    sizeBytes: number;
    updatedAt: string;
}
//# sourceMappingURL=types.d.ts.map