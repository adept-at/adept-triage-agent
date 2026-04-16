import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ArtifactFetcher } from '../artifact-fetcher';
import { ActionInputs, AnalysisResult, ErrorData, FixRecommendation, Verdict } from '../types';
import { ApplyResult } from '../repair/fix-applier';
import { analyzeFailure } from '../simplified-analyzer';
import { processWorkflowLogs } from '../services/log-processor';
import { SkillStore, buildSkill, describeFixPattern } from '../services/skill-store';
import { inferRootCauseCategoryFromText } from '../repair/root-cause-category';
import { CHRONIC_FLAKINESS_THRESHOLD } from '../config/constants';
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
  investigationContext?: string;
  iterations: number;
  prUrl?: string;
  agentRootCause?: string;
  agentInvestigationFindings?: string;
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

    const result: AnalysisResult = classifierContext
      ? await analyzeFailure(this.openaiClient, errorData, classifierContext)
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

    const investigationContext = skillStore
      ? skillStore.formatForInvestigation({
          framework: errorData.framework || 'unknown',
          spec: errorData.fileName,
          errorMessage: errorData.message,
        })
      : '';

    let fixRecommendation: FixRecommendation | null = null;
    let autoFixResult: ApplyResult | null = null;
    let iterations = 0;
    let prUrl: string | undefined;
    let agentRootCause: string | undefined;
    let agentInvestigationFindings: string | undefined;

    // LOCAL validation path: clone + apply + test in-container, push/PR on pass.
    // Requires ENABLE_LOCAL_VALIDATION explicitly true. Without this gate, a
    // populated VALIDATION_TEST_COMMAND routes to the local path even when the
    // consumer wanted to dispatch remote validation — the pre-v1.45.0 bug.
    if (
      this.inputs.enableAutoFix &&
      this.inputs.enableValidation &&
      this.inputs.enableLocalValidation &&
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
        undefined,
        investigationContext
      );
      fixRecommendation = loopResult.fixRecommendation;
      autoFixResult = loopResult.autoFixResult;
      iterations = loopResult.iterations;
      prUrl = loopResult.prUrl;
      agentRootCause = loopResult.agentRootCause;
      agentInvestigationFindings = loopResult.agentInvestigationFindings;
    } else {
      const singleResult = await generateFixRecommendation(
        this.inputs,
        this.repoDetails,
        errorData,
        this.openaiClient,
        this.octokit,
        undefined,
        undefined,
        skillStore,
        investigationContext
      );
      fixRecommendation = singleResult?.fix ?? null;
      agentRootCause = singleResult?.agentRootCause;
      agentInvestigationFindings = singleResult?.agentInvestigationFindings;
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

    return { fixRecommendation, autoFixResult, investigationContext, iterations, prUrl, agentRootCause, agentInvestigationFindings };
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
      skillStore = new SkillStore(
        this.inputs.triageAwsRegion || 'us-east-1',
        this.inputs.triageDynamoTable || 'triage-skills-v1-live',
        autoFixTargetRepo.owner,
        autoFixTargetRepo.repo
      );
      // load() never rejects — it logs its own warnings on failure and
      // leaves the in-memory cache empty (loadSucceeded stays false).
      await skillStore.load();
    }

    const classification = await this.classify(errorData, skillStore);

    if (classification.confidence < this.inputs.confidenceThreshold) return;
    if (classification.verdict !== 'TEST_ISSUE') return;

    // Chronic flakiness gate: when a spec has been auto-fixed repeatedly in
    // the recent window, another auto-fix is likely stacking fallbacks rather
    // than addressing the underlying synchronization/product issue. Skip the
    // repair step and surface the classification for human investigation.
    const chronicFlakinessSignal = skillStore
      ? skillStore.detectFlakiness(errorData.fileName || 'unknown')
      : undefined;
    if (
      chronicFlakinessSignal?.isFlaky &&
      chronicFlakinessSignal.fixCount >= CHRONIC_FLAKINESS_THRESHOLD
    ) {
      const reason = `Chronic flakiness: ${chronicFlakinessSignal.message} Auto-fix skipped — likely needs human refactor (replace fixed pauses with deterministic waits, consolidate success surfaces) rather than another fallback.`;
      core.warning(`⏭️  ${reason}`);
      setSuccessOutput(
        {
          ...classification,
          autoFixSkipped: true,
          autoFixSkippedReason: reason,
        },
        errorData,
        null,
        chronicFlakinessSignal
      );
      return;
    }

    const { fixRecommendation, autoFixResult, iterations, prUrl: skillPrUrl, agentRootCause, agentInvestigationFindings } = await this.repair(
      classification,
      errorData,
      skillStore
    );

    if (skillStore && autoFixTargetRepo && errorData) {
      const fixSucceeded = !!(autoFixResult?.success && autoFixResult.validationStatus === 'passed');
      const fixAttempted = !!fixRecommendation;

      if (fixAttempted) {
        const firstChange = fixRecommendation!.proposedChanges?.[0];
        const rootCause = agentRootCause || inferRootCauseCategory(fixRecommendation!);
        const currentFindings = agentInvestigationFindings || '';

        const skill = buildSkill({
          repo: `${autoFixTargetRepo.owner}/${autoFixTargetRepo.repo}`,
          spec: errorData.fileName || 'unknown',
          testName: errorData.testName || 'unknown',
          framework: errorData.framework || 'unknown',
          errorMessage: errorData.message,
          rootCauseCategory: rootCause,
          fix: {
            file: firstChange?.file || 'unknown',
            changeType: rootCause,
            summary: fixRecommendation!.summary,
            pattern: describeFixPattern(fixRecommendation!.proposedChanges || []),
          },
          confidence: fixRecommendation!.confidence,
          iterations,
          prUrl: skillPrUrl || '',
          validatedLocally: fixSucceeded,
          priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
          investigationFindings: currentFindings,
          rootCauseChain: `${rootCause} → ${fixRecommendation!.summary?.slice(0, 80)}`,
        });

        const saveSucceeded = await skillStore.save(skill).catch((err) => {
          core.warning(`Failed to save skill: ${err}`);
          return false;
        });

        // Skip outcome writes when save failed — the skill is not in the
        // in-memory cache, so recordOutcome / recordClassificationOutcome
        // would hit the "skill not found" warning path and emit misleading
        // logs. Counters will be recorded on the next run after a fresh load.
        // recordOutcome / recordClassificationOutcome never reject — they
        // log their own warnings on failure — so no .catch is needed here.
        if (saveSucceeded) {
          if (fixSucceeded) {
            await skillStore.recordOutcome(skill.id, true);
            await skillStore.recordClassificationOutcome(skill.id, 'correct');
            core.info(`📝 Saved validated skill ${skill.id}`);
          } else {
            await skillStore.recordOutcome(skill.id, false);
            core.info(`📝 Saved failed skill trajectory ${skill.id}`);
          }
        }
      }
    }

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

function inferRootCauseCategory(fix: FixRecommendation): string {
  return inferRootCauseCategoryFromText(
    [
      fix.summary,
      fix.reasoning,
      ...(fix.evidence || []),
      ...(fix.proposedChanges?.map((c) => c.justification) || []),
    ]
      .filter(Boolean)
      .join(' ')
  );
}
