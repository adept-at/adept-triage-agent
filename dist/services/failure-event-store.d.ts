export interface FailureEvent {
    repo: string;
    spec: string;
    testName: string;
    framework: string;
    verdict: string;
    confidence: number;
    failedAt: string;
    sourceRunId: string;
    triageRunUrl: string;
    branch: string;
    prNumber: string;
}
export declare function recordFailureEvent(region: string, tableName: string, event: FailureEvent): Promise<void>;
//# sourceMappingURL=failure-event-store.d.ts.map