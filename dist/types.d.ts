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
    cypressArtifactLogs?: string;
}
export interface Screenshot {
    name: string;
    path: string;
    base64Data?: string;
    url?: string;
    timestamp?: string;
}
export interface AnalysisResult {
    verdict: Verdict;
    confidence: number;
    reasoning: string;
    summary: string;
    indicators?: string[];
}
export interface OpenAIResponse {
    verdict: Verdict;
    reasoning: string;
    indicators: string[];
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
}
export interface LogExtractor {
    framework: string;
    patterns: RegExp[];
    extract: (log: string) => ErrorData | null;
}
//# sourceMappingURL=types.d.ts.map