import { OpenAIClient } from '../openai-client';
import { AgentContext, AgentResult } from './base-agent';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';
import { InvestigationOutput } from './investigation-agent';
import { FixGenerationOutput } from './fix-generation-agent';
import { ReviewOutput, ReviewIssue } from './review-agent';
import { FixRecommendation, ErrorData, SourceFetchContext, RepairTelemetry } from '../types';
import { TriageSkill, FlakinessSignal } from '../services/skill-store';
export interface OrchestratorConfig {
    maxIterations: number;
    totalTimeoutMs: number;
    minConfidence: number;
    requireReview: boolean;
    modelOverrideFixGen?: string;
    modelOverrideReview?: string;
}
export declare const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig;
export declare const MIN_FIX_GEN_BUDGET_MS = 180000;
export declare const MIN_REVIEW_BUDGET_MS = 120000;
export interface OrchestrationResult {
    success: boolean;
    fix?: FixRecommendation;
    error?: string;
    totalTimeMs: number;
    iterations: number;
    approach: 'agentic' | 'failed';
    lastResponseId?: string;
    repairTelemetry?: RepairTelemetry;
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
    orchestrate(context: AgentContext, errorData?: ErrorData, previousResponseId?: string, skills?: {
        relevant: TriageSkill[];
        flakiness?: FlakinessSignal;
    }): Promise<OrchestrationResult>;
    private runPipeline;
    private buildDelegationContext;
    private convertToFixRecommendation;
}
export declare function isBlockingCriticalIssue(issue: ReviewIssue): boolean;
export declare function createOrchestrator(openaiClient: OpenAIClient, config?: Partial<OrchestratorConfig>, sourceFetchContext?: SourceFetchContext): AgentOrchestrator;
//# sourceMappingURL=agent-orchestrator.d.ts.map