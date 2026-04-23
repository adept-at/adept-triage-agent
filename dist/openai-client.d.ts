import OpenAI from 'openai';
import { OpenAIResponse, FewShotExample, ErrorData } from './types';
import { type ReasoningEffort } from './config/constants';
export declare class OpenAIClient {
    private openai;
    private maxRetries;
    private retryDelay;
    constructor(apiKey: string);
    analyze(errorData: ErrorData, examples: FewShotExample[], skillContext?: string, options?: {
        model?: string;
        reasoningEffort?: ReasoningEffort;
    }): Promise<OpenAIResponse & {
        responseId: string;
    }>;
    private convertToResponsesInput;
    private buildUserContent;
    private getSystemPrompt;
    private buildPrompt;
    private capLogsForPrompt;
    private formatPRDiffSection;
    private formatProductDiffSection;
    private parseResponse;
    private validateResponse;
    private ensureJsonMention;
    private delay;
    generateWithCustomPrompt(params: {
        systemPrompt: string;
        userContent: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage>;
        responseAsJson?: boolean;
        temperature?: number;
        previousResponseId?: string;
        model?: string;
        reasoningEffort?: ReasoningEffort;
    }): Promise<{
        text: string;
        responseId: string;
    }>;
}
//# sourceMappingURL=openai-client.d.ts.map