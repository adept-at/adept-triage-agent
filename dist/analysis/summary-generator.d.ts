import { ErrorData, OpenAIResponse, RepairContext, AIRecommendation } from '../types';
export declare function generateAnalysisSummary(response: OpenAIResponse, errorData: ErrorData): string;
export declare function generateFixSummary(recommendation: AIRecommendation, context: RepairContext, includeCodeBlocks?: boolean): string;
//# sourceMappingURL=summary-generator.d.ts.map