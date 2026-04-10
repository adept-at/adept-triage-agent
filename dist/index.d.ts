import { ActionInputs, FixRecommendation } from './types';
import { ApplyResult } from './repair/fix-applier';
export { fixFingerprint } from './pipeline/validator';
declare function run(): Promise<void>;
export declare function resolveAutoFixTargetRepo(inputs: ActionInputs): {
    owner: string;
    repo: string;
};
export declare function setInconclusiveOutput(result: {
    confidence: number;
    reasoning: string;
    indicators?: string[];
}, inputs: ActionInputs, errorData: {
    screenshots?: Array<{
        name: string;
    }>;
    logs?: string[];
}): void;
export declare function setErrorOutput(reason: string): void;
export declare function setSuccessOutput(result: {
    verdict: string;
    confidence: number;
    reasoning: string;
    summary?: string;
    indicators?: string[];
    suggestedSourceLocations?: {
        file: string;
        lines: string;
        reason: string;
    }[];
    fixRecommendation?: FixRecommendation;
}, errorData: {
    screenshots?: Array<{
        name: string;
    }>;
    logs?: string[];
}, autoFixResult?: ApplyResult | null, flakiness?: {
    isFlaky: boolean;
    fixCount: number;
    windowDays: number;
    message: string;
}): void;
export { run };
//# sourceMappingURL=index.d.ts.map