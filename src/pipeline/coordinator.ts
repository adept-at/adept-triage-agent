import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ArtifactFetcher } from '../artifact-fetcher';
import {
  ActionInputs,
  AnalysisResult,
  ErrorData,
  FailedFixEvidence,
  FixRecommendation,
  RepairTelemetry,
  Verdict,
} from '../types';
import { ApplyResult } from '../repair/fix-applier';
import { analyzeFailure } from '../simplified-analyzer';
import { processWorkflowLogs } from '../services/log-processor';
import { SkillStore, buildSkill, describeFixPattern } from '../services/skill-store';
import { RepoContextFetcher } from '../services/repo-context-fetcher';
import { inferRootCauseCategoryFromText } from '../repair/root-cause-category';
import { CHRONIC_FLAKINESS_THRESHOLD } from '../config/constants';
import { recordGate, logRunGateSummary } from './run-telemetry';
import {
  resolveAutoFixTargetRepo,
  setSuccessOutput,
  setInconclusiveOutput,
  setErrorOutput,
  finalizeRepairTelemetry,
  emitRepairOutputs,
  NOT_STARTED_REPAIR,
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
  /**
   * IDs of the skills that were surfaced to the classifier on this run
   * (the ones rendered into the classifier prompt via
   * `formatSkillsForClassifierContext`).
   *
   * Populated but currently UNUSED by any downstream consumer in
   * v1.50.0. The A1-writer that would have flipped
   * `classificationOutcome='incorrect'` on these IDs was deferred to
   * v1.50.1 pending a review finding: the baseline-pass signal this
   * writer would key on conflates transient flake with genuine
   * classifier misread, and needs a multi-pass baseline + compensating
   * 'correct' writer before the signal becomes semantically honest.
   * See the v1.50.0 review transcript and the deferred-A1 items in
   * the triage-agent-code-review SKILL.md for the design work still
   * owed.
   *
   * Kept populated (rather than removed) because:
   *   1. `findForClassifier` runs anyway to feed the classifier prompt,
   *      so capturing the IDs is free.
   *   2. When A1 re-lands in v1.50.1, the plumbing from `classify()`
   *      into `ClassificationResult` won't need to be re-built — only
   *      the consumer in `iterativeFixValidateLoop` will.
   */
  classifierSkillIds?: string[];
}

