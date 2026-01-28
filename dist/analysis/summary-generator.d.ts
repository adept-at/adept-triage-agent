import { ErrorData, OpenAIResponse, RepairContext, Verdict } from '../types';
interface AIRecommendation {
    confidence: number;
    reasoning: string;
    changes: AIChange[];
    evidence: string[];
    rootCause: string;
}
interface AIChange {
    file: string;
    line?: number;
    oldCode?: string;
    newCode?: string;
    justification: string;
}
export declare function generateAnalysisSummary(response: OpenAIResponse, errorData: ErrorData): string;
export declare function generateFixSummary(recommendation: AIRecommendation, context: RepairContext, includeCodeBlocks?: boolean): string;
export declare function createBriefSummary(verdict: Verdict, confidence: number, fullSummary: string, testName?: string): string;
export declare function formatVerdict(verdict: Verdict): string;
export {};
//# sourceMappingURL=summary-generator.d.ts.map