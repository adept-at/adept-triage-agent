import OpenAI from 'openai';
import { OpenAIResponse, FewShotExample, ErrorData } from './types';
export declare class OpenAIClient {
    private openai;
    private maxRetries;
    private retryDelay;
    constructor(apiKey: string);
    analyze(errorData: ErrorData, examples: FewShotExample[]): Promise<OpenAIResponse>;
    private convertToResponsesInput;
    private buildUserContent;
    private getSystemPrompt;
    private buildPrompt;
    private capLogsForPrompt;
    private formatPRDiffSection;
    private parseResponse;
    private validateResponse;
    private delay;
    generateWithCustomPrompt(params: {
        systemPrompt: string;
        userContent: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage>;
        responseAsJson?: boolean;
        temperature?: number;
    }): Promise<string>;
}
//# sourceMappingURL=openai-client.d.ts.map