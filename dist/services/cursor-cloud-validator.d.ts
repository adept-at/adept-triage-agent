import { CursorValidationResult, CursorAgentMessage, CursorAgentArtifact } from '../types';
export interface CursorValidationParams {
    repositoryUrl: string;
    branch: string;
    spec: string;
    previewUrl: string;
    framework?: string;
    testCommand?: string;
    triageRunId?: string;
}
interface CursorAgentResponse {
    id: string;
    name?: string;
    status: string;
    source?: {
        repository: string;
        ref?: string;
    };
    target?: {
        branchName?: string;
        url?: string;
        prUrl?: string;
        autoCreatePr?: boolean;
    };
    summary?: string;
    createdAt?: string;
}
interface CursorConversationResponse {
    id: string;
    messages: CursorAgentMessage[];
}
interface CursorArtifactsResponse {
    artifacts: CursorAgentArtifact[];
}
export declare class CursorCloudValidator {
    private apiKey;
    private baseUrl;
    constructor(apiKey: string, baseUrl?: string);
    validate(params: CursorValidationParams, mode?: 'poll' | 'async', timeoutMs?: number): Promise<CursorValidationResult>;
    private launchAgent;
    private pollForCompletion;
    private buildResult;
    private inferTestResult;
    private generateFallbackSummary;
    getAgentStatus(agentId: string): Promise<CursorAgentResponse>;
    getConversation(agentId: string): Promise<CursorConversationResponse>;
    getArtifacts(agentId: string): Promise<CursorArtifactsResponse>;
    private agentUrl;
    private request;
}
export {};
//# sourceMappingURL=cursor-cloud-validator.d.ts.map