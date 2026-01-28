import { Octokit } from '@octokit/rest';
import { FixRecommendation } from '../types';
export interface ApplyResult {
    success: boolean;
    modifiedFiles: string[];
    error?: string;
    commitSha?: string;
    branchName?: string;
}
export interface FixApplierConfig {
    octokit: Octokit;
    owner: string;
    repo: string;
    baseBranch: string;
    minConfidence: number;
}
export interface FixApplier {
    canApply(recommendation: FixRecommendation): boolean;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
}
export declare class GitHubFixApplier implements FixApplier {
    private config;
    constructor(config: FixApplierConfig);
    canApply(recommendation: FixRecommendation): boolean;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
}
export declare function createFixApplier(config: FixApplierConfig): FixApplier;
export declare function generateFixBranchName(testFile: string, timestamp?: Date): string;
export declare function generateFixCommitMessage(recommendation: FixRecommendation): string;
//# sourceMappingURL=fix-applier.d.ts.map