export interface TestEvidenceResult {
    trustworthy: boolean;
    reason: string;
    matched?: string;
}
export declare function verifyTestEvidence(logs: string | undefined): TestEvidenceResult;
//# sourceMappingURL=test-evidence.d.ts.map