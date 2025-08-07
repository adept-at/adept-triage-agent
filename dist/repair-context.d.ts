import { RepairContext, AnalysisResult } from './types';
export declare function classifyErrorType(error: string): string;
export declare function extractSelector(error: string): string | undefined;
export declare function buildRepairContext(analysisData: {
    testFile: string;
    errorLine?: number;
    testName: string;
    errorMessage: string;
    workflowRunId: string;
    jobName: string;
    commitSha: string;
    branch: string;
    repository: string;
    prNumber?: string;
    targetAppPrNumber?: string;
}): RepairContext;
export declare function enhanceAnalysisWithRepairContext(analysisResult: AnalysisResult, testData: {
    testFile: string;
    errorLine?: number;
    testName: string;
    errorMessage: string;
    workflowRunId: string;
    jobName: string;
    commitSha: string;
    branch: string;
    repository: string;
    prNumber?: string;
    targetAppPrNumber?: string;
}): AnalysisResult;
//# sourceMappingURL=repair-context.d.ts.map