import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData, Framework } from './types';
export declare function analyzeFailure(client: OpenAIClient, errorData: ErrorData, skillContext?: string): Promise<AnalysisResult>;
export declare function extractErrorFromLogs(logs: string): ErrorData | null;
export declare function resolveFramework(detected: string | undefined, opts: {
    testFile?: string;
    testFrameworksInput?: string;
}): Framework;
//# sourceMappingURL=simplified-analyzer.d.ts.map