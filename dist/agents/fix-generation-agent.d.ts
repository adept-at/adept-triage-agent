import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
import { Framework } from '../types';
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
export interface FailureModeTraceOutput {
    originalState: string;
    rootMechanism: string;
    newStateAfterFix: string;
    whyAssertionPassesNow: string;
}
export interface FixGenerationOutput {
    changes: CodeChange[];
    confidence: number;
    summary: string;
    reasoning: string;
    evidence: string[];
    risks: string[];
    alternatives?: string[];
    failureModeTrace?: FailureModeTraceOutput;
}
export interface FixGenerationInput {
    analysis: AnalysisOutput;
    investigation: InvestigationOutput;
    previousFeedback?: string | null;
}
export declare class FixGenerationAgent extends BaseAgent<FixGenerationInput, FixGenerationOutput> {
    private warnedUnknownFramework;
    constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>);
    execute(input: FixGenerationInput, context: AgentContext, previousResponseId?: string): Promise<AgentResult<FixGenerationOutput>>;
    protected getSystemPrompt(framework?: Framework): string;
    protected buildUserPrompt(input: FixGenerationInput, context: AgentContext): string;
    private findErrorLineInFile;
    private findEnclosingFunction;
    protected parseResponse(response: string): FixGenerationOutput | null;
}
//# sourceMappingURL=fix-generation-agent.d.ts.map