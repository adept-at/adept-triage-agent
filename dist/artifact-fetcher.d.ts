import { Octokit } from '@octokit/rest';
import { Screenshot } from './types';
import { PRDiff } from './types';
export declare class ArtifactFetcher {
    private octokit;
    constructor(octokit: Octokit);
    fetchScreenshots(runId: string, jobName?: string): Promise<Screenshot[]>;
    private isScreenshotFile;
    fetchLogs(_runId: string, jobId: number): Promise<string[]>;
    fetchCypressArtifactLogs(runId: string, jobName?: string): Promise<string>;
    private processArtifactForLogs;
    private extractErrorContext;
    fetchPRDiff(prNumber: string, repository?: string): Promise<PRDiff | null>;
    private sortFilesByRelevance;
    private isTestFile;
    private isSourceFile;
    private isConfigFile;
}
//# sourceMappingURL=artifact-fetcher.d.ts.map