import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';
import { FixGenerationOutput } from './fix-generation-agent';
export interface ReviewIssue {
    severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
    changeIndex: number;
    description: string;
    suggestion?: string;
}
export interface ReviewOutput {
    approved: boolean;
    issues: ReviewIssue[];
    assessment: string;
    fixConfidence: number;
    improvements?: string[];
}
export interface ReviewInput {
    proposedFix: FixGenerationOutput;
    analysis: AnalysisOutput;
    codeContext?: CodeReadingOutput;
}
export declare class ReviewAgent extends BaseAgent<ReviewInput, ReviewOutput> {
    constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>);
    execute(input: ReviewInput, context: AgentContext, previousResponseId?: string): Promise<AgentResult<ReviewOutput>>;
    protected getSystemPrompt(): string;
    protected buildUserPrompt(input: ReviewInput, context: AgentContext): string;
    protected parseResponse(response: string): ReviewOutput | null;
}
//# sourceMappingURL=review-agent.d.ts.map