import { RepairContext } from '../types';
export type { RepairContext } from '../types';
export interface DataRequirements {
    testFile: boolean;
    testHistory: boolean;
    appPrDiff: boolean;
    appComponents: string[];
    appSelectors: boolean;
    networkPatterns: boolean;
    similarTests: boolean;
}
export interface FullContext {
    minimal: RepairContext;
    fetched: {
        testFileContent?: string;
        errorLineContext?: string;
        testHistory?: TestHistoryEntry[];
        appPrDiff?: string;
        appComponents?: ComponentData[];
        availableSelectors?: SelectorMap;
        networkPatterns?: NetworkPattern[];
        similarTests?: SimilarTest[];
    };
    metadata: {
        fetchedAt: string;
        sources: string[];
        fetchDuration: number;
    };
}
export interface TestHistoryEntry {
    commitSha: string;
    date: string;
    status: 'passed' | 'failed';
    changes?: string;
}
export interface ComponentData {
    path: string;
    content: string;
    language: string;
    relevance: number;
}
export interface SelectorMap {
    found: SelectorInfo[];
    alternatives: SelectorInfo[];
    confidence: Record<string, number>;
}
export interface SelectorInfo {
    selector: string;
    type: 'data-testid' | 'data-test' | 'id' | 'class' | 'aria-label' | 'alt' | 'other';
    stability: 'high' | 'medium' | 'low';
    source: string;
    lineNumber?: number;
}
export interface NetworkPattern {
    endpoint: string;
    method: string;
    status?: number;
    timing?: number;
}
export interface SimilarTest {
    file: string;
    name: string;
    similarity: number;
    selectors: string[];
}
export interface SearchStrategy {
    targetElement: {
        type: string;
        purpose: string;
        context: string;
    };
    searchQueries: SearchQuery[];
    componentHints: string[];
}
export interface SearchQuery {
    query: string;
    rationale: string;
    priority: number;
}
export interface RepairResult {
    canRepair: boolean;
    confidence?: number;
    reason?: string;
    proposedFix?: ProposedChange[];
    evidence?: string[];
    missingInformation?: string[];
}
export interface ProposedChange {
    file: string;
    line: number;
    oldCode: string;
    newCode: string;
    justification: string;
}
export interface RepairConfig {
    testRepoToken: string;
    appRepoToken: string;
    openaiApiKey: string;
    testRepo: string;
    appRepo: string;
    minConfidence: number;
    requireEvidence: boolean;
    createPr: boolean;
    maxSearchAttempts?: number;
    debugMode?: boolean;
}
export interface RepairMetrics {
    repairAttemptId: string;
    minimalContextSize: number;
    fetchedDataSize: number;
    fetchDuration: number;
    totalDataFetched: number;
    openAITokensUsed?: number;
    confidence: number;
    decision: 'REPAIR' | 'CANNOT_REPAIR';
    reasoning: string;
    evidenceUsed: string[];
}
//# sourceMappingURL=types.d.ts.map