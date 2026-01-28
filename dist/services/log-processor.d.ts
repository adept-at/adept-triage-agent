import { Octokit } from '@octokit/rest';
import { ErrorData, StructuredErrorSummary, ActionInputs } from '../types';
import { ArtifactFetcher } from '../artifact-fetcher';
interface RepoDetails {
    owner: string;
    repo: string;
}
export declare function processWorkflowLogs(octokit: Octokit, artifactFetcher: ArtifactFetcher, inputs: ActionInputs, repoDetails: RepoDetails): Promise<ErrorData | null>;
export declare function capArtifactLogs(raw: string): string;
export declare function buildStructuredSummary(err: ErrorData): StructuredErrorSummary;
export {};
//# sourceMappingURL=log-processor.d.ts.map