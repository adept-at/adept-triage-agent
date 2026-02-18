import { OpenAIClient } from '../openai-client';
export interface AgentResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    executionTimeMs: number;
    apiCalls: number;
    tokensUsed?: number;
}
export interface AgentContext {
    errorMessage: string;
    testFile: string;
    testName: string;
    errorType?: string;
    errorSelector?: string;
    stackTrace?: string;
    screenshots?: Array<{
        name: string;
        base64Data?: string;
    }>;
    logs?: string[];
    prDiff?: {
        files: Array<{
            filename: string;
            patch?: string;
            status: string;
        }>;
    };
    framework?: string;
    sourceFileContent?: string;
    relatedFiles?: Map<string, string>;
}
export interface AgentConfig {
    timeoutMs: number;
    temperature: number;
    maxTokens: number;
    verbose: boolean;
}
export declare const DEFAULT_AGENT_CONFIG: AgentConfig;
export declare abstract class BaseAgent<TInput, TOutput> {
    protected openaiClient: OpenAIClient;
    protected config: AgentConfig;
    protected agentName: string;
    constructor(openaiClient: OpenAIClient, agentName: string, config?: Partial<AgentConfig>);
    abstract execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
    protected abstract getSystemPrompt(): string;
    protected abstract buildUserPrompt(input: TInput, context: AgentContext): string;
    protected abstract parseResponse(response: string): TOutput | null;
    protected executeWithTimeout(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
    private runAgentTask;
    protected log(message: string, level?: 'info' | 'debug' | 'warning'): void;
}
export declare function createAgentContext(params: {
    errorMessage: string;
    testFile: string;
    testName: string;
    errorType?: string;
    errorSelector?: string;
    stackTrace?: string;
    screenshots?: Array<{
        name: string;
        base64Data?: string;
    }>;
    logs?: string[];
    prDiff?: {
        files: Array<{
            filename: string;
            patch?: string;
            status: string;
        }>;
    };
    framework?: string;
}): AgentContext;
//# sourceMappingURL=base-agent.d.ts.map