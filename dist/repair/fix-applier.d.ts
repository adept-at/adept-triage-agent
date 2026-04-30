import { Octokit } from '@octokit/rest';
import { FixRecommendation, ValidationResult, ValidationStatus } from '../types';
export interface ApplyResult {
    success: boolean;
    modifiedFiles: string[];
    error?: string;
    commitSha?: string;
    branchName?: string;
    validationRunId?: number;
    validationStatus?: ValidationStatus;
    validationUrl?: string;
    validationResult?: ValidationResult;
}
export interface FixApplierConfig {
    octokit: Octokit;
    owner: string;
    repo: string;
    baseBranch: string;
    minConfidence: number;
    enableValidation?: boolean;
    validationWorkflow?: string;
    validationTestCommand?: string;
}
export interface ValidationParams {
    branch: string;
    spec: string;
    previewUrl: string;
    triageRunId?: string;
    testCommand?: string;
}
export interface ValidationOutcome {
    passed: boolean;
    conclusion: string;
    logs?: string;
    runId: number;
    url?: string;
    validationResult?: ValidationResult;
}
export interface FixApplier {
    canApply(recommendation: FixRecommendation): boolean;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
    reapplyFix(recommendation: FixRecommendation, branchName: string): Promise<ApplyResult>;
    triggerValidation(params: ValidationParams): Promise<{
        runId?: number;
        url?: string;
    } | null>;
    waitForValidation(runId: number): Promise<ValidationOutcome>;
    getValidationFailureLogs(runId: number): Promise<string>;
}
export declare class GitHubFixApplier implements FixApplier {
    private config;
    constructor(config: FixApplierConfig);
    canApply(recommendation: FixRecommendation): boolean;
    applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;
    private cleanupBranch;
    triggerValidation(params: ValidationParams): Promise<{
        runId?: number;
        url?: string;
    } | null>;
    reapplyFix(recommendation: FixRecommendation, branchName: string): Promise<ApplyResult>;
    waitForValidation(runId: number): Promise<ValidationOutcome>;
    getValidationFailureLogs(runId: number): Promise<string>;
    private commitChanges;
}
export declare function createFixApplier(config: FixApplierConfig): FixApplier;
export declare function generateFixBranchName(testFile: string, timestamp?: Date, forceUnique?: boolean): string;
//# sourceMappingURL=fix-applier.d.ts.map