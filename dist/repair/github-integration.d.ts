import { Octokit } from '@octokit/rest';
import { RepairContext, ProposedChange } from './types';
export declare class GitHubIntegration {
    private octokit;
    constructor(octokit: Octokit);
    createRepairPR(owner: string, repo: string, changes: ProposedChange[], repairContext: RepairContext, repairConfidence: number, fetchedContext: string[]): Promise<string>;
    private applyChange;
    private applyChangeToContent;
    private generateCommitMessage;
    private generatePRBody;
    private generateChangesSummary;
    private formatContextSource;
    private getConfidenceEmoji;
    private getConfidenceExplanation;
    private extractAppRepo;
    commentOnPR(owner: string, repo: string, prNumber: number, repairResult: {
        canRepair: boolean;
        confidence?: number;
        reason?: string;
        missingInformation?: string[];
    }): Promise<void>;
}
//# sourceMappingURL=github-integration.d.ts.map