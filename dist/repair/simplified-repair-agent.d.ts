import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData, FixRecommendation, SourceFetchContext } from '../types';
import { OrchestratorConfig } from '../agents';
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
    private findEnclosingFunction;
    private fetchSourceFile;
    private sanitizeForPrompt;
    private buildPrompt;
    private getRecommendationFromAI;
    private extractChangesFromText;
    private generateSummary;
}
//# sourceMappingURL=simplified-repair-agent.d.ts.map