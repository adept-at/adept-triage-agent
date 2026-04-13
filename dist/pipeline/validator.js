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
exports.fixFingerprint = fixFingerprint;
exports.attemptAutoFix = attemptAutoFix;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const repair_context_1 = require("../repair-context");
const simplified_repair_agent_1 = require("../repair/simplified-repair-agent");
const fix_applier_1 = require("../repair/fix-applier");
const local_fix_validator_1 = require("../services/local-fix-validator");
const constants_1 = require("../config/constants");
const cursor_cloud_validator_1 = require("../services/cursor-cloud-validator");
const skill_store_1 = require("../services/skill-store");
const repo_utils_1 = require("../utils/repo-utils");
async function generateFixRecommendation(inputs, repoDetails, errorData, openaiClient, octokit, previousAttempt, previousResponseId, skillStore, priorInvestigationContext) {
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
            enableAgenticRepair: inputs.enableAgenticRepair,
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
        const result = await repairAgent.generateFixRecommendation(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext);
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
async function iterativeFixValidateLoop(inputs, repoDetails, autoFixTargetRepo, errorData, openaiClient, octokit, skillStore, classificationResponseId, investigationContext) {
    const maxIterations = constants_1.FIX_VALIDATE_LOOP.MAX_ITERATIONS;
    let fixRecommendation = null;
    let autoFixResult = null;
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
            core.info(`\n${'='.repeat(60)}\n🔄 Fix-Validate iteration ${iteration + 1}/${maxIterations}\n${'='.repeat(60)}`);
            const fixResult = await generateFixRecommendation(inputs, repoDetails, errorData, openaiClient, octokit, previousAttempt, lastResponseId, skillStore, investigationContext);
            if (!fixResult) {
                fixRecommendation = null;
                core.warning(`Iteration ${iteration + 1}: could not generate fix recommendation`);
                break;
            }
            fixRecommendation = fixResult.fix;
            lastResponseId = fixResult.lastResponseId ?? lastResponseId;
            if (fixRecommendation.confidence < minConfidence ||
                !fixRecommendation.proposedChanges?.length) {
                core.info(`Iteration ${iteration + 1}: fix rejected — confidence ${fixRecommendation.confidence}% below ${minConfidence}% or no changes`);
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
                    if (skillStore && fixRecommendation) {
                        const repoFullName = `${autoFixTargetRepo.owner}/${autoFixTargetRepo.repo}`;
                        const firstChange = fixRecommendation.proposedChanges[0];
                        const changeType = firstChange?.changeType || 'OTHER';
                        const skill = (0, skill_store_1.buildSkill)({
                            repo: repoFullName,
                            spec: errorData.fileName || 'unknown',
                            testName: errorData.testName || 'unknown',
                            framework: errorData.framework || 'unknown',
                            errorMessage: errorData.message,
                            rootCauseCategory: changeType,
                            fix: {
                                file: firstChange.file,
                                changeType,
                                summary: fixRecommendation.summary,
                                pattern: (0, skill_store_1.describeFixPattern)(fixRecommendation.proposedChanges),
                            },
                            confidence: fixRecommendation.confidence,
                            iterations: iteration + 1,
                            prUrl: pushResult.prUrl || '',
                            validatedLocally: true,
                            priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
                            investigationFindings: investigationContext || '',
                            rootCauseChain: `${changeType} → ${fixRecommendation.summary.slice(0, 80)}`,
                            repoContext: '',
                        });
                        await skillStore.save(skill).catch((err) => {
                            core.warning(`Failed to save skill: ${err}`);
                        });
                        await skillStore.recordOutcome(skill.id, true).catch(() => { });
                        return { fixRecommendation, autoFixResult, savedSkillId: skill.id };
                    }
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
                return { fixRecommendation, autoFixResult };
            }
            core.warning(`\n❌ Test FAILED on iteration ${iteration + 1} (exit code: ${testResult.exitCode}, ${testResult.durationMs}ms)`);
            failedFixFingerprints.add(fingerprint);
            await validator.reset();
            if (iteration < maxIterations - 1) {
                core.info('Feeding failure logs back into repair agent for next attempt...');
                previousAttempt = {
                    iteration: iteration + 1,
                    previousFix: fixRecommendation,
                    validationLogs: testResult.logs,
                };
            }
            else {
                core.warning(`\n🛑 All ${maxIterations} fix attempts exhausted. Giving up.`);
                if (skillStore && fixRecommendation) {
                    const repoFullName = `${autoFixTargetRepo.owner}/${autoFixTargetRepo.repo}`;
                    const firstChange = fixRecommendation.proposedChanges?.[0];
                    const changeType = firstChange?.changeType || 'OTHER';
                    const failedSkill = (0, skill_store_1.buildSkill)({
                        repo: repoFullName,
                        spec: errorData.fileName || 'unknown',
                        testName: errorData.testName || 'unknown',
                        framework: errorData.framework || 'unknown',
                        errorMessage: errorData.message,
                        rootCauseCategory: changeType,
                        fix: {
                            file: firstChange?.file || 'unknown',
                            changeType,
                            summary: fixRecommendation.summary,
                            pattern: (0, skill_store_1.describeFixPattern)(fixRecommendation.proposedChanges || []),
                        },
                        confidence: fixRecommendation.confidence,
                        iterations: maxIterations,
                        prUrl: '',
                        validatedLocally: false,
                        priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
                        investigationFindings: investigationContext || '',
                        rootCauseChain: `${changeType} → ${fixRecommendation.summary.slice(0, 80)}`,
                        repoContext: '',
                    });
                    await skillStore.save(failedSkill).catch(() => { });
                    await skillStore.recordOutcome(failedSkill.id, false).catch(() => { });
                    core.info(`📝 Saved failed fix trajectory as negative skill example (${failedSkill.id})`);
                }
            }
        }
    }
    finally {
        if (validatorReady) {
            await validator.cleanup();
        }
    }
    return { fixRecommendation, autoFixResult };
}
function fixFingerprint(fix) {
    const normalize = (s) => s.replace(/\s+/g, ' ').trim();
    return fix.proposedChanges
        .map((c) => `${c.file}::${normalize(c.oldCode)}::${normalize(c.newCode)}`)
        .sort()
        .join('\n');
}
async function attemptAutoFix(inputs, fixRecommendation, octokit, repoDetails, errorData) {
    core.info('\n🤖 Auto-fix is enabled, attempting to apply fix...');
    const fixApplier = (0, fix_applier_1.createFixApplier)({
        octokit,
        owner: repoDetails.owner,
        repo: repoDetails.repo,
        baseBranch: inputs.branch || inputs.autoFixBaseBranch || 'main',
        minConfidence: inputs.autoFixMinConfidence ?? constants_1.AUTO_FIX.DEFAULT_MIN_CONFIDENCE,
        enableValidation: inputs.enableValidation,
        validationWorkflow: inputs.validationWorkflow,
        validationTestCommand: inputs.validationTestCommand,
    });
    if (!fixApplier.canApply(fixRecommendation)) {
        core.info('⏭️ Auto-fix skipped: confidence below threshold or no changes proposed');
        return null;
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
            else if (inputs.enableCursorValidation && result.branchName) {
                core.info('\n🤖 Triggering Cursor cloud agent validation...');
                try {
                    await triggerCursorValidation(inputs, result, fixRecommendation, repoDetails, errorData);
                }
                catch (cursorError) {
                    core.warning(`Cursor cloud agent validation error: ${cursorError}`);
                    result.validationStatus = 'skipped';
                }
            }
        }
        else {
            core.warning(`❌ Auto-fix failed: ${result.error}`);
        }
        return result;
    }
    catch (error) {
        core.warning(`Auto-fix error: ${error}`);
        return null;
    }
}
async function triggerCursorValidation(inputs, result, fixRecommendation, repoDetails, errorData) {
    if (!inputs.cursorApiKey) {
        core.warning('CURSOR_API_KEY is required for Cursor cloud agent validation');
        result.validationStatus = 'skipped';
        return;
    }
    const spec = inputs.validationSpec ||
        errorData?.fileName ||
        fixRecommendation.proposedChanges[0]?.file;
    const previewUrl = inputs.validationPreviewUrl || constants_1.DEFAULT_PRODUCT_URL;
    if (!spec) {
        core.warning('No spec file identified for Cursor validation, skipping');
        result.validationStatus = 'skipped';
        return;
    }
    const repositoryUrl = `https://github.com/${repoDetails.owner}/${repoDetails.repo}`;
    const validationParams = {
        repositoryUrl,
        branch: result.branchName,
        spec,
        previewUrl,
        framework: inputs.testFrameworks,
        testCommand: inputs.validationTestCommand,
        triageRunId: inputs.workflowRunId,
    };
    const validator = new cursor_cloud_validator_1.CursorCloudValidator(inputs.cursorApiKey);
    const mode = inputs.cursorValidationMode || 'poll';
    const timeout = inputs.cursorValidationTimeout;
    core.info(`\n🤖 Launching Cursor cloud agent validation (mode: ${mode})`);
    const cursorResult = await validator.validate(validationParams, mode, timeout);
    result.validationUrl = cursorResult.agentUrl;
    if (cursorResult.status === 'FINISHED') {
        if (cursorResult.testPassed === true) {
            result.validationStatus = 'passed';
            core.info('✅ Cursor cloud agent: tests PASSED');
        }
        else if (cursorResult.testPassed === false) {
            result.validationStatus = 'failed';
            core.warning('❌ Cursor cloud agent: tests FAILED');
        }
        else {
            result.validationStatus = 'pending';
            core.info('❓ Cursor cloud agent finished but result could not be determined');
        }
    }
    else if (cursorResult.status === 'ERROR') {
        result.validationStatus = 'failed';
        core.warning('❌ Cursor cloud agent encountered an error');
    }
    else {
        result.validationStatus = 'pending';
    }
    core.info(`  Agent ID: ${cursorResult.agentId}`);
    core.info(`  Agent URL: ${cursorResult.agentUrl}`);
    core.info(`  Summary: ${cursorResult.summary}`);
    core.setOutput('cursor_agent_id', cursorResult.agentId);
    core.setOutput('cursor_agent_url', cursorResult.agentUrl || '');
    core.setOutput('cursor_validation_summary', cursorResult.summary || '');
}
//# sourceMappingURL=validator.js.map