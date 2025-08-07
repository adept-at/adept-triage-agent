import { OpenAIClient } from '../openai-client';
import { FullContext, RepairResult } from './types';
export declare class RepairEngine {
    private openaiClient;
    private minConfidence;
    private requireEvidence;
    constructor(openaiClient: OpenAIClient, minConfidence?: number, requireEvidence?: boolean);
    attemptRepair(fullContext: FullContext): Promise<RepairResult>;
    private buildRepairPrompt;
    private generateRepairSuggestion;
    private parseRepairFromResponse;
    private parseProposedChanges;
    private hasValidEvidence;
    private extractSelectorsFromCode;
}
//# sourceMappingURL=repair-engine.d.ts.map