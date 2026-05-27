"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordGate = recordGate;
exports.getGateCounters = getGateCounters;
exports._resetGateCounters = _resetGateCounters;
exports.logRunGateSummary = logRunGateSummary;
const core = __importStar(require("@actions/core"));
const counters = createEmpty();
function createEmpty() {
    return {
        blastRadiusBlocks: 0,
        branchDedupeHits: 0,
        infraFastPathHits: 0,
        verdictOverrideAborts: 0,
        verdictOverrideSwaps: 0,
        priorFailedTrajectoryBoosts: 0,
        skillWriteSkips: 0,
        flakinessWatchEmits: 0,
        nonFixableSeedSkips: 0,
    };
}
function recordGate(kind) {
    counters[kind]++;
}
function getGateCounters() {
    return { ...counters };
}
function _resetGateCounters() {
    Object.assign(counters, createEmpty());
}
function logRunGateSummary() {
    try {
        const c = counters;
        core.info(`📊 gate-telemetry-summary ` +
            `blast-radius=${c.blastRadiusBlocks} ` +
            `branch-dedupe=${c.branchDedupeHits} ` +
            `infra-fast-path=${c.infraFastPathHits} ` +
            `verdict-override=${c.verdictOverrideAborts} ` +
            `verdict-override-swap=${c.verdictOverrideSwaps} ` +
            `prior-failed-boost=${c.priorFailedTrajectoryBoosts} ` +
            `skill-write-skip=${c.skillWriteSkips} ` +
            `flakiness-watch=${c.flakinessWatchEmits} ` +
            `non-fixable-seed=${c.nonFixableSeedSkips}`);
    }
    catch {
    }
}
//# sourceMappingURL=run-telemetry.js.map