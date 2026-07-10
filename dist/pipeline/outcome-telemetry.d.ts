import { ActionInputs, ErrorData, FixRecommendation, OutcomeEvent, RepairTelemetry, ValidationStatus } from '../types';
export interface OutcomeBuildParams {
    inputs: ActionInputs;
    errorData: ErrorData;
    verdict: string;
    confidence: number;
    fixRecommendation?: FixRecommendation | null;
    autoFixResult?: {
        success?: boolean;
        modifiedFiles?: string[];
        validationResult?: {
            status?: ValidationStatus;
        };
        validationStatus?: ValidationStatus;
        prUrl?: string;
    } | null;
    repairTelemetry?: RepairTelemetry;
    autoFixSkipped?: boolean;
    autoFixSkippedReason?: string;
    skillId?: string;
    repo: string;
}
export declare function buildOutcomeEvent(params: OutcomeBuildParams): OutcomeEvent;
export declare function logOutcomeSummary(event: OutcomeEvent): void;
//# sourceMappingURL=outcome-telemetry.d.ts.map