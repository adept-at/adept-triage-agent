export type SourceRunGateResult = {
    status: 'admitted';
    attemptCount: number;
} | {
    status: 'limited';
} | {
    status: 'unavailable';
    reason: string;
};
interface SourceRunGateParams {
    region: string;
    tableName: string;
    repository: string;
    sourceRunId: string;
    sourceRunAttempt: number;
    maxAttempts: number;
    now?: Date;
}
export declare function claimSourceRunSlot(params: SourceRunGateParams): Promise<SourceRunGateResult>;
export {};
//# sourceMappingURL=source-run-gate.d.ts.map