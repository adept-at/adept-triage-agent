import { Octokit } from '@octokit/rest';
import { Screenshot } from './types';
export declare class ArtifactFetcher {
    private octokit;
    constructor(octokit: Octokit);
    fetchScreenshots(runId: string, jobName?: string): Promise<Screenshot[]>;
    private isScreenshotFile;
    fetchLogs(_runId: string, jobId: number): Promise<string[]>;
    fetchCypressArtifactLogs(runId: string, jobName?: string): Promise<string>;
    private processArtifactForLogs;
    private extractErrorContext;
}
//# sourceMappingURL=artifact-fetcher.d.ts.map