import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData, FixRecommendation, SourceFetchContext, RepairTelemetry } from '../types';
import { OrchestratorConfig } from '../agents';
import { InvestigationOutput } from '../agents/investigation-agent';
import { TriageSkill, FlakinessSignal } from '../services/skill-store';
export interface RepairAgentConfig {
    orchestratorConfig?: Partial<OrchestratorConfig>;
    modelOverrideFixGen?: string;
    modelOverrideReview?: string;
}
export interface PriorAttemptContext {
    iteration: number;
    previousFix: FixRecommendation;
    validationLogs: string;
    priorAgentRootCause?: string;
    priorAgentInvestigationFindings?: string;
}
export declare function summarizeInvestigationForRetry(investigation: InvestigationOutput | undefined): string | undefined;
export declare function buildPriorAttemptContext(prior: PriorAttemptContext, opts?: {
    logBudget?: number;
}): string;
export declare class SimplifiedRepairAgent {
    private openaiClient;
    private sourceFetchContext?;
    private config;
    private orchestrator?;
    constructor(openaiClientOrApiKey: OpenAIClient | string, sourceFetchContext?: SourceFetchContext, config?: RepairAgentConfig);
    generateFixRecommendation(repairContext: RepairContext, errorData?: ErrorData, previousAttempt?: {
        iteration: number;
        previousFix: FixRecommendation;
        validationLogs: string;
        priorAgentRootCause?: string;
        priorAgentInvestigationFindings?: string;
    }, previousResponseId?: string, skills?: {
        relevant: TriageSkill[];
        flakiness?: FlakinessSignal;
    }, priorInvestigationContext?: string, repoContext?: string): Promise<{
        fix: FixRecommendation | null;
        lastResponseId?: string;
        agentRootCause?: string;
        agentInvestigationFindings?: string;
        repairTelemetry?: RepairTelemetry;
    }>;
    private tryAgenticRepair;
    private extractFilePath;
}
//# sourceMappingURL=simplified-repair-agent.d.ts.map