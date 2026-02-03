import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';
export interface InvestigationFinding {
    type: 'SELECTOR_CHANGE' | 'MISSING_ELEMENT' | 'TIMING_GAP' | 'STATE_ISSUE' | 'CODE_CHANGE' | 'OTHER';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    evidence: string[];
    location?: {
        file: string;
        line?: number;
        code?: string;
    };
    relationToError: string;
}
export interface InvestigationOutput {
    findings: InvestigationFinding[];
    primaryFinding?: InvestigationFinding;
    isTestCodeFixable: boolean;
    recommendedApproach: string;
    selectorsToUpdate: Array<{
        current: string;
        reason: string;
        suggestedReplacement?: string;
    }>;
    confidence: number;
}
export interface InvestigationInput {
    analysis: AnalysisOutput;
    codeContext?: CodeReadingOutput;
}
export declare class InvestigationAgent extends BaseAgent<InvestigationInput, InvestigationOutput> {
    constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>);
    execute(input: InvestigationInput, context: AgentContext): Promise<AgentResult<InvestigationOutput>>;
    protected getSystemPrompt(): string;
    protected buildUserPrompt(input: InvestigationInput, context: AgentContext): string;
    protected parseResponse(response: string): InvestigationOutput | null;
}
//# sourceMappingURL=investigation-agent.d.ts.map