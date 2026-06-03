import { Octokit } from '@octokit/rest';
import { ErrorData, StructuredErrorSummary, PRDiff, ActionInputs } from '../types';
import { ArtifactFetcher } from '../artifact-fetcher';
interface RepoDetails {
    owner: string;
    repo: string;
}
export declare function processWorkflowLogs(octokit: Octokit, artifactFetcher: ArtifactFetcher, inputs: ActionInputs, repoDetails: RepoDetails): Promise<ErrorData | null>;
export declare function fetchDiffWithFallback(artifactFetcher: ArtifactFetcher, inputs: ActionInputs, repoDetails?: RepoDetails): Promise<PRDiff | null>;
export declare function selectProductDiff({ prNumber, repoOwner, repoName, productRepo, prDiff, fetchedProductDiff, commitCount, }: {
    prNumber: string | undefined;
    repoOwner: string;
    repoName: string;
    productRepo: string;
    prDiff: PRDiff | null;
    fetchedProductDiff: PRDiff | null;
    commitCount: number;
}): PRDiff | null;
export declare function capArtifactLogs(raw: string): string;
export declare function buildStructuredSummary(err: ErrorData): StructuredErrorSummary;
export {};
//# sourceMappingURL=log-processor.d.ts.map