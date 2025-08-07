import { Octokit } from '@octokit/rest';
export declare class SourceValidator {
    private appRepoClient;
    private appRepo;
    constructor(appRepoClient: Octokit, appRepo: string);
    validateSelectorExists(selector: string): Promise<{
        exists: boolean;
        locations: string[];
        similarSelectors: string[];
        confidence: number;
    }>;
    private extractSelectorValue;
    private searchForSelector;
    private findSimilarSelectors;
    private calculateConfidence;
    generateRecommendation(validation: {
        exists: boolean;
        locations: string[];
        similarSelectors: string[];
        confidence: number;
    }, selector: string): {
        recommendation: 'REMOVE_TEST' | 'UPDATE_SELECTOR' | 'FIX_TIMING';
        confidence: number;
        reasoning: string;
        suggestedFix?: string;
    };
}
//# sourceMappingURL=source-validator.d.ts.map