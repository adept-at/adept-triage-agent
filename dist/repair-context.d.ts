import { RepairContext, AnalysisResult } from './types';
import { classifyErrorType, extractSelector } from './analysis/error-classifier';
export { classifyErrorType, extractSelector };
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