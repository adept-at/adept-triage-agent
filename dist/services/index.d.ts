import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ArtifactFetcher } from '../artifact-fetcher';
import { SimplifiedRepairAgent } from '../repair/simplified-repair-agent';
import { ActionInputs } from '../types';
export interface Services {
    github: Octokit;
    ai: OpenAIClient;
    artifacts: ArtifactFetcher;
    repairAgent: SimplifiedRepairAgent;
}
export declare function createServices(inputs: ActionInputs): Services;
export declare function createServicesWithOverrides(inputs: ActionInputs, overrides: Partial<Services>): Services;
//# sourceMappingURL=index.d.ts.map