export interface RepairResult {
  fixRecommendation: FixRecommendation | null;
  autoFixResult: ApplyResult | null;
  investigationContext?: string;
  iterations: number;
  prUrl?: string;
  agentRootCause?: string;
  agentInvestigationFindings?: string;
  /**
   * Set when a policy gate (blast-radius scaling, etc.) intentionally held
   * back an auto-fix that would otherwise have been applied. Surfaced on
   * the run output (`auto_fix_skipped` / `auto_fix_skipped_reason`) so
   * downstream Slack / dashboards can tell safety-withheld fixes apart from
   * "no fix possible". Chronic-flakiness skips are set at execute() time
   * and don't pass through this struct.
   */
  autoFixSkipped?: boolean;
  autoFixSkippedReason?: string;
  repairTelemetry?: RepairTelemetry;
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
    } else if (flakinessSignal && flakinessSignal.fixCount >= 2) {
      // Pre-chronic warning level: 2 prior fix attempts in the long window.
      // The chronic-flakiness gate trips at `CHRONIC_FLAKINESS_THRESHOLD`
      // (3); emit a softer signal one step earlier so operators can spot
      // a spec trending toward chronic instability without the gate
      // already blocking auto-fix. Visible as a `core.warning` so it
      // surfaces in the Action's annotations and in Slack.
      core.warning(
        `⚠️ FLAKINESS WATCH: This spec has ${flakinessSignal.fixCount} prior auto-fix attempts in ${flakinessSignal.windowDays} days — one more failure will trip the chronic-flakiness gate (threshold ${CHRONIC_FLAKINESS_THRESHOLD}).`
      );
      recordGate('flakinessWatchEmits');
    }

    // v1.50.0 A1-writer: split `findForClassifier` from the prompt
    // renderer so we can capture the exact list of skill IDs that were
    // surfaced to the classifier. If the baseline check later proves
    // the classifier wrong (test passes without fix), these are the
    // IDs that get `recordClassificationOutcome('incorrect')` against
    // them. Single `findForClassifier` call — no duplicate work.
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

    const result: AnalysisResult = classifierContext
      ? await analyzeFailure(this.openaiClient, errorData, classifierContext)
      : await analyzeFailure(this.openaiClient, errorData);

    if (result.confidence < this.inputs.confidenceThreshold) {
      core.warning(
        `Confidence ${result.confidence}% is below threshold ${this.inputs.confidenceThreshold}%`
      );
      setInconclusiveOutput(result, this.inputs, errorData);
      return { ...result, responseId: result.responseId, classifierSkillIds };
    }

    if (result.verdict !== 'TEST_ISSUE') {
      setSuccessOutput(result, errorData, null, flakinessSignal);
      return { ...result, responseId: result.responseId, classifierSkillIds };
    }

    core.setOutput('verdict', result.verdict);
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', result.reasoning);
    core.setOutput('summary', result.summary || '');

    return { ...result, responseId: result.responseId, classifierSkillIds };
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

    // Fetch the optional `.adept-triage/context.md` once per run, from
    // the repo whose tests we're fixing. Falls back to the test-source
    // repo when no autoFixTargetRepo is configured. Empty string for
    // 404 / missing file — the common case until repos opt in.
    const contextOwner = autoFixTargetRepo?.owner ?? this.repoDetails.owner;
    const contextRepo = autoFixTargetRepo?.repo ?? this.repoDetails.repo;
    const contextRef =
      this.inputs.branch || this.inputs.autoFixBaseBranch || 'main';
    const repoContextFetcher = new RepoContextFetcher(this.octokit);
    const repoContext = await repoContextFetcher.fetch(
      contextOwner,
      contextRepo,
      contextRef
    );

    let fixRecommendation: FixRecommendation | null = null;
    let autoFixResult: ApplyResult | null = null;
    let iterations = 0;
    let prUrl: string | undefined;
    let agentRootCause: string | undefined;
    let agentInvestigationFindings: string | undefined;
    let autoFixSkipped: boolean | undefined;
    let autoFixSkippedReason: string | undefined;
    let repairTelemetry: RepairTelemetry | undefined;

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
        investigationContext,
        repoContext
      );
      fixRecommendation = loopResult.fixRecommendation;
      autoFixResult = loopResult.autoFixResult;
      iterations = loopResult.iterations;
      prUrl = loopResult.prUrl;
      agentRootCause = loopResult.agentRootCause;
      agentInvestigationFindings = loopResult.agentInvestigationFindings;
      autoFixSkipped = loopResult.autoFixSkipped;
      autoFixSkippedReason = loopResult.autoFixSkippedReason;
      repairTelemetry = loopResult.repairTelemetry;
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
        investigationContext,
        repoContext
      );
      fixRecommendation = singleResult.fix ?? null;
      agentRootCause = singleResult.agentRootCause;
      agentInvestigationFindings = singleResult.agentInvestigationFindings;
      repairTelemetry = singleResult.repairTelemetry;
      if (fixRecommendation && this.inputs.enableAutoFix && autoFixTargetRepo) {
        const outcome = await attemptAutoFix(
          this.inputs,
          fixRecommendation,
          this.octokit,
          autoFixTargetRepo,
          errorData,
          skillStore
        );
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
      repairTelemetry,
    };
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
      // leaves the in-memory cache empty when DynamoDB is unreachable.
      await skillStore.load();
    }

    // v1.50.0 CP3 (D): single-line per-run summary of learning-loop
    // activity must fire at EVERY exit point after skillStore was
    // created (inconclusive / non-TEST_ISSUE / chronic-flakiness-skip
    // / success). try/finally guarantees one summary line per run
    // even if repair() throws. No-op when skillStore is absent.
    try {
      await this.runClassifyAndRepair(errorData, skillStore, autoFixTargetRepo);
    } finally {
      skillStore?.logRunSummary();
      // Always emit the gate-telemetry summary, even when no skill
      // store is configured. The whole point of the per-run gate
      // counters is "did our safety/correctness gates fire this
      // round?" — that question is independent of skill-store state.
      logRunGateSummary();
    }
  }

  /**
   * Inner body of `execute()` wrapped in a try/finally by the caller
   * so `logRunSummary()` fires at every exit point (early return +
   * happy path + thrown). Private because the contract mirrors
   * `execute()`'s (void).
   */
  private async runClassifyAndRepair(
    errorData: ErrorData,
    skillStore: SkillStore | undefined,
    autoFixTargetRepo: { owner: string; repo: string } | null
  ): Promise<void> {
    // Infrastructure fast-path: when the failure is unambiguously a
    // remote-WebDriver / Sauce session-creation timeout, skip the LLM
    // classifier and emit INCONCLUSIVE directly. Saves an LLM round-trip
    // (~30s + tokens) on a class of failures the classifier already
    // resolves to INCONCLUSIVE 95% of the time (see audit run
    // `25823303735`). Match is intentionally narrow — only the literal
    // signatures we've seen produce these classifications. Anything else
    // continues through the normal classify path.
    const infraVerdict = detectInfrastructureFailure(errorData);
    if (infraVerdict) {
      core.info(`⏭️  Infrastructure fast-path: ${infraVerdict.summary}`);
      recordGate('infraFastPathHits');
      const infraResult: AnalysisResult = {
        verdict: 'INCONCLUSIVE',
        confidence: 95,
        reasoning: infraVerdict.reasoning,
        summary: infraVerdict.summary,
        indicators: infraVerdict.indicators,
      };
      setInconclusiveOutput(infraResult, this.inputs, errorData);
      return;
    }

    const classification = await this.classify(errorData, skillStore);

    if (classification.confidence < this.inputs.confidenceThreshold) return;
    if (classification.verdict !== 'TEST_ISSUE') return;

    // Non-fixable gate: when a curated seed for this spec is flagged
    // nonFixable: true AND its error pattern is sufficiently similar to
    // the current failure, repair has no chance of passing validation
    // because the remediation is external (exhausted single-use test
    // data, admin reset, credential rotation). Skip repair and surface
    // the seed's manual-intervention guidance instead of burning a
    // 3-iteration fix-validate loop and shipping a doomed PR.
    //
    // Runs BEFORE chronic flakiness because non-fixable is a stronger
    // signal: chronic flakiness says "we've tried fixing this 3+ times
    // and it keeps coming back"; non-fixable says "we already know
    // from the start that no code fix applies." Either gate skipping
    // is fine for skill-store outcomes (no fix is generated, no skill
    // outcome to record).
    const nonFixableMatch = skillStore?.findNonFixableMatch({
      framework: errorData.framework || 'unknown',
      spec: errorData.fileName || 'unknown',
      errorMessage: errorData.message,
    });
    if (nonFixableMatch) {
      const reason =
        `Non-fixable failure pattern matched (seed ${nonFixableMatch.id.slice(0, 8)}): ` +
        `${nonFixableMatch.fix.summary} ` +
        `Manual intervention required — no code change in this repo can fix this failure.`;
      core.warning(`⏭️  ${reason}`);
      recordGate('nonFixableSeedSkips');
      setSuccessOutput(
        {
          ...classification,
          autoFixSkipped: true,
          autoFixSkippedReason: reason,
          repairTelemetry: {
            status: 'skipped',
            summary: reason,
            iterations: 0,
            elapsedMs: 0,
          },
        },
        errorData,
        null
      );
      return;
    }

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
          repairTelemetry: {
            status: 'skipped',
            summary: reason,
            iterations: 0,
            elapsedMs: 0,
          },
        },
        errorData,
        null,
        chronicFlakinessSignal
      );
      return;
    }

    const {
      fixRecommendation,
      autoFixResult,
      iterations,
      prUrl: skillPrUrl,
      agentRootCause,
      agentInvestigationFindings,
      autoFixSkipped: repairAutoFixSkipped,
      autoFixSkippedReason: repairAutoFixSkippedReason,
      repairTelemetry: repairTelemetryFromRun,
    } = await this.repair(classification, errorData, skillStore);

    if (skillStore && autoFixTargetRepo && errorData) {
      const validationStatus =
        autoFixResult?.validationResult?.status || autoFixResult?.validationStatus;
      // Phase 0: split validation truth from publish truth. Pre-Phase-0 the
      // single `fixSucceeded` flag was AND-ed with `autoFixResult.success`,
      // so a passing local test followed by a push/PR failure was recorded
      // as `validatedLocally: false` and `recordOutcome(skill, false)`,
      // poisoning the skill store on every push failure. The fix here is to
      // make validation the authoritative signal for skill correctness.
      const validationPassed = validationStatus === 'passed';
      const publishSucceeded = !!autoFixResult?.success;
      const fixAttempted = !!fixRecommendation;
      const shouldSaveSkill = shouldWriteSkillOutcome(autoFixResult);
      const validationPending = validationStatus === 'pending';

      if (fixAttempted && validationPending) {
        core.info(
          '📝 Skipping skill outcome write while remote validation is pending'
        );
        recordGate('skillWriteSkips');
      }

      if (fixAttempted && !shouldSaveSkill && !validationPending) {
        core.info(
          '📝 Skipping skill outcome write because no validation attempt produced a terminal result'
        );
        recordGate('skillWriteSkips');
      }

      if (fixAttempted && shouldSaveSkill) {
        const firstChange = fixRecommendation!.proposedChanges?.[0];
        const rootCause = agentRootCause || inferRootCauseCategory(fixRecommendation!);
        const currentFindings = agentInvestigationFindings || '';
        const failedFixEvidence = validationPassed
          ? undefined
          : buildFailedFixEvidence(errorData, autoFixResult);

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
          // skillPrUrl is only set in `iterativeFixValidateLoop` when
          // `pushAndCreatePR` succeeded, so falling back to '' here is correct
          // both for "no publish attempt" and "publish failed after pass".
          prUrl: skillPrUrl || '',
          validatedLocally: validationPassed,
          priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
          investigationFindings: currentFindings,
          rootCauseChain: `${rootCause} → ${fixRecommendation!.summary?.slice(0, 80)}`,
          // R3: persist the causal trace so future runs against the same
          // spec can see how the prior successful fix reasoned about the
          // failure (originalState → rootMechanism → newStateAfterFix →
          // whyAssertionPassesNow). Undefined on skills from pre-v1.49.1
          // or from an older run before trace persistence existed — both are fine.
          failureModeTrace: fixRecommendation!.failureModeTrace,
          failedFixEvidence,
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
          if (validationPassed) {
            await skillStore.recordOutcome(skill.id, true);
            await skillStore.recordClassificationOutcome(skill.id, 'correct');
            core.info(`📝 Saved validated skill ${skill.id}`);
          } else {
            await skillStore.recordOutcome(skill.id, false);
            core.info(`📝 Saved failed skill trajectory ${skill.id}`);
          }
          core.info(
            `📊 learning-telemetry verdict=${classification.verdict} ` +
              `savedSkillId=${skill.id} validationPassed=${validationPassed} ` +
              `publishSucceeded=${publishSucceeded} iterations=${iterations}`
          );
        }
      }
    }

    const result: AnalysisResult = { ...classification };
    if (fixRecommendation) {
      result.fixRecommendation = fixRecommendation;
    }
    if (repairAutoFixSkipped) {
      result.autoFixSkipped = true;
      if (repairAutoFixSkippedReason) {
        result.autoFixSkippedReason = repairAutoFixSkippedReason;
      }
    }

    result.repairTelemetry = finalizeRepairTelemetry(
      repairTelemetryFromRun,
      fixRecommendation,
      autoFixResult
    );

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
                  repair: NOT_STARTED_REPAIR,
                  metadata: {
                    analyzedAt: new Date().toISOString(),
                    jobConclusion: targetJob.conclusion,
                  },
                })
              );
              emitRepairOutputs(NOT_STARTED_REPAIR);
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
          repair: NOT_STARTED_REPAIR,
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
        emitRepairOutputs(NOT_STARTED_REPAIR);
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

