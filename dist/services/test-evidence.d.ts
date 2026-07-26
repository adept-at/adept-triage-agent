export interface TestEvidenceResult {
    trustworthy: boolean;
    reason: string;
    matched?: string;
}
export declare function verifyTestEvidence(logs: string | undefined): TestEvidenceResult;
export declare function extractPrimaryValidationError(logs?: string): string | undefined;
export declare function extractFailedAssertion(primaryError: string): string | undefined;
export declare function normalizeFailureSignature(message: string): string;
//# sourceMappingURL=test-evidence.d.ts.map