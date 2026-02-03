import { OpenAIClient } from '../openai-client';
import { AgentContext, AgentResult } from './base-agent';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';
import { InvestigationOutput } from './investigation-agent';
import { FixGenerationOutput } from './fix-generation-agent';
import { ReviewOutput } from './review-agent';
import { FixRecommendation, ErrorData } from '../types';
import { Octokit } from '@octokit/rest';
export interface OrchestratorConfig {
    maxIterations: number;
    totalTimeoutMs: number;
    minConfidence: number;
    requireReview: boolean;
    fallbackToSingleShot: boolean;
}
export declare const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig;
export interface SourceFetchContext {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch: string;
}
export interface OrchestrationResult {
    success: boolean;
    fix?: FixRecommendation;
    error?: string;
    totalTimeMs: number;
    iterations: number;
    approach: 'agentic' | 'single-shot' | 'failed';
    agentResults: {
        analysis?: AgentResult<AnalysisOutput>;
        codeReading?: AgentResult<CodeReadingOutput>;
        investigation?: AgentResult<InvestigationOutput>;
        fixGeneration?: AgentResult<FixGenerationOutput>;
        review?: AgentResult<ReviewOutput>;
    };
}
export declare class AgentOrchestrator {
    private config;
    private analysisAgent;
    private codeReadingAgent;
    private investigationAgent;
    private fixGenerationAgent;
    private reviewAgent;
    constructor(openaiClient: OpenAIClient, config?: Partial<OrchestratorConfig>, sourceFetchContext?: SourceFetchContext);
    orchestrate(context: AgentContext, errorData?: ErrorData): Promise<OrchestrationResult>;
    private runPipeline;
    private convertToFixRecommendation;
}
export declare function createOrchestrator(openaiClient: OpenAIClient, config?: Partial<OrchestratorConfig>, sourceFetchContext?: SourceFetchContext): AgentOrchestrator;
//# sourceMappingURL=agent-orchestrator.d.ts.map