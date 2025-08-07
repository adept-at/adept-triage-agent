import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData, FewShotExample } from './types';
declare const FEW_SHOT_EXAMPLES: FewShotExample[];
export declare function analyzeFailure(client: OpenAIClient, errorData: ErrorData): Promise<AnalysisResult>;
export declare function extractErrorFromLogs(logs: string): ErrorData | null;
export { FEW_SHOT_EXAMPLES };
//# sourceMappingURL=simplified-analyzer.d.ts.map