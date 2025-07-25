import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData } from './types';
export declare function analyzeFailure(client: OpenAIClient, errorData: ErrorData): Promise<AnalysisResult>;
export declare function extractErrorFromLogs(logs: string): ErrorData | null;
//# sourceMappingURL=analyzer.d.ts.map