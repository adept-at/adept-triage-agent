import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData } from '../types';
import { FixRecommendation } from '../types';
export interface SourceFetchContext {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch?: string;
}
export declare class SimplifiedRepairAgent {
    private openaiClient;
    private sourceFetchContext?;
    constructor(openaiClientOrApiKey: OpenAIClient | string, sourceFetchContext?: SourceFetchContext);
    generateFixRecommendation(repairContext: RepairContext, errorData?: ErrorData): Promise<FixRecommendation | null>;
    private extractFilePath;
    private fetchSourceFile;
    private buildPrompt;
    private getRecommendationFromAI;
    private extractChangesFromText;
    private generateSummary;
}
//# sourceMappingURL=simplified-repair-agent.d.ts.map