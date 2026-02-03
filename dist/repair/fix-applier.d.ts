import { Octokit } from '@octokit/rest';
import { FixRecommendation } from '../types';
export interface ApplyResult {
    success: boolean;
    modifiedFiles: string[];
    error?: string;
    commitSha?: string;
    branchName?: string;
    validationRunId?: number;
    validationStatus?: 'pending' | 'passed' | 'failed' | 'skipped';
}
export interface FixApplierConfig {
    octokit: Octokit;
    owner: string;
    repo: string;
    baseBranch: string;
    minConfidence: number;
    enableValidation?: boolean;
    validationWorkflow?: string;
}
export interface ValidationParams {
    branch: string;
    spec: string;
    previewUrl: string;
    triageRunId?: string;
}
export interface FixApplier {
    canApply(recommendation: FixRecommendation): boolean;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
    triggerValidation(params: ValidationParams): Promise<{
        runId: number;
    } | null>;
}
export declare class GitHubFixApplier implements FixApplier {
    private config;
    constructor(config: FixApplierConfig);
    canApply(recommendation: FixRecommendation): boolean;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
    private cleanupBranch;
    triggerValidation(params: ValidationParams): Promise<{
        runId: number;
    } | null>;
}
export declare function createFixApplier(config: FixApplierConfig): FixApplier;
export declare function generateFixBranchName(testFile: string, timestamp?: Date, forceUnique?: boolean): string;
export declare function generateFixCommitMessage(recommendation: FixRecommendation): string;
//# sourceMappingURL=fix-applier.d.ts.map