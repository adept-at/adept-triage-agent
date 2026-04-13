import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ArtifactFetcher } from '../artifact-fetcher';
import { ActionInputs, ErrorData, FixRecommendation, Verdict } from '../types';
import { ApplyResult } from '../repair/fix-applier';
import { SkillStore } from '../services/skill-store';
export interface ClassificationResult {
    verdict: Verdict;
    confidence: number;
    reasoning: string;
    summary?: string;
    indicators?: string[];
    suggestedSourceLocations?: Array<{
        file: string;
        lines: string;
        reason: string;
    }>;
    responseId?: string;
    fixRecommendation?: FixRecommendation;
}
export interface RepairResult {
    fixRecommendation: FixRecommendation | null;
    autoFixResult: ApplyResult | null;
    investigationContext?: string;
    iterations: number;
    prUrl?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
}
interface PipelineCoordinatorDeps {
    octokit: Octokit;
    openaiClient: OpenAIClient;
    artifactFetcher: ArtifactFetcher;
    inputs: ActionInputs;
    repoDetails: {
        owner: string;
        repo: string;
    };
}
export declare class PipelineCoordinator {
    private octokit;
    private openaiClient;
    private artifactFetcher;
    private inputs;
    private repoDetails;
    constructor(deps: PipelineCoordinatorDeps);
    classify(errorData: ErrorData, skillStore?: SkillStore): Promise<ClassificationResult>;
    repair(_classification: ClassificationResult, errorData: ErrorData, skillStore?: SkillStore): Promise<RepairResult>;
    execute(): Promise<void>;
    private handleNoErrorData;
}
export {};
//# sourceMappingURL=coordinator.d.ts.map