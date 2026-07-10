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
exports.buildOutcomeEvent = buildOutcomeEvent;
exports.logOutcomeSummary = logOutcomeSummary;
const core = __importStar(require("@actions/core"));
const constants_1 = require("../config/constants");
const skill_store_1 = require("../services/skill-store");
const validator_1 = require("./validator");
function normalizeFailureKey(spec, testName) {
    return `${(0, skill_store_1.normalizeSpec)(spec) || 'unknown'}|${testName || 'unknown'}`;
}
const REVIEW_APPROVED_STATUSES = [
    'approved',
    'applied',
    'validated',
    'validated_publish_failed',
    'validated_not_published',
];
function buildOutcomeEvent(params) {
    const { inputs, errorData, verdict, confidence, fixRecommendation, autoFixResult, repairTelemetry, autoFixSkipped, autoFixSkippedReason, skillId, repo, } = params;
    const spec = (0, skill_store_1.normalizeSpec)(errorData.fileName) || 'unknown';
    const testName = errorData.testName || 'unknown';
    const validationStatus = autoFixResult?.validationResult?.status ||
        autoFixResult?.validationStatus ||
        '';
    const validationPassed = validationStatus === 'passed';
    const fixFullyAccepted = !!autoFixResult?.success && validationPassed;
    const repairStatus = repairTelemetry?.status || 'not_started';
    const s1 = verdict === 'TEST_ISSUE';
    const s2 = !!fixRecommendation;
    const s3 = s2 &&
        REVIEW_APPROVED_STATUSES.includes(repairStatus);
    const s5 = !!autoFixResult &&
        ((autoFixResult.modifiedFiles?.length ?? 0) > 0 ||
            ['applied', 'validated', 'validated_publish_failed', 'validated_not_published'].includes(repairStatus));
    const s4 = s1 &&
        !autoFixSkipped &&
        repairStatus !== 'skipped' &&
        repairStatus !== 'not_started';
    const s6 = validationPassed;
    const s7 = fixFullyAccepted;
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
    const triageRunId = GITHUB_RUN_ID || '';
    const triageRunUrl = GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
        ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
        : '';
    return {
        repo,
        spec,
        testName,
        failureKey: normalizeFailureKey(spec, testName),
        framework: errorData.framework || 'unknown',
        verdict,
        confidence,
        deploymentTier: (0, constants_1.isCanaryRepo)(repo) ? 'canary' : 'production',
        s1_testIssue: s1,
        s2_fixGenerated: s2,
        s3_reviewApproved: s3,
        s4_baselineReproduced: s4,
        s5_patchApplied: s5,
        s6_validationPassed: s6,
        s7_published: s7,
        repairStatus,
        validationStatus: validationStatus || '',
        autoFixSkipped: !!autoFixSkipped,
        autoFixSkippedReason,
        fixFingerprint: fixRecommendation ? (0, validator_1.fixFingerprint)(fixRecommendation) : undefined,
        skillId,
        prUrl: autoFixResult?.prUrl,
        repairElapsedMs: repairTelemetry?.elapsedMs,
        completedAt: new Date().toISOString(),
        triageRunId,
        sourceRunId: inputs.workflowRunId || '',
        triageRunUrl,
    };
}
function logOutcomeSummary(event) {
    try {
        core.info(`📊 outcome-telemetry-summary ` +
            `tier=${event.deploymentTier} ` +
            `repo=${event.repo} ` +
            `triageRunId=${event.triageRunId} ` +
            `verdict=${event.verdict} ` +
            `s1=${event.s1_testIssue ? 1 : 0} ` +
            `s2=${event.s2_fixGenerated ? 1 : 0} ` +
            `s3=${event.s3_reviewApproved ? 1 : 0} ` +
            `s4=${event.s4_baselineReproduced ? 1 : 0} ` +
            `s5=${event.s5_patchApplied ? 1 : 0} ` +
            `s6=${event.s6_validationPassed ? 1 : 0} ` +
            `s7=${event.s7_published ? 1 : 0} ` +
            `repair=${event.repairStatus} ` +
            `validation=${event.validationStatus || 'none'}` +
            (event.skillId ? ` skillId=${event.skillId}` : ''));
    }
    catch {
    }
}
//# sourceMappingURL=outcome-telemetry.js.map