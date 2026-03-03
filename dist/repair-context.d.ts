import { RepairContext } from './types';
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
//# sourceMappingURL=repair-context.d.ts.map