import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData } from '../types';
import { FixRecommendation } from '../types';
import { OrchestratorConfig } from '../agents';
export interface SourceFetchContext {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch?: string;
}
export interface RepairAgentConfig {
    enableAgenticRepair?: boolean;
    orchestratorConfig?: Partial<OrchestratorConfig>;
}
export declare class SimplifiedRepairAgent {
    private openaiClient;
    private sourceFetchContext?;
    private config;
    private orchestrator?;
    constructor(openaiClientOrApiKey: OpenAIClient | string, sourceFetchContext?: SourceFetchContext, config?: RepairAgentConfig);
    generateFixRecommendation(repairContext: RepairContext, errorData?: ErrorData): Promise<FixRecommendation | null>;
    private tryAgenticRepair;
    private singleShotRepair;
    private extractFilePath;
    private fetchSourceFile;
    private buildPrompt;
    private getRecommendationFromAI;
    private extractChangesFromText;
    private generateSummary;
}
//# sourceMappingURL=simplified-repair-agent.d.ts.map