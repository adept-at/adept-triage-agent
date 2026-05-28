interface GateCounters {
    blastRadiusBlocks: number;
    branchDedupeHits: number;
    infraFastPathHits: number;
    verdictOverrideAborts: number;
    priorFailedTrajectoryBoosts: number;
    skillWriteSkips: number;
    flakinessWatchEmits: number;
    nonFixableSeedSkips: number;
    skillReinforcements: number;
}
export declare function recordGate(kind: keyof GateCounters): void;
export declare function getGateCounters(): GateCounters;
export declare function _resetGateCounters(): void;
export declare function logRunGateSummary(): void;
export {};
//# sourceMappingURL=run-telemetry.d.ts.map