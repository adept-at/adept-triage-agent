import { Octokit } from '@octokit/rest';
import { Screenshot } from './types';
import { PRDiff } from './types';
interface RepoDetails {
    owner: string;
    repo: string;
}
export declare class ArtifactFetcher {
    private octokit;
    constructor(octokit: Octokit);
    fetchScreenshots(runId: string, jobName?: string, repoDetails?: RepoDetails): Promise<Screenshot[]>;
    private isScreenshotFile;
    fetchLogs(_runId: string, jobId: number, repoDetails?: RepoDetails): Promise<string[]>;
    fetchTestArtifactLogs(runId: string, jobName?: string, repoDetails?: RepoDetails): Promise<string>;
    private processArtifactForLogs;
    private extractErrorContext;
    fetchPRDiff(prNumber: string, repository?: string): Promise<PRDiff | null>;
    private sortFilesByRelevance;
    private isTestFile;
    private isSourceFile;
    private isConfigFile;
    fetchCommitDiff(commitSha: string, repository?: string): Promise<PRDiff | null>;
    fetchBranchDiff(branch: string, baseBranch?: string, repository?: string): Promise<PRDiff | null>;
}
export {};
//# sourceMappingURL=artifact-fetcher.d.ts.map