export interface RetryOptions {
    context: string;
    maxRetries?: number;
    retryableStatuses?: number[];
    baseDelayMs?: number;
    maxDelayMs?: number;
}
export declare function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>;
//# sourceMappingURL=retry.d.ts.map