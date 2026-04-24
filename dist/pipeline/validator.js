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
exports.generateFixRecommendation = generateFixRecommendation;
exports.iterativeFixValidateLoop = iterativeFixValidateLoop;
exports.requiredConfidence = requiredConfidence;
exports.fixFingerprint = fixFingerprint;
exports.buildNextPreviousAttempt = buildNextPreviousAttempt;
exports.attemptAutoFix = attemptAutoFix;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const repair_context_1 = require("../repair-context");
const simplified_repair_agent_1 = require("../repair/simplified-repair-agent");
const fix_applier_1 = require("../repair/fix-applier");
const local_fix_validator_1 = require("../services/local-fix-validator");
const constants_1 = require("../config/constants");
const repo_utils_1 = require("../utils/repo-utils");
async function generateFixRecommendation(inputs, repoDetails, errorData, openaiClient, octokit, previousAttempt, previousResponseId, skillStore, priorInvestigationContext, repoContext) {
    try {
        const iterLabel = previousAttempt
            ? ` (iteration ${previousAttempt.iteration + 1})`
            : '';
        core.info(`\n🔧 Attempting to generate fix recommendation${iterLabel}...`);
        const repairContext = (0, repair_context_1.buildRepairContext)({
            testFile: errorData.fileName || 'unknown',
            testName: errorData.testName || 'unknown',
            errorMessage: errorData.message,
            workflowRunId: inputs.workflowRunId || github.context.runId.toString(),
            jobName: inputs.jobName || 'unknown',
            commitSha: inputs.commitSha || github.context.sha,
            branch: inputs.branch || github.context.ref.replace('refs/heads/', ''),
            repository: inputs.repository || `${repoDetails.owner}/${repoDetails.repo}`,
            prNumber: inputs.prNumber,
            targetAppPrNumber: inputs.prNumber,
        });
        const autoFixTargetRepo = (0, repo_utils_1.parseRepoString)(inputs.autoFixTargetRepo, 'AUTO_FIX_TARGET_REPO');
        const repairAgent = new simplified_repair_agent_1.SimplifiedRepairAgent(openaiClient, {
            octokit,
            owner: autoFixTargetRepo.owner,
            repo: autoFixTargetRepo.repo,
            branch: inputs.branch || inputs.autoFixBaseBranch || 'main',
        }, {
            modelOverrideFixGen: inputs.modelOverrideFixGen,
            modelOverrideReview: inputs.modelOverrideReview,
        });
        const skills = skillStore
            ? {
                relevant: skillStore.findRelevant({
                    framework: errorData.framework || 'unknown',
                    spec: errorData.fileName,
                    errorMessage: errorData.message,
                }),
                flakiness: skillStore.detectFlakiness(errorData.fileName || 'unknown'),
            }
            : undefined;
        const result = await repairAgent.generateFixRecommendation(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext, repoContext);
        if (result) {
            core.info(`✅ Fix recommendation generated with ${result.fix.confidence}% confidence`);
        }
        else {
            core.info('❌ Could not generate fix recommendation');
        }
        return result;
    }
    catch (error) {
        core.warning(`Failed to generate fix recommendation: ${error}`);
        return null;
    }
}
async function iterativeFixValidateLoop(inputs, repoDetails, autoFixTargetRepo, errorData, openaiClient, octokit, skillStore, classificationResponseId, investigationContext, repoContext) {
    const maxIterations = constants_1.FIX_VALIDATE_LOOP.MAX_ITERATIONS;
    let fixRecommendation = null;
    let autoFixResult = null;
    let completedIterations = 0;
    let agentRootCause;
    let agentInvestigationFindings;
    let autoFixSkipped = false;
    let autoFixSkippedReason;
    let previousAttempt;
    const failedFixFingerprints = new Set();
    const minConfidence = inputs.autoFixMinConfidence ?? constants_1.AUTO_FIX.DEFAULT_MIN_CONFIDENCE;
    const baseBranch = inputs.branch || inputs.autoFixBaseBranch || 'main';
    let lastResponseId = classificationResponseId;
    const validator = new local_fix_validator_1.LocalFixValidator({
        owner: autoFixTargetRepo.owner,
        repo: autoFixTargetRepo.repo,
        branch: baseBranch,
        githubToken: inputs.githubToken,
        npmToken: inputs.npmToken,
        testCommand: inputs.validationTestCommand,
        spec: inputs.validationSpec || errorData.fileName,
        previewUrl: inputs.validationPreviewUrl || constants_1.DEFAULT_PRODUCT_URL,
        testTimeoutMs: constants_1.FIX_VALIDATE_LOOP.TEST_TIMEOUT_MS,
    }, octokit);
    let validatorReady = false;
    try {
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            completedIterations = iteration + 1;
            core.info(`\n${'='.repeat(60)}\n🔄 Fix-Validate iteration ${iteration + 1}/${maxIterations}\n${'='.repeat(60)}`);
            const fixResult = await generateFixRecommendation(inputs, repoDetails, errorData, openaiClient, octokit, previousAttempt, lastResponseId, skillStore, investigationContext, repoContext);
            if (!fixResult) {
                fixRecommendation = null;
                core.warning(`Iteration ${iteration + 1}: could not generate fix recommendation`);
                break;
            }
            fixRecommendation = fixResult.fix;
            lastResponseId = fixResult.lastResponseId ?? lastResponseId;
            if (fixResult.agentRootCause)
                agentRootCause = fixResult.agentRootCause;
            if (fixResult.agentInvestigationFindings)
                agentInvestigationFindings = fixResult.agentInvestigationFindings;
            if (!fixRecommendation.proposedChanges?.length) {
                core.info(`Iteration ${iteration + 1}: fix rejected — no changes proposed`);
                break;
            }
            const { required: iterRequired, reasons: iterReasons } = requiredConfidence(fixRecommendation, minConfidence);
            if (fixRecommendation.confidence < iterRequired) {
                const suffix = iterReasons.length
                    ? ` (blast-radius scaling: ${iterReasons.join('; ')})`
                    : '';
                const reason = `Blast-radius gate: confidence ${fixRecommendation.confidence}% < required ${iterRequired}%${suffix}`;
                core.info(`Iteration ${iteration + 1}: fix rejected — ${reason}`);
                if (iterReasons.length > 0) {
                    autoFixSkipped = true;
                    autoFixSkippedReason = reason;
                }
                break;
            }
            const fingerprint = fixFingerprint(fixRecommendation);
            if (failedFixFingerprints.has(fingerprint)) {
                core.warning(`Iteration ${iteration + 1}: fix identical to a previous failed attempt. Stopping.`);
                break;
            }
            core.info(`Iteration ${iteration + 1}: fix passed quality gates (confidence: ${fixRecommendation.confidence}%, changes: ${fixRecommendation.proposedChanges.length})`);
            if (!validatorReady) {
                await validator.setup();
                validatorReady = true;
                const baseline = await validator.baselineCheck();
                if (baseline.passed) {
                    core.info('✅ Baseline check passed — test passes without fix. Failure was likely transient.');
                    return { fixRecommendation: null, autoFixResult: null, iterations: 0, agentRootCause, agentInvestigationFindings, autoFixSkipped, autoFixSkippedReason };
                }
                core.info('❌ Baseline check confirmed failure — proceeding with fix.');
            }
            try {
                await validator.applyFix(fixRecommendation.proposedChanges);
            }
            catch (applyError) {
                core.warning(`Iteration ${iteration + 1}: failed to apply fix locally — ${applyError}`);
                break;
            }
            core.info(`\n🧪 Running test locally...`);
            const testResult = await validator.runTest();
            if (testResult.passed) {
                core.info(`\n✅ Test PASSED on iteration ${iteration + 1}! (${testResult.durationMs}ms)`);
                const branchName = (0, fix_applier_1.generateFixBranchName)(fixRecommendation.proposedChanges[0].file);
                try {
                    const pushResult = await validator.pushAndCreatePR({
                        branchName,
                        commitMessage: `fix(test): ${fixRecommendation.summary.slice(0, 50)}\n\nAutomated fix generated by adept-triage-agent.\nValidated locally before push.\n\nFiles: ${fixRecommendation.proposedChanges.map((c) => c.file).join(', ')}\nConfidence: ${fixRecommendation.confidence}%`,
                        prTitle: `Auto-fix: ${fixRecommendation.proposedChanges[0].file}`,
                        prBody: `Validated fix from triage run ${github.context.runId}`,
                        baseBranch,
                        changedFiles: fixRecommendation.proposedChanges.map((c) => c.file),
                    });
                    autoFixResult = {
                        success: true,
                        modifiedFiles: fixRecommendation.proposedChanges.map((c) => c.file),
                        commitSha: pushResult.commitSha,
                        branchName: pushResult.branchName,
                        validationStatus: 'passed',
                    };
                    return { fixRecommendation, autoFixResult, iterations: iteration + 1, prUrl: pushResult.prUrl, agentRootCause, agentInvestigationFindings, autoFixSkipped, autoFixSkippedReason };
                }
                catch (pushError) {
                    core.warning(`Test passed but push/PR creation failed: ${pushError}`);
                    autoFixResult = {
                        success: false,
                        modifiedFiles: fixRecommendation.proposedChanges.map((c) => c.file),
                        error: `Push failed after successful test: ${pushError}`,
                        validationStatus: 'passed',
                    };
                }
                return { fixRecommendation, autoFixResult, iterations: iteration + 1, agentRootCause, agentInvestigationFindings, autoFixSkipped, autoFixSkippedReason };
            }
            core.warning(`\n❌ Test FAILED on iteration ${iteration + 1} (exit code: ${testResult.exitCode}, ${testResult.durationMs}ms)`);
            failedFixFingerprints.add(fingerprint);
            await validator.reset();
            if (iteration < maxIterations - 1) {
                core.info('Feeding failure logs + prior agent reasoning back into repair agent for next attempt...');
                previousAttempt = buildNextPreviousAttempt(iteration + 1, fixRecommendation, fixResult, testResult.logs);
            }
            else {
                core.warning(`\n🛑 All ${maxIterations} fix attempts exhausted. Giving up.`);
            }
        }
    }
    finally {
        if (validatorReady) {
            await validator.cleanup();
        }
    }
    return { fixRecommendation, autoFixResult, iterations: completedIterations, agentRootCause, agentInvestigationFindings, autoFixSkipped, autoFixSkippedReason };
}
function normalizeFileForPatternMatch(path) {
    return ('/' + path.replace(/^\.\//, '').replace(/\\/g, '/')).toLowerCase();
}
function requiredConfidence(fix, baseMinConfidence) {
    const reasons = [];
    let required = baseMinConfidence;
    const files = new Set(fix.proposedChanges.map((c) => c.file));
    const sharedMatches = [...files].filter((f) => {
        const normalized = normalizeFileForPatternMatch(f);
        return constants_1.BLAST_RADIUS.SHARED_CODE_PATTERNS.some((p) => normalized.includes(p));
    });
    if (sharedMatches.length > 0) {
        required += constants_1.BLAST_RADIUS.SHARED_CODE_BOOST;
        reasons.push(`touches shared code (${sharedMatches.join(', ')}) — +${constants_1.BLAST_RADIUS.SHARED_CODE_BOOST}`);
    }
    if (files.size >= 2) {
        required += constants_1.BLAST_RADIUS.MULTI_FILE_BOOST;
        reasons.push(`spans ${files.size} files — +${constants_1.BLAST_RADIUS.MULTI_FILE_BOOST}`);
    }
    const effectiveMax = Math.max(baseMinConfidence, constants_1.BLAST_RADIUS.MAX_REQUIRED_CONFIDENCE);
    if (required > effectiveMax) {
        required = effectiveMax;
    }
    return { required, reasons };
}
function fixFingerprint(fix) {
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    return fix.proposedChanges
        .map((c) => `${c.file}::${normalize(c.oldCode)}::${normalize(c.newCode)}`)
        .sort()
        .join('\n');
}
function buildNextPreviousAttempt(nextIteration, previousFix, fixResult, validationLogs) {
    return {
        iteration: nextIteration,
        previousFix,
        validationLogs,
        priorAgentRootCause: fixResult.agentRootCause,
        priorAgentInvestigationFindings: fixResult.agentInvestigationFindings,
    };
}
async function attemptAutoFix(inputs, fixRecommendation, octokit, repoDetails, errorData) {
    core.info('\n🤖 Auto-fix is enabled, attempting to apply fix...');
    const baseMin = inputs.autoFixMinConfidence ?? constants_1.AUTO_FIX.DEFAULT_MIN_CONFIDENCE;
    const { required, reasons } = requiredConfidence(fixRecommendation, baseMin);
    if (fixRecommendation.confidence < required) {
        const suffix = reasons.length
            ? ` (blast-radius scaling: ${reasons.join('; ')})`
            : '';
        const skipMessage = `confidence ${fixRecommendation.confidence}% below required ${required}%${suffix}`;
        core.info(`⏭️ Auto-fix skipped: ${skipMessage}`);
        return {
            applied: null,
            skipReason: reasons.length > 0 ? `Blast-radius gate: ${skipMessage}` : undefined,
        };
    }
    const fixApplier = (0, fix_applier_1.createFixApplier)({
        octokit,
        owner: repoDetails.owner,
        repo: repoDetails.repo,
        baseBranch: inputs.branch || inputs.autoFixBaseBranch || 'main',
        minConfidence: required,
        enableValidation: inputs.enableValidation,
        validationWorkflow: inputs.validationWorkflow,
        validationTestCommand: inputs.validationTestCommand,
    });
    if (!fixApplier.canApply(fixRecommendation)) {
        core.info('⏭️ Auto-fix skipped: no changes proposed');
        return { applied: null };
    }
    try {
        const result = await fixApplier.applyFix(fixRecommendation);
        if (result.success) {
            core.info(`✅ Auto-fix applied successfully!`);
            core.info(`   Branch: ${result.branchName}`);
            core.info(`   Commit: ${result.commitSha}`);
            core.info(`   Files: ${result.modifiedFiles.join(', ')}`);
            if (inputs.enableValidation && result.branchName) {
                core.info('\n🧪 Triggering validation workflow...');
                const spec = inputs.validationSpec ||
                    errorData?.fileName ||
                    fixRecommendation.proposedChanges[0]?.file;
                const previewUrl = inputs.validationPreviewUrl || constants_1.DEFAULT_PRODUCT_URL;
                if (!inputs.validationPreviewUrl) {
                    core.info(`No preview URL provided, falling back to production: ${previewUrl}`);
                }
                if (!spec) {
                    core.warning('No spec file identified for validation, skipping validation trigger');
                    result.validationStatus = 'skipped';
                }
                else {
                    const validationResult = await fixApplier.triggerValidation({
                        branch: result.branchName,
                        spec,
                        previewUrl,
                        triageRunId: github.context.runId.toString(),
                        testCommand: inputs.validationTestCommand,
                    });
                    if (validationResult) {
                        result.validationStatus = 'pending';
                        result.validationRunId = validationResult.runId;
                        result.validationUrl = validationResult.url;
                        if (validationResult.runId) {
                            core.info(`✅ Validation workflow triggered: run ID ${validationResult.runId}`);
                        }
                        else {
                            core.info('✅ Validation workflow triggered: run ID not available yet');
                        }
                    }
                    else {
                        core.warning('Could not trigger validation workflow');
                        result.validationStatus = 'skipped';
                    }
                }
            }
        }
        else {
            core.warning(`❌ Auto-fix failed: ${result.error}`);
        }
        return { applied: result };
    }
    catch (error) {
        core.warning(`Auto-fix error: ${error}`);
        return { applied: null };
    }
}
//# sourceMappingURL=validator.js.map