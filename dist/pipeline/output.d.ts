import { ActionInputs, FixRecommendation, RepairTelemetry } from '../types';
import { ApplyResult } from '../repair/fix-applier';
export declare function resolveAutoFixTargetRepo(inputs: ActionInputs): {
    owner: string;
    repo: string;
};
export declare const NOT_STARTED_REPAIR: RepairTelemetry;
export declare function finalizeRepairTelemetry(base: RepairTelemetry | undefined, fixRecommendation: FixRecommendation | null | undefined, autoFixResult: ApplyResult | null | undefined): RepairTelemetry;
export declare function emitRepairOutputs(repair: RepairTelemetry): void;
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
    autoFixSkipped?: boolean;
    autoFixSkippedReason?: string;
    repairTelemetry?: RepairTelemetry;
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
//# sourceMappingURL=output.d.ts.map