import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ArtifactFetcher } from '../artifact-fetcher';
import { ActionInputs, AnalysisResult, ErrorData, FixRecommendation, Verdict } from '../types';
import { ApplyResult } from '../repair/fix-applier';
import { analyzeFailure } from '../simplified-analyzer';
import { processWorkflowLogs } from '../services/log-processor';
import { SkillStore } from '../services/skill-store';
import {
  resolveAutoFixTargetRepo,
  setSuccessOutput,
  setInconclusiveOutput,
  setErrorOutput,
} from './output';
import {
  generateFixRecommendation,
  iterativeFixValidateLoop,
  attemptAutoFix,
} from './validator';

export interface ClassificationResult {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  summary?: string;
  indicators?: string[];
  suggestedSourceLocations?: Array<{ file: string; lines: string; reason: string }>;
  responseId?: string;
  fixRecommendation?: FixRecommendation;
}

export interface RepairResult {
  fixRecommendation: FixRecommendation | null;
  autoFixResult: ApplyResult | null;
}

interface PipelineCoordinatorDeps {
  octokit: Octokit;
  openaiClient: OpenAIClient;
  artifactFetcher: ArtifactFetcher;
  inputs: ActionInputs;
  repoDetails: { owner: string; repo: string };
}

export class PipelineCoordinator {
  private octokit: Octokit;
  private openaiClient: OpenAIClient;
  private artifactFetcher: ArtifactFetcher;
  private inputs: ActionInputs;
  private repoDetails: { owner: string; repo: string };

  constructor(deps: PipelineCoordinatorDeps) {
    this.octokit = deps.octokit;
    this.openaiClient = deps.openaiClient;
    this.artifactFetcher = deps.artifactFetcher;
    this.inputs = deps.inputs;
    this.repoDetails = deps.repoDetails;
  }

  async classify(
    errorData: ErrorData,
    skillStore?: SkillStore
  ): Promise<ClassificationResult> {
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

    const result: AnalysisResult = skillContext
      ? await analyzeFailure(this.openaiClient, errorData, skillContext)
      : await analyzeFailure(this.openaiClient, errorData);

    if (result.confidence < this.inputs.confidenceThreshold) {
      core.warning(
        `Confidence ${result.confidence}% is below threshold ${this.inputs.confidenceThreshold}%`
      );
      setInconclusiveOutput(result, this.inputs, errorData);
      return { ...result, responseId: result.responseId };
    }

    if (result.verdict !== 'TEST_ISSUE') {
      setSuccessOutput(result, errorData, null, flakinessSignal);
      return { ...result, responseId: result.responseId };
    }

    core.setOutput('verdict', result.verdict);
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', result.reasoning);
    core.setOutput('summary', result.summary || '');

    return { ...result, responseId: result.responseId };
  }

  async repair(
    _classification: ClassificationResult,
    errorData: ErrorData,
    skillStore?: SkillStore
  ): Promise<RepairResult> {
    const autoFixTargetRepo = this.inputs.autoFixTargetRepo
      ? resolveAutoFixTargetRepo(this.inputs)
      : null;

    let fixRecommendation: FixRecommendation | null = null;
    let autoFixResult: ApplyResult | null = null;

    if (
      this.inputs.enableAutoFix &&
      this.inputs.enableValidation &&
      this.inputs.validationTestCommand &&
      autoFixTargetRepo
    ) {
      const loopResult = await iterativeFixValidateLoop(
        this.inputs,
        this.repoDetails,
        autoFixTargetRepo,
        errorData,
        this.openaiClient,
        this.octokit,
        skillStore,
        undefined
      );
      fixRecommendation = loopResult.fixRecommendation;
      autoFixResult = loopResult.autoFixResult;
    } else {
      const singleResult = await generateFixRecommendation(
        this.inputs,
        this.repoDetails,
        errorData,
        this.openaiClient,
        this.octokit,
        undefined,
        undefined,
        skillStore
      );
      fixRecommendation = singleResult?.fix ?? null;
      if (fixRecommendation && this.inputs.enableAutoFix && autoFixTargetRepo) {
        autoFixResult = await attemptAutoFix(
          this.inputs,
          fixRecommendation,
          this.octokit,
          autoFixTargetRepo,
          errorData
        );
      }
    }

    return { fixRecommendation, autoFixResult };
  }

  async execute(): Promise<void> {
    const errorData = await processWorkflowLogs(
      this.octokit,
      this.artifactFetcher,
      this.inputs,
      this.repoDetails
    );

    if (!errorData) {
      await this.handleNoErrorData();
      return;
    }

    const autoFixTargetRepo = this.inputs.autoFixTargetRepo
      ? resolveAutoFixTargetRepo(this.inputs)
      : null;

    let skillStore: SkillStore | undefined;
    if (autoFixTargetRepo) {
      skillStore = new SkillStore(this.octokit, autoFixTargetRepo.owner, autoFixTargetRepo.repo);
      await skillStore.load().catch((err) => {
        core.warning(`Skill store load failed (non-fatal): ${err}`);
      });
    }

    const classification = await this.classify(errorData, skillStore);

    if (classification.confidence < this.inputs.confidenceThreshold) return;
    if (classification.verdict !== 'TEST_ISSUE') return;

    const { fixRecommendation, autoFixResult } = await this.repair(
      classification,
      errorData,
      skillStore
    );

    const result: AnalysisResult = { ...classification };
    if (fixRecommendation) {
      result.fixRecommendation = fixRecommendation;
    }

    const flakinessSignal = skillStore
      ? skillStore.detectFlakiness(errorData.fileName || 'unknown')
      : undefined;

    setSuccessOutput(result, errorData, autoFixResult, flakinessSignal);
  }

  private async handleNoErrorData(): Promise<void> {
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
            const targetJob = jobs.data.jobs.find(
              (job) => job.name === this.inputs.jobName
            );

            if (!targetJob) {
              core.warning(
                `Job '${this.inputs.jobName}' not found yet while workflow is still in progress`
              );
            } else if (
              targetJob.status === 'completed' &&
              targetJob.conclusion !== 'failure'
            ) {
              core.info(
                `Job '${this.inputs.jobName}' completed with conclusion: ${targetJob.conclusion} — nothing to triage`
              );
              core.setOutput('verdict', 'NO_FAILURE');
              core.setOutput('confidence', '100');
              core.setOutput(
                'reasoning',
                `Job '${this.inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion}). No triage needed.`
              );
              core.setOutput(
                'summary',
                `No failure detected — job concluded with ${targetJob.conclusion}`
              );
              core.setOutput(
                'triage_json',
                JSON.stringify({
                  verdict: 'NO_FAILURE',
                  confidence: 100,
                  reasoning: `Job '${this.inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion}). No triage needed.`,
                  summary: `No failure detected — job concluded with ${targetJob.conclusion}`,
                  indicators: [],
                  metadata: {
                    analyzedAt: new Date().toISOString(),
                    jobConclusion: targetJob.conclusion,
                  },
                })
              );
              return;
            }
          } catch (jobCheckError) {
            core.debug(`Error checking job status: ${jobCheckError}`);
          }
        }

        core.warning(
          `Workflow run ${runId} is still in progress (status: ${workflowRun.data.status})`
        );
        const pendingTriageJson = {
          verdict: 'PENDING',
          confidence: 0,
          reasoning:
            'Workflow is still running. Please wait for it to complete before running triage analysis.',
          summary: 'Analysis pending - workflow not completed',
          indicators: [],
          metadata: {
            analyzedAt: new Date().toISOString(),
            workflowStatus: workflowRun.data.status,
          },
        };
        core.setOutput('verdict', 'PENDING');
        core.setOutput('confidence', '0');
        core.setOutput(
          'reasoning',
          'Workflow is still running. Please wait for it to complete before running triage analysis.'
        );
        core.setOutput(
          'summary',
          'Analysis pending - workflow not completed'
        );
        core.setOutput('triage_json', JSON.stringify(pendingTriageJson));
        return;
      }
    } catch (error) {
      core.debug(`Error checking workflow status: ${error}`);
    }

    setErrorOutput('No error data found to analyze');
  }
}
