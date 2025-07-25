import { OpenAIResponse, FewShotExample, ErrorData } from './types';
export declare class OpenAIClient {
    private openai;
    private maxRetries;
    private retryDelay;
    constructor(apiKey: string);
    analyze(errorData: ErrorData, examples: FewShotExample[]): Promise<OpenAIResponse>;
    private buildMessages;
    private buildUserContent;
    private getSystemPrompt;
    private buildPrompt;
    private parseResponse;
    private validateResponse;
    private delay;
}
//# sourceMappingURL=openai-client.d.ts.map