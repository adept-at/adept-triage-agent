import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
import { AnalysisOutput } from './analysis-agent';
import { InvestigationOutput } from './investigation-agent';
export interface CodeChange {
    file: string;
    line: number;
    oldCode: string;
    newCode: string;
    justification: string;
    changeType: 'SELECTOR_UPDATE' | 'WAIT_ADDITION' | 'LOGIC_CHANGE' | 'ASSERTION_UPDATE' | 'OTHER';
}
export interface FixGenerationOutput {
    changes: CodeChange[];
    confidence: number;
    summary: string;
    reasoning: string;
    evidence: string[];
    risks: string[];
    alternatives?: string[];
}
export interface FixGenerationInput {
    analysis: AnalysisOutput;
    investigation: InvestigationOutput;
    previousFeedback?: string | null;
}
export declare class FixGenerationAgent extends BaseAgent<FixGenerationInput, FixGenerationOutput> {
    constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>);
    execute(input: FixGenerationInput, context: AgentContext): Promise<AgentResult<FixGenerationOutput>>;
    protected getSystemPrompt(): string;
    protected buildUserPrompt(input: FixGenerationInput, context: AgentContext): string;
    protected parseResponse(response: string): FixGenerationOutput | null;
}
//# sourceMappingURL=fix-generation-agent.d.ts.map