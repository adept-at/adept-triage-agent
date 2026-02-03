import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
export type RootCauseCategory = 'SELECTOR_MISMATCH' | 'TIMING_ISSUE' | 'STATE_DEPENDENCY' | 'NETWORK_ISSUE' | 'ELEMENT_VISIBILITY' | 'ASSERTION_MISMATCH' | 'DATA_DEPENDENCY' | 'ENVIRONMENT_ISSUE' | 'UNKNOWN';
export interface AnalysisOutput {
    rootCauseCategory: RootCauseCategory;
    contributingFactors: RootCauseCategory[];
    confidence: number;
    explanation: string;
    selectors: string[];
    elements: string[];
    issueLocation: 'TEST_CODE' | 'APP_CODE' | 'BOTH' | 'UNKNOWN';
    patterns: {
        hasTimeout: boolean;
        hasVisibilityIssue: boolean;
        hasNetworkCall: boolean;
        hasStateAssertion: boolean;
        hasDynamicContent: boolean;
        hasResponsiveIssue: boolean;
    };
    suggestedApproach: string;
}
export interface AnalysisInput {
    additionalContext?: string;
}
export declare class AnalysisAgent extends BaseAgent<AnalysisInput, AnalysisOutput> {
    constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>);
    execute(input: AnalysisInput, context: AgentContext): Promise<AgentResult<AnalysisOutput>>;
    protected getSystemPrompt(): string;
    protected buildUserPrompt(input: AnalysisInput, context: AgentContext): string;
    protected parseResponse(response: string): AnalysisOutput | null;
}
//# sourceMappingURL=analysis-agent.d.ts.map