function buildFailedFixEvidence(
  errorData: ErrorData,
  autoFixResult: ApplyResult | null
): FailedFixEvidence {
  const validationFailure =
    autoFixResult?.validationResult?.failure?.primaryError ||
    autoFixResult?.error ||
    'Fix did not produce a validated passing result';
  const originalFailure = errorData.message || 'unknown original failure';

  return {
    fixCommit: autoFixResult?.commitSha,
    validationRunId: autoFixResult?.validationResult?.runId || autoFixResult?.validationRunId,
    originalFailureSignature: normalizeFailureSignature(originalFailure),
    validationFailureSignature: normalizeFailureSignature(validationFailure),
    failedAssertion: autoFixResult?.validationResult?.failure?.failedAssertion,
    failureStage:
      autoFixResult?.validationResult?.failure?.failureStage ||
      autoFixResult?.validationResult?.status ||
      'validation',
    reasonTheFixWasWrong: autoFixResult?.validationResult?.failure?.primaryError
      ? 'Validation failed after applying the generated fix; do not reuse this fix as a proven pattern.'
      : undefined,
    changedFailureSignature:
      normalizeFailureSignature(originalFailure) !==
      normalizeFailureSignature(validationFailure),
  };
}

function normalizeFailureSignature(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function shouldWriteSkillOutcome(
  autoFixResult: ApplyResult | null | undefined
): boolean {
  const validationStatus =
    autoFixResult?.validationResult?.status || autoFixResult?.validationStatus;
  return (
    !!autoFixResult &&
    (validationStatus === 'passed' ||
      validationStatus === 'failed' ||
      validationStatus === 'inconclusive')
  );
}

/**
 * Recognize unambiguous infrastructure failures (remote-WebDriver session
 * creation timeouts, Sauce provisioning errors) so the coordinator can
 * short-circuit to INCONCLUSIVE without spending an LLM classification
 * round-trip. Returns a pre-built classification payload, or `null` to
 * indicate "this is not an infra failure — fall through to LLM classify."
 *
 * Match is intentionally narrow:
 *   - `Failed to create a session` (WebdriverIO startup error)
 *   - `ondemand.*saucelabs.com.*session` POST timeout (the Sauce endpoint)
 *   - `startWebDriverSession`/`Runner._initSession` stack frames combined
 *     with a timeout/abort phrase
 *
 * The triage agent has zero leverage on these — no test code ran, no
 * product code ran, no fix is applicable. Skipping the LLM saves ~30s
 * per occurrence and removes a class of skill-store noise.
 */
export function detectInfrastructureFailure(errorData: ErrorData): {
  reasoning: string;
  summary: string;
  indicators: string[];
} | null {
  const haystack = `${errorData.message || ''}\n${errorData.stackTrace || ''}`;
  if (!haystack.trim()) return null;

  const sessionCreationFailed = /Failed to create a session/i.test(haystack);
  const saucePostTimeout =
    /ondemand[^\s]*saucelabs\.com[^\s]*\/session/i.test(haystack) &&
    /(timeout|aborted|operation was aborted)/i.test(haystack);
  const wdioStartupStack =
    /startWebDriverSession|_(start|init)Session/i.test(haystack) &&
    /(timeout|aborted)/i.test(haystack);

  if (!sessionCreationFailed && !saucePostTimeout && !wdioStartupStack) {
    return null;
  }

  const indicators: string[] = [];
  if (sessionCreationFailed) {
    indicators.push('Framework failure at session creation: `Failed to create a session`');
  }
  if (saucePostTimeout) {
    indicators.push(
      'Direct timeout against Sauce Labs WebDriver endpoint (POST /session)'
    );
  }
  if (wdioStartupStack) {
    indicators.push(
      'Stack trace is in WebDriver/WebdriverIO startup, not test code or product code'
    );
  }
  indicators.push(
    'No browser session was created — no application code ran',
    'Best treated as a remote WebDriver provider or network/session provisioning failure'
  );

  return {
    summary:
      'Inconclusive: failure occurred during remote-WebDriver session creation, before any test or application code ran. Likely a Sauce Labs / network provisioning issue — retry or investigate at the infrastructure level.',
    reasoning:
      'The causal failure is not an application assertion, selector timeout, or product error. The remote WebDriver session could not be created (Sauce Labs / WebDriver startup), so no test code or browser interaction occurred and no fix is applicable. This is an infrastructure-layer failure — escalate to the test runner / Sauce Labs / network team rather than the test or product teams.',
    indicators,
  };
}
