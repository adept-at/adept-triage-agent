import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ActionInputs, FixRecommendation, RepairTelemetry } from '../types';
import { ApplyResult } from '../repair/fix-applier';
import { SkillStore } from '../services/skill-store';
export declare function generateFixRecommendation(inputs: ActionInputs, repoDetails: {
    owner: string;
    repo: string;
}, errorData: {
    message: string;
    testName?: string;
    fileName?: string;
}, openaiClient: OpenAIClient, octokit: Octokit, previousAttempt?: {
    iteration: number;
    previousFix: FixRecommendation;
    validationLogs: string;
    priorAgentRootCause?: string;
    priorAgentInvestigationFindings?: string;
}, previousResponseId?: string, skillStore?: SkillStore, priorInvestigationContext?: string, repoContext?: string): Promise<{
    fix: FixRecommendation | null;
    lastResponseId?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
    repairTelemetry?: RepairTelemetry;
}>;
export declare function iterativeFixValidateLoop(inputs: ActionInputs, repoDetails: {
    owner: string;
    repo: string;
}, autoFixTargetRepo: {
    owner: string;
    repo: string;
}, errorData: {
    message: string;
    testName?: string;
    fileName?: string;
    framework?: string;
}, openaiClient: OpenAIClient, octokit: Octokit, skillStore?: SkillStore, _classificationResponseId?: string, investigationContext?: string, repoContext?: string): Promise<{
    fixRecommendation: FixRecommendation | null;
    autoFixResult: ApplyResult | null;
    iterations: number;
    prUrl?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
    autoFixSkipped?: boolean;
    autoFixSkippedReason?: string;
    repairTelemetry?: RepairTelemetry;
}>;
export declare function requiredConfidence(fix: FixRecommendation, baseMinConfidence: number): {
    required: number;
    reasons: string[];
};
export declare function fixFingerprint(fix: FixRecommendation): string;
export interface FixResultForRetry {
    agentRootCause?: string;
    agentInvestigationFindings?: string;
}
export declare function buildNextPreviousAttempt(nextIteration: number, previousFix: FixRecommendation, fixResult: FixResultForRetry, validationLogs: string): {
    iteration: number;
    previousFix: FixRecommendation;
    validationLogs: string;
    priorAgentRootCause?: string;
    priorAgentInvestigationFindings?: string;
};
export interface AttemptAutoFixOutcome {
    applied: ApplyResult | null;
    skipReason?: string;
}
export declare function attemptAutoFix(inputs: ActionInputs, fixRecommendation: FixRecommendation, octokit: Octokit, repoDetails: {
    owner: string;
    repo: string;
}, errorData?: {
    fileName?: string;
}): Promise<AttemptAutoFixOutcome>;
//# sourceMappingURL=validator.d.ts.map