import { Octokit } from '@octokit/rest';
import { RepairContext, DataRequirements, FullContext } from './types';
import { OpenAIClient } from '../openai-client';
export declare class ContextFetcher {
    private testRepoClient;
    private appRepoClient;
    private testRepo;
    private appRepo;
    private openaiClient;
    constructor(testRepoClient: Octokit, appRepoClient: Octokit, openaiClient: OpenAIClient, testRepo: string, appRepo: string);
    determineRequiredData(context: RepairContext): Promise<DataRequirements>;
    fetchRequiredContext(requirements: DataRequirements, context: RepairContext): Promise<FullContext>;
    private identifyComponents;
    private fetchTestFile;
    private fetchTestHistory;
    private fetchAppPrDiff;
    private fetchAppComponents;
    private fetchSelectorsFromApp;
    private searchForSelectors;
    private extractSelectorsFromFile;
    private findAlternativeSelectors;
    private fetchNetworkPatterns;
    private fetchSimilarTests;
    private getAIComponentSuggestions;
    private generateSearchStrategy;
    private detectLanguage;
    private assembleContext;
}
//# sourceMappingURL=context-fetcher.d.ts.map