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
exports.NOT_STARTED_REPAIR = void 0;
exports.resolveAutoFixTargetRepo = resolveAutoFixTargetRepo;
exports.finalizeRepairTelemetry = finalizeRepairTelemetry;
exports.emitRepairOutputs = emitRepairOutputs;
exports.setInconclusiveOutput = setInconclusiveOutput;
exports.setErrorOutput = setErrorOutput;
exports.setSuccessOutput = setSuccessOutput;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const repo_utils_1 = require("../utils/repo-utils");
function resolveAutoFixTargetRepo(inputs) {
    return (0, repo_utils_1.parseRepoString)(inputs.autoFixTargetRepo, 'AUTO_FIX_TARGET_REPO');
}
exports.NOT_STARTED_REPAIR = {
    status: 'not_started',
    summary: 'Repair did not run for this outcome.',
    iterations: 0,
    elapsedMs: 0,
};
function finalizeRepairTelemetry(base, fixRecommendation, autoFixResult) {
    if (base?.status === 'skipped') {
        return base;
    }
    if (!base) {
        if (fixRecommendation) {
            return {
                status: 'approved',
                summary: 'Fix recommendation produced; branch apply / validation not completed in this run.',
                iterations: 0,
                elapsedMs: 0,
                lastFixSummary: fixRecommendation.summary,
                lastFixConfidence: fixRecommendation.confidence,
            };
        }
        return { ...exports.NOT_STARTED_REPAIR };
    }
    let status = base.status;
    let summary = base.summary;
    if (autoFixResult?.success) {
        const vs = autoFixResult.validationResult?.status || autoFixResult.validationStatus;
        if (vs === 'passed') {
            status = 'validated';
            summary = 'Auto-fix validated.';
        }
        else if (vs === 'pending') {
            status = 'applied';
            summary = 'Auto-fix applied; remote validation pending.';
        }
        else if (vs === 'skipped') {
            status = 'applied';
            summary = 'Auto-fix applied (validation skipped).';
        }
        else {
            status = 'applied';
            summary = 'Auto-fix applied (branch created).';
        }
    }
    return { ...base, status, summary };
}
function emitRepairOutputs(repair) {
    core.setOutput('repair_status', repair.status);
    core.setOutput('repair_summary', repair.summary);
    core.setOutput('repair_details', JSON.stringify({
        iterations: repair.iterations,
        lastStage: repair.lastStage,
        lastReviewIssues: repair.lastReviewIssues,
        lastReviewAssessment: repair.lastReviewAssessment,
        lastFixSummary: repair.lastFixSummary,
        lastFixConfidence: repair.lastFixConfidence,
        timeoutMs: repair.timeoutMs,
        elapsedMs: repair.elapsedMs,
    }));
    core.setOutput('repair_iterations', String(repair.iterations));
    core.setOutput('repair_last_stage', repair.lastStage || '');
    core.setOutput('repair_review_issues', repair.lastReviewIssues?.length ? repair.lastReviewIssues.join('\n') : '');
}
function setInconclusiveOutput(result, inputs, errorData) {
    const inconclusiveTriageJson = {
        verdict: 'INCONCLUSIVE',
        confidence: result.confidence,
        reasoning: `Low confidence: ${result.reasoning}`,
        summary: 'Analysis inconclusive due to low confidence',
        indicators: result.indicators || [],
        repair: exports.NOT_STARTED_REPAIR,
        metadata: {
            analyzedAt: new Date().toISOString(),
            confidenceThreshold: inputs.confidenceThreshold,
            hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
            logSize: errorData.logs?.reduce((sum, l) => sum + l.length, 0) ?? 0,
        },
    };
    core.setOutput('verdict', 'INCONCLUSIVE');
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', `Low confidence: ${result.reasoning}`);
    core.setOutput('summary', 'Analysis inconclusive due to low confidence');
    core.setOutput('triage_json', JSON.stringify(inconclusiveTriageJson));
    emitRepairOutputs(exports.NOT_STARTED_REPAIR);
}
function setErrorOutput(reason) {
    core.setOutput('verdict', 'ERROR');
    core.setOutput('confidence', '0');
    core.setOutput('reasoning', reason);
    core.setOutput('summary', `Triage failed: ${reason}`);
    const errorRepair = {
        status: 'not_started',
        summary: `Repair did not run (triage error: ${reason}).`,
        iterations: 0,
        elapsedMs: 0,
    };
    core.setOutput('triage_json', JSON.stringify({
        verdict: 'ERROR',
        confidence: 0,
        reasoning: reason,
        summary: `Triage failed: ${reason}`,
        indicators: [],
        repair: errorRepair,
        metadata: { analyzedAt: new Date().toISOString(), error: true },
    }));
    emitRepairOutputs(errorRepair);
    core.setFailed(reason);
}
function setSuccessOutput(result, errorData, autoFixResult, flakiness) {
    const repairBlock = result.repairTelemetry ??
        finalizeRepairTelemetry(undefined, result.fixRecommendation, autoFixResult);
    const triageJson = {
        verdict: result.verdict,
        confidence: result.confidence,
        reasoning: result.reasoning,
        summary: result.summary,
        indicators: result.indicators || [],
        ...(result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations
            ? { suggestedSourceLocations: result.suggestedSourceLocations }
            : {}),
        ...(result.verdict === 'TEST_ISSUE' && result.fixRecommendation
            ? { fixRecommendation: result.fixRecommendation }
            : {}),
        ...(autoFixResult?.success
            ? {
                autoFix: {
                    applied: true,
                    branch: autoFixResult.branchName,
                    commit: autoFixResult.commitSha,
                    files: autoFixResult.modifiedFiles,
                    validation: mergeValidationResult(autoFixResult) || {
                        status: autoFixResult.validationStatus || 'skipped',
                        mode: autoFixResult.validationRunId ? 'remote' : 'local',
                        runId: autoFixResult.validationRunId,
                        url: autoFixResult.validationUrl,
                    },
                },
            }
            : {}),
        ...(autoFixResult?.validationResult
            ? {
                validation: mergeValidationResult(autoFixResult),
            }
            : {}),
        ...(result.autoFixSkipped
            ? {
                autoFixSkipped: true,
                autoFixSkippedReason: result.autoFixSkippedReason || '',
            }
            : {}),
        ...(flakiness?.isFlaky
            ? {
                flakiness: {
                    isFlaky: true,
                    fixCount: flakiness.fixCount,
                    windowDays: flakiness.windowDays,
                    message: flakiness.message,
                },
            }
            : {}),
        repair: repairBlock,
        metadata: {
            analyzedAt: new Date().toISOString(),
            hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
            logSize: errorData.logs?.reduce((sum, l) => sum + l.length, 0) ?? 0,
            hasFixRecommendation: !!result.fixRecommendation,
            autoFixApplied: autoFixResult?.success || false,
            autoFixSkipped: !!result.autoFixSkipped,
        },
    };
    core.setOutput('verdict', result.verdict);
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', result.reasoning);
    core.setOutput('summary', result.summary || '');
    core.setOutput('triage_json', JSON.stringify(triageJson));
    emitRepairOutputs(repairBlock);
    if (result.fixRecommendation) {
        core.setOutput('has_fix_recommendation', 'true');
        core.setOutput('fix_recommendation', JSON.stringify(result.fixRecommendation));
        core.setOutput('fix_summary', result.fixRecommendation.summary);
        core.setOutput('fix_confidence', result.fixRecommendation.confidence.toString());
    }
    else {
        core.setOutput('has_fix_recommendation', 'false');
    }
    if (autoFixResult?.success) {
        core.setOutput('auto_fix_applied', 'true');
        core.setOutput('auto_fix_branch', autoFixResult.branchName || '');
        core.setOutput('auto_fix_commit', autoFixResult.commitSha || '');
        core.setOutput('auto_fix_files', JSON.stringify(autoFixResult.modifiedFiles));
        const validationStatus = autoFixResult.validationResult?.status || autoFixResult.validationStatus;
        const validationUrl = autoFixResult.validationResult?.url || autoFixResult.validationUrl;
        const validationRunId = autoFixResult.validationResult?.runId || autoFixResult.validationRunId;
        if (validationRunId) {
            core.setOutput('validation_run_id', validationRunId.toString());
            core.setOutput('validation_status', validationStatus || 'pending');
            core.setOutput('validation_url', validationUrl ||
                `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${validationRunId}`);
        }
        else if (validationStatus === 'pending') {
            core.setOutput('validation_status', 'pending');
            if (validationUrl) {
                core.setOutput('validation_url', validationUrl);
            }
        }
        else {
            core.setOutput('validation_status', validationStatus || 'skipped');
        }
    }
    else {
        core.setOutput('auto_fix_applied', 'false');
        core.setOutput('validation_status', autoFixResult?.validationStatus || 'skipped');
    }
    core.setOutput('auto_fix_skipped', result.autoFixSkipped ? 'true' : 'false');
    if (result.autoFixSkippedReason) {
        core.setOutput('auto_fix_skipped_reason', result.autoFixSkippedReason);
    }
    core.info(`Verdict: ${result.verdict}`);
    core.info(`Confidence: ${result.confidence}%`);
    core.info(`Summary: ${result.summary}`);
    core.info(`Repair: status=${repairBlock.status} iterations=${repairBlock.iterations}` +
        (repairBlock.lastStage ? ` lastStage=${repairBlock.lastStage}` : ''));
    if (result.autoFixSkipped) {
        core.info(`\n⏭️  Auto-fix intentionally skipped: ${result.autoFixSkippedReason || 'see triage_json.autoFixSkippedReason'}`);
    }
    if (result.verdict === 'PRODUCT_ISSUE' &&
        result.suggestedSourceLocations &&
        result.suggestedSourceLocations.length > 0) {
        core.info('\n🎯 Suggested Source Locations to Investigate:');
        result.suggestedSourceLocations.forEach((location, index) => {
            core.info(`  ${index + 1}. ${location.file} (lines ${location.lines})`);
            core.info(`     Reason: ${location.reason}`);
        });
    }
    if (result.verdict === 'TEST_ISSUE' && result.fixRecommendation) {
        core.info('\n🔧 Fix Recommendation Generated:');
        core.info(`  Confidence: ${result.fixRecommendation.confidence}%`);
        core.info(`  Changes: ${result.fixRecommendation.proposedChanges.length} file(s)`);
        core.info(`  Evidence: ${result.fixRecommendation.evidence.length} item(s)`);
        core.info('\n📝 Fix Summary:');
        core.info(result.fixRecommendation.summary);
        if (autoFixResult?.success) {
            core.info('\n✅ Auto-Fix Applied:');
            core.info(`  Branch: ${autoFixResult.branchName}`);
            core.info(`  Commit: ${autoFixResult.commitSha}`);
            core.info(`  Files: ${autoFixResult.modifiedFiles.join(', ')}`);
            const validationStatus = autoFixResult.validationResult?.status || autoFixResult.validationStatus;
            if (validationStatus === 'passed') {
                core.info('\n🧪 Validation: passed (locally validated before push)');
            }
            else if (autoFixResult.validationRunId) {
                core.info(`\n🧪 Validation: ${validationStatus}`);
                core.info(`  Run ID: ${autoFixResult.validationRunId}`);
                if (autoFixResult.validationResult?.failure?.primaryError) {
                    core.info(`  Failure: ${autoFixResult.validationResult.failure.primaryError}`);
                }
            }
            else {
                core.info(`\n🧪 Validation: ${validationStatus || 'skipped'}`);
            }
        }
    }
}
function mergeValidationResult(autoFixResult) {
    if (!autoFixResult.validationResult)
        return undefined;
    return {
        ...autoFixResult.validationResult,
        runId: autoFixResult.validationResult.runId || autoFixResult.validationRunId,
        url: autoFixResult.validationResult.url || autoFixResult.validationUrl,
    };
}
//# sourceMappingURL=output.js.map