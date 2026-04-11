import { Octokit } from '@octokit/rest';
export interface LocalValidatorConfig {
    owner: string;
    repo: string;
    branch: string;
    githubToken: string;
    npmToken?: string;
    testCommand: string;
    spec?: string;
    previewUrl?: string;
    testTimeoutMs?: number;
}
export interface TestRunResult {
    passed: boolean;
    logs: string;
    exitCode: number;
    durationMs: number;
}
export interface PushResult {
    branchName: string;
    commitSha: string;
    prUrl?: string;
    prNumber?: number;
}
export declare class LocalFixValidator {
    private config;
    private octokit;
    private _workDir;
    constructor(config: LocalValidatorConfig, octokit: Octokit);
    get workDir(): string;
    setup(): Promise<void>;
    preValidateFix(changes: Array<{
        file: string;
        oldCode: string;
        newCode: string;
    }>): Promise<{
        valid: boolean;
        reason?: string;
    }>;
    private quickTypeCheck;
    applyFix(changes: Array<{
        file: string;
        oldCode: string;
        newCode: string;
    }>): Promise<void>;
    runTest(): Promise<TestRunResult>;
    reset(): Promise<void>;
    pushAndCreatePR(options: {
        branchName: string;
        commitMessage: string;
        prTitle: string;
        prBody: string;
        baseBranch: string;
        changedFiles?: string[];
    }): Promise<PushResult>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=local-fix-validator.d.ts.map