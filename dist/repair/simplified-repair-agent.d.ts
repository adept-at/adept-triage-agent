import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData } from '../types';
import { FixRecommendation } from '../types';
export declare class SimplifiedRepairAgent {
    private openaiClient;
    constructor(openaiClientOrApiKey: OpenAIClient | string);
    generateFixRecommendation(repairContext: RepairContext, errorData?: ErrorData): Promise<FixRecommendation | null>;
    private buildPrompt;
    private getRecommendationFromAI;
    private extractChangesFromText;
    private generateSummary;
}
//# sourceMappingURL=simplified-repair-agent.d.ts.map