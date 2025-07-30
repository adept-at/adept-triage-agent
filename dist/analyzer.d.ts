import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData, StructuredErrorSummary } from './types';
export declare function analyzeFailure(client: OpenAIClient, errorData: ErrorData): Promise<AnalysisResult>;
export declare function extractErrorFromLogs(logs: string, testFrameworks?: string): ErrorData | null;
export declare function createStructuredErrorSummary(errorData: ErrorData): StructuredErrorSummary;
//# sourceMappingURL=analyzer.d.ts.map