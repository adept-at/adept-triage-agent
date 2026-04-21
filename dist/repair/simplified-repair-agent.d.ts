import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData, FixRecommendation, SourceFetchContext } from '../types';
import { OrchestratorConfig } from '../agents';
import { InvestigationOutput } from '../agents/investigation-agent';
import { TriageSkill, FlakinessSignal } from '../services/skill-store';
export interface RepairAgentConfig {
    enableAgenticRepair?: boolean;
    orchestratorConfig?: Partial<OrchestratorConfig>;
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
    }, priorInvestigationContext?: string): Promise<{
        fix: FixRecommendation;
        lastResponseId?: string;
        agentRootCause?: string;
        agentInvestigationFindings?: string;
    } | null>;
    private tryAgenticRepair;
    private singleShotRepair;
    private extractFilePath;
    private findEnclosingFunction;
    private fetchSourceFile;
    private buildPrompt;
    private getRecommendationFromAI;
    private extractChangesFromText;
    private generateSummary;
}
//# sourceMappingURL=simplified-repair-agent.d.ts.map