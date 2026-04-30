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
exports.PipelineCoordinator = void 0;
exports.shouldWriteSkillOutcome = shouldWriteSkillOutcome;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const simplified_analyzer_1 = require("../simplified-analyzer");
const log_processor_1 = require("../services/log-processor");
const skill_store_1 = require("../services/skill-store");
const repo_context_fetcher_1 = require("../services/repo-context-fetcher");
const root_cause_category_1 = require("../repair/root-cause-category");
const constants_1 = require("../config/constants");
const output_1 = require("./output");
const validator_1 = require("./validator");
class PipelineCoordinator {
    octokit;
    openaiClient;
    artifactFetcher;
    inputs;
    repoDetails;
    constructor(deps) {
        this.octokit = deps.octokit;
        this.openaiClient = deps.openaiClient;
        this.artifactFetcher = deps.artifactFetcher;
        this.inputs = deps.inputs;
        this.repoDetails = deps.repoDetails;
    }
    async classify(errorData, skillStore) {
        const flakinessSignal = skillStore
            ? skillStore.detectFlakiness(errorData.fileName || 'unknown')
            : undefined;
        if (flakinessSignal?.isFlaky) {
            core.warning(`⚠️ FLAKINESS DETECTED: ${flakinessSignal.message}`);
        }
        const classifierSkills = skillStore
            ? skillStore.findForClassifier({
                framework: errorData.framework || 'unknown',
                spec: errorData.fileName,
                errorMessage: errorData.message,
            })
            : [];
        const classifierSkillIds = classifierSkills.map((s) => s.id);
        const skillContext = skillStore
            ? skillStore.formatSkillsForClassifierContext(classifierSkills)
            : '';
        const flakinessContext = flakinessSignal?.isFlaky
            ? [
                '### Flakiness Signal',
                flakinessSignal.message,
                'Treat this as additional evidence of instability, but do not let it override the current failure evidence.',
            ].join('\n')
            : '';
        const classifierContext = [skillContext, flakinessContext]
            .filter(Boolean)
            .join('\n\n');
        const result = classifierContext
            ? await (0, simplified_analyzer_1.analyzeFailure)(this.openaiClient, errorData, classifierContext)
            : await (0, simplified_analyzer_1.analyzeFailure)(this.openaiClient, errorData);
        if (result.confidence < this.inputs.confidenceThreshold) {
            core.warning(`Confidence ${result.confidence}% is below threshold ${this.inputs.confidenceThreshold}%`);
            (0, output_1.setInconclusiveOutput)(result, this.inputs, errorData);
            return { ...result, responseId: result.responseId, classifierSkillIds };
        }
        if (result.verdict !== 'TEST_ISSUE') {
            (0, output_1.setSuccessOutput)(result, errorData, null, flakinessSignal);
            return { ...result, responseId: result.responseId, classifierSkillIds };
        }
        core.setOutput('verdict', result.verdict);
        core.setOutput('confidence', result.confidence.toString());
        core.setOutput('reasoning', result.reasoning);
        core.setOutput('summary', result.summary || '');
        return { ...result, responseId: result.responseId, classifierSkillIds };
    }
    async repair(_classification, errorData, skillStore) {
        const autoFixTargetRepo = this.inputs.autoFixTargetRepo
            ? (0, output_1.resolveAutoFixTargetRepo)(this.inputs)
            : null;
        const investigationContext = skillStore
            ? skillStore.formatForInvestigation({
                framework: errorData.framework || 'unknown',
                spec: errorData.fileName,
                errorMessage: errorData.message,
            })
            : '';
        const contextOwner = autoFixTargetRepo?.owner ?? this.repoDetails.owner;
        const contextRepo = autoFixTargetRepo?.repo ?? this.repoDetails.repo;
        const contextRef = this.inputs.branch || this.inputs.autoFixBaseBranch || 'main';
        const repoContextFetcher = new repo_context_fetcher_1.RepoContextFetcher(this.octokit);
        const repoContext = await repoContextFetcher.fetch(contextOwner, contextRepo, contextRef);
        let fixRecommendation = null;
        let autoFixResult = null;
        let iterations = 0;
        let prUrl;
        let agentRootCause;
        let agentInvestigationFindings;
        let autoFixSkipped;
        let autoFixSkippedReason;
        if (this.inputs.enableAutoFix &&
            this.inputs.enableValidation &&
            this.inputs.enableLocalValidation &&
            this.inputs.validationTestCommand &&
            autoFixTargetRepo) {
            const loopResult = await (0, validator_1.iterativeFixValidateLoop)(this.inputs, this.repoDetails, autoFixTargetRepo, errorData, this.openaiClient, this.octokit, skillStore, undefined, investigationContext, repoContext);
            fixRecommendation = loopResult.fixRecommendation;
            autoFixResult = loopResult.autoFixResult;
            iterations = loopResult.iterations;
            prUrl = loopResult.prUrl;
            agentRootCause = loopResult.agentRootCause;
            agentInvestigationFindings = loopResult.agentInvestigationFindings;
            autoFixSkipped = loopResult.autoFixSkipped;
            autoFixSkippedReason = loopResult.autoFixSkippedReason;
        }
        else {
            const singleResult = await (0, validator_1.generateFixRecommendation)(this.inputs, this.repoDetails, errorData, this.openaiClient, this.octokit, undefined, undefined, skillStore, investigationContext, repoContext);
            fixRecommendation = singleResult?.fix ?? null;
            agentRootCause = singleResult?.agentRootCause;
            agentInvestigationFindings = singleResult?.agentInvestigationFindings;
            if (fixRecommendation && this.inputs.enableAutoFix && autoFixTargetRepo) {
                const outcome = await (0, validator_1.attemptAutoFix)(this.inputs, fixRecommendation, this.octokit, autoFixTargetRepo, errorData);
                autoFixResult = outcome.applied;
                if (outcome.skipReason) {
                    autoFixSkipped = true;
                    autoFixSkippedReason = outcome.skipReason;
                }
            }
        }
        return {
            fixRecommendation,
            autoFixResult,
            investigationContext,
            iterations,
            prUrl,
            agentRootCause,
            agentInvestigationFindings,
            autoFixSkipped,
            autoFixSkippedReason,
        };
    }
    async execute() {
        const errorData = await (0, log_processor_1.processWorkflowLogs)(this.octokit, this.artifactFetcher, this.inputs, this.repoDetails);
        if (!errorData) {
            await this.handleNoErrorData();
            return;
        }
        const autoFixTargetRepo = this.inputs.autoFixTargetRepo
            ? (0, output_1.resolveAutoFixTargetRepo)(this.inputs)
            : null;
        let skillStore;
        if (autoFixTargetRepo) {
            skillStore = new skill_store_1.SkillStore(this.inputs.triageAwsRegion || 'us-east-1', this.inputs.triageDynamoTable || 'triage-skills-v1-live', autoFixTargetRepo.owner, autoFixTargetRepo.repo);
            await skillStore.load();
        }
        try {
            await this.runClassifyAndRepair(errorData, skillStore, autoFixTargetRepo);
        }
        finally {
            skillStore?.logRunSummary();
        }
    }
    async runClassifyAndRepair(errorData, skillStore, autoFixTargetRepo) {
        const classification = await this.classify(errorData, skillStore);
        if (classification.confidence < this.inputs.confidenceThreshold)
            return;
        if (classification.verdict !== 'TEST_ISSUE')
            return;
        const chronicFlakinessSignal = skillStore
            ? skillStore.detectFlakiness(errorData.fileName || 'unknown')
            : undefined;
        if (chronicFlakinessSignal?.isFlaky &&
            chronicFlakinessSignal.fixCount >= constants_1.CHRONIC_FLAKINESS_THRESHOLD) {
            const reason = `Chronic flakiness: ${chronicFlakinessSignal.message} Auto-fix skipped — likely needs human refactor (replace fixed pauses with deterministic waits, consolidate success surfaces) rather than another fallback.`;
            core.warning(`⏭️  ${reason}`);
            (0, output_1.setSuccessOutput)({
                ...classification,
                autoFixSkipped: true,
                autoFixSkippedReason: reason,
            }, errorData, null, chronicFlakinessSignal);
            return;
        }
        const { fixRecommendation, autoFixResult, iterations, prUrl: skillPrUrl, agentRootCause, agentInvestigationFindings, autoFixSkipped: repairAutoFixSkipped, autoFixSkippedReason: repairAutoFixSkippedReason, } = await this.repair(classification, errorData, skillStore);
        if (skillStore && autoFixTargetRepo && errorData) {
            const validationStatus = autoFixResult?.validationResult?.status || autoFixResult?.validationStatus;
            const fixSucceeded = !!(autoFixResult?.success && validationStatus === 'passed');
            const fixAttempted = !!fixRecommendation;
            const shouldSaveSkill = shouldWriteSkillOutcome(autoFixResult);
            const validationPending = validationStatus === 'pending';
            if (fixAttempted && validationPending) {
                core.info('📝 Skipping skill outcome write while remote validation is pending');
            }
            if (fixAttempted && !shouldSaveSkill && !validationPending) {
                core.info('📝 Skipping skill outcome write because no validation attempt produced a terminal result');
            }
            if (fixAttempted && shouldSaveSkill) {
                const firstChange = fixRecommendation.proposedChanges?.[0];
                const rootCause = agentRootCause || inferRootCauseCategory(fixRecommendation);
                const currentFindings = agentInvestigationFindings || '';
                const failedFixEvidence = fixSucceeded
                    ? undefined
                    : buildFailedFixEvidence(errorData, autoFixResult);
                const skill = (0, skill_store_1.buildSkill)({
                    repo: `${autoFixTargetRepo.owner}/${autoFixTargetRepo.repo}`,
                    spec: errorData.fileName || 'unknown',
                    testName: errorData.testName || 'unknown',
                    framework: errorData.framework || 'unknown',
                    errorMessage: errorData.message,
                    rootCauseCategory: rootCause,
                    fix: {
                        file: firstChange?.file || 'unknown',
                        changeType: rootCause,
                        summary: fixRecommendation.summary,
                        pattern: (0, skill_store_1.describeFixPattern)(fixRecommendation.proposedChanges || []),
                    },
                    confidence: fixRecommendation.confidence,
                    iterations,
                    prUrl: skillPrUrl || '',
                    validatedLocally: fixSucceeded,
                    priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
                    investigationFindings: currentFindings,
                    rootCauseChain: `${rootCause} → ${fixRecommendation.summary?.slice(0, 80)}`,
                    failureModeTrace: fixRecommendation.failureModeTrace,
                    failedFixEvidence,
                });
                const saveSucceeded = await skillStore.save(skill).catch((err) => {
                    core.warning(`Failed to save skill: ${err}`);
                    return false;
                });
                if (saveSucceeded) {
                    if (fixSucceeded) {
                        await skillStore.recordOutcome(skill.id, true);
                        await skillStore.recordClassificationOutcome(skill.id, 'correct');
                        core.info(`📝 Saved validated skill ${skill.id}`);
                    }
                    else {
                        await skillStore.recordOutcome(skill.id, false);
                        core.info(`📝 Saved failed skill trajectory ${skill.id}`);
                    }
                    core.info(`📊 learning-telemetry verdict=${classification.verdict} ` +
                        `savedSkillId=${skill.id} fixSucceeded=${fixSucceeded} ` +
                        `iterations=${iterations}`);
                }
            }
        }
        const result = { ...classification };
        if (fixRecommendation) {
            result.fixRecommendation = fixRecommendation;
        }
        if (repairAutoFixSkipped) {
            result.autoFixSkipped = true;
            if (repairAutoFixSkippedReason) {
                result.autoFixSkippedReason = repairAutoFixSkippedReason;
            }
        }
        const flakinessSignal = skillStore
            ? skillStore.detectFlakiness(errorData.fileName || 'unknown')
            : undefined;
        (0, output_1.setSuccessOutput)(result, errorData, autoFixResult, flakinessSignal);
    }
    async handleNoErrorData() {
        const { owner, repo } = this.repoDetails;
        const runId = this.inputs.workflowRunId || github.context.runId.toString();
        try {
            const workflowRun = await this.octokit.actions.getWorkflowRun({
                owner,
                repo,
                run_id: parseInt(runId, 10),
            });
            if (workflowRun.data.status !== 'completed') {
                if (this.inputs.jobName) {
                    try {
                        const jobs = await this.octokit.actions.listJobsForWorkflowRun({
                            owner,
                            repo,
                            run_id: parseInt(runId, 10),
                            filter: 'latest',
                        });
                        const targetJob = jobs.data.jobs.find((job) => job.name === this.inputs.jobName);
                        if (!targetJob) {
                            core.warning(`Job '${this.inputs.jobName}' not found yet while workflow is still in progress`);
                        }
                        else if (targetJob.status === 'completed' &&
                            targetJob.conclusion !== 'failure') {
                            core.info(`Job '${this.inputs.jobName}' completed with conclusion: ${targetJob.conclusion} — nothing to triage`);
                            core.setOutput('verdict', 'NO_FAILURE');
                            core.setOutput('confidence', '100');
                            core.setOutput('reasoning', `Job '${this.inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion}). No triage needed.`);
                            core.setOutput('summary', `No failure detected — job concluded with ${targetJob.conclusion}`);
                            core.setOutput('triage_json', JSON.stringify({
                                verdict: 'NO_FAILURE',
                                confidence: 100,
                                reasoning: `Job '${this.inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion}). No triage needed.`,
                                summary: `No failure detected — job concluded with ${targetJob.conclusion}`,
                                indicators: [],
                                metadata: {
                                    analyzedAt: new Date().toISOString(),
                                    jobConclusion: targetJob.conclusion,
                                },
                            }));
                            return;
                        }
                    }
                    catch (jobCheckError) {
                        core.debug(`Error checking job status: ${jobCheckError}`);
                    }
                }
                core.warning(`Workflow run ${runId} is still in progress (status: ${workflowRun.data.status})`);
                const pendingTriageJson = {
                    verdict: 'PENDING',
                    confidence: 0,
                    reasoning: 'Workflow is still running. Please wait for it to complete before running triage analysis.',
                    summary: 'Analysis pending - workflow not completed',
                    indicators: [],
                    metadata: {
                        analyzedAt: new Date().toISOString(),
                        workflowStatus: workflowRun.data.status,
                    },
                };
                core.setOutput('verdict', 'PENDING');
                core.setOutput('confidence', '0');
                core.setOutput('reasoning', 'Workflow is still running. Please wait for it to complete before running triage analysis.');
                core.setOutput('summary', 'Analysis pending - workflow not completed');
                core.setOutput('triage_json', JSON.stringify(pendingTriageJson));
                return;
            }
        }
        catch (error) {
            core.debug(`Error checking workflow status: ${error}`);
        }
        (0, output_1.setErrorOutput)('No error data found to analyze');
    }
}
exports.PipelineCoordinator = PipelineCoordinator;
function inferRootCauseCategory(fix) {
    return (0, root_cause_category_1.inferRootCauseCategoryFromText)([
        fix.summary,
        fix.reasoning,
        ...(fix.evidence || []),
        ...(fix.proposedChanges?.map((c) => c.justification) || []),
    ]
        .filter(Boolean)
        .join(' '));
}
function buildFailedFixEvidence(errorData, autoFixResult) {
    const validationFailure = autoFixResult?.validationResult?.failure?.primaryError ||
        autoFixResult?.error ||
        'Fix did not produce a validated passing result';
    const originalFailure = errorData.message || 'unknown original failure';
    return {
        fixCommit: autoFixResult?.commitSha,
        validationRunId: autoFixResult?.validationResult?.runId || autoFixResult?.validationRunId,
        originalFailureSignature: normalizeFailureSignature(originalFailure),
        validationFailureSignature: normalizeFailureSignature(validationFailure),
        failedAssertion: autoFixResult?.validationResult?.failure?.failedAssertion,
        failureStage: autoFixResult?.validationResult?.failure?.failureStage ||
            autoFixResult?.validationResult?.status ||
            'validation',
        reasonTheFixWasWrong: autoFixResult?.validationResult?.failure?.primaryError
            ? 'Validation failed after applying the generated fix; do not reuse this fix as a proven pattern.'
            : undefined,
        changedFailureSignature: normalizeFailureSignature(originalFailure) !==
            normalizeFailureSignature(validationFailure),
    };
}
function normalizeFailureSignature(message) {
    return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}
function shouldWriteSkillOutcome(autoFixResult) {
    const validationStatus = autoFixResult?.validationResult?.status || autoFixResult?.validationStatus;
    return (!!autoFixResult &&
        (validationStatus === 'passed' ||
            validationStatus === 'failed' ||
            validationStatus === 'inconclusive'));
}
//# sourceMappingURL=coordinator.js.map