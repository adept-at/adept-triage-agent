import { OpenAIClient } from '../openai-client';
import { Octokit } from '@octokit/rest';
import { RepairContext, SearchStrategy, SelectorMap } from './types';
export declare class SearchStrategyGenerator {
    private openaiClient;
    private appRepoClient;
    private appRepo;
    constructor(openaiClient: OpenAIClient, appRepoClient: Octokit, appRepo: string);
    generateSearchQueries(context: RepairContext): Promise<SearchStrategy>;
    executeSearchStrategy(strategy: SearchStrategy, _context: RepairContext): Promise<SelectorMap>;
    private buildSearchPrompt;
    private parseSearchStrategyFromOpenAI;
    private parseSearchResponse;
    private getFallbackStrategy;
    private fetchFileContent;
    private extractSelectorsWithAI;
    private parseSelectorsFromAI;
    private extractSelectorsWithPatterns;
    private searchComponentForSelectors;
    private formatSelector;
    private determineStability;
}
//# sourceMappingURL=search-strategy.d.ts.map