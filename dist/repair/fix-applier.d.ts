import { FixRecommendation } from '../types';
export interface ApplyResult {
    success: boolean;
    modifiedFiles: string[];
    error?: string;
    commitSha?: string;
}
export interface PullRequestResult {
    success: boolean;
    prNumber?: number;
    prUrl?: string;
    error?: string;
}
export interface FixApplierConfig {
    owner: string;
    repo: string;
    baseBranch: string;
    githubToken: string;
    createPr: boolean;
    prTitlePrefix?: string;
}
export interface FixApplier {
    canApply(recommendation: FixRecommendation): Promise<boolean>;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
    createPullRequest(fix: ApplyResult, recommendation: FixRecommendation): Promise<PullRequestResult>;
}
export declare function createFixApplier(_config: FixApplierConfig): FixApplier;
export declare function generateFixBranchName(testFile: string, timestamp?: Date): string;
export declare function generateFixCommitMessage(recommendation: FixRecommendation): string;
//# sourceMappingURL=fix-applier.d.ts.map