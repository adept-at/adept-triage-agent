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
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const simplified_analyzer_1 = require("../simplified-analyzer");
const log_processor_1 = require("../services/log-processor");
const skill_store_1 = require("../services/skill-store");
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
        const skillContext = skillStore
            ? skillStore.formatForClassifier({
                framework: errorData.framework || 'unknown',
                spec: errorData.fileName,
                errorMessage: errorData.message,
            })
            : '';
        const result = skillContext
            ? await (0, simplified_analyzer_1.analyzeFailure)(this.openaiClient, errorData, skillContext)
            : await (0, simplified_analyzer_1.analyzeFailure)(this.openaiClient, errorData);
        if (result.confidence < this.inputs.confidenceThreshold) {
            core.warning(`Confidence ${result.confidence}% is below threshold ${this.inputs.confidenceThreshold}%`);
            (0, output_1.setInconclusiveOutput)(result, this.inputs, errorData);
            return { ...result, responseId: result.responseId };
        }
        if (result.verdict !== 'TEST_ISSUE') {
            (0, output_1.setSuccessOutput)(result, errorData, null, flakinessSignal);
            return { ...result, responseId: result.responseId };
        }
        core.setOutput('verdict', result.verdict);
        core.setOutput('confidence', result.confidence.toString());
        core.setOutput('reasoning', result.reasoning);
        core.setOutput('summary', result.summary || '');
        return { ...result, responseId: result.responseId };
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
        let fixRecommendation = null;
        let autoFixResult = null;
        let savedSkillId;
        if (this.inputs.enableAutoFix &&
            this.inputs.enableValidation &&
            this.inputs.validationTestCommand &&
            autoFixTargetRepo) {
            const loopResult = await (0, validator_1.iterativeFixValidateLoop)(this.inputs, this.repoDetails, autoFixTargetRepo, errorData, this.openaiClient, this.octokit, skillStore, undefined, investigationContext);
            fixRecommendation = loopResult.fixRecommendation;
            autoFixResult = loopResult.autoFixResult;
            savedSkillId = loopResult.savedSkillId;
        }
        else {
            const singleResult = await (0, validator_1.generateFixRecommendation)(this.inputs, this.repoDetails, errorData, this.openaiClient, this.octokit, undefined, undefined, skillStore, investigationContext);
            fixRecommendation = singleResult?.fix ?? null;
            if (fixRecommendation && this.inputs.enableAutoFix && autoFixTargetRepo) {
                autoFixResult = await (0, validator_1.attemptAutoFix)(this.inputs, fixRecommendation, this.octokit, autoFixTargetRepo, errorData);
            }
        }
        return { fixRecommendation, autoFixResult, savedSkillId };
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
            if (this.inputs.triageAwsAccessKeyId && this.inputs.triageAwsSecretAccessKey) {
                const { DynamoSkillStore } = await import('../services/dynamo-skill-store.js');
                skillStore = new DynamoSkillStore(this.inputs.triageAwsRegion || 'us-east-1', this.inputs.triageDynamoTable || 'triage-skills-v1-live', autoFixTargetRepo.owner, autoFixTargetRepo.repo, this.inputs.triageAwsAccessKeyId, this.inputs.triageAwsSecretAccessKey);
            }
            else {
                skillStore = new skill_store_1.SkillStore(this.octokit, autoFixTargetRepo.owner, autoFixTargetRepo.repo);
            }
            await skillStore.load().catch((err) => {
                core.warning(`Skill store load failed (non-fatal): ${err}`);
            });
        }
        const classification = await this.classify(errorData, skillStore);
        if (classification.confidence < this.inputs.confidenceThreshold)
            return;
        if (classification.verdict !== 'TEST_ISSUE')
            return;
        const { fixRecommendation, autoFixResult, savedSkillId } = await this.repair(classification, errorData, skillStore);
        if (autoFixResult?.success && savedSkillId && skillStore) {
            await skillStore.recordClassificationOutcome(savedSkillId, 'correct').catch((err) => {
                core.warning(`Failed to record classification outcome: ${err}`);
            });
        }
        const result = { ...classification };
        if (fixRecommendation) {
            result.fixRecommendation = fixRecommendation;
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
//# sourceMappingURL=coordinator.js.map