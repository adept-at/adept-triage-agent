import { Octokit } from '@octokit/rest';
export declare const REPO_CONTEXT_PATH = ".adept-triage/context.md";
export declare const REPO_CONTEXT_MAX_CHARS = 6500;
export declare class RepoContextFetcher {
    private cache;
    private octokit;
    constructor(octokit: Octokit);
    fetch(owner: string, repo: string, ref?: string): Promise<string>;
    private renderBundled;
    private fetchAndRender;
}
//# sourceMappingURL=repo-context-fetcher.d.ts.map