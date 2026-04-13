import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ActionInputs, FixRecommendation } from '../types';
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
}, previousResponseId?: string, skillStore?: SkillStore, priorInvestigationContext?: string): Promise<{
    fix: FixRecommendation;
    lastResponseId?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
} | null>;
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
}, openaiClient: OpenAIClient, octokit: Octokit, skillStore?: SkillStore, classificationResponseId?: string, investigationContext?: string): Promise<{
    fixRecommendation: FixRecommendation | null;
    autoFixResult: ApplyResult | null;
    iterations: number;
    prUrl?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
}>;
export declare function fixFingerprint(fix: FixRecommendation): string;
export declare function attemptAutoFix(inputs: ActionInputs, fixRecommendation: FixRecommendation, octokit: Octokit, repoDetails: {
    owner: string;
    repo: string;
}, errorData?: {
    fileName?: string;
}): Promise<ApplyResult | null>;
//# sourceMappingURL=validator.d.ts.map