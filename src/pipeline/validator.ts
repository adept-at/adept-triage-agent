import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ActionInputs, ErrorData, FixRecommendation } from '../types';
import { buildRepairContext } from '../repair-context';
import { SimplifiedRepairAgent } from '../repair/simplified-repair-agent';
import { createFixApplier, ApplyResult, generateFixBranchName } from '../repair/fix-applier';
import { LocalFixValidator } from '../services/local-fix-validator';
import { AUTO_FIX, BLAST_RADIUS, FIX_VALIDATE_LOOP, DEFAULT_PRODUCT_URL } from '../config/constants';
import { SkillStore } from '../services/skill-store';
import { parseRepoString } from '../utils/repo-utils';

export async function generateFixRecommendation(
  inputs: ActionInputs,
  repoDetails: { owner: string; repo: string },
  errorData: { message: string; testName?: string; fileName?: string },
  openaiClient: OpenAIClient,
  octokit: Octokit,
  previousAttempt?: {
    iteration: number;
    previousFix: FixRecommendation;
    validationLogs: string;
    /** Agent-reported root cause from the prior failed iteration (see repair-agent). */
    priorAgentRootCause?: string;
    /** Agent-reported investigation findings from the prior failed iteration. */
    priorAgentInvestigationFindings?: string;
  },
  previousResponseId?: string,
  skillStore?: SkillStore,
  priorInvestigationContext?: string,
  /**
   * Pre-rendered repo conventions block from `.adept-triage/context.md`
   * in the consumer repo (fetched once per run by the coordinator).
   * Threaded through to every agent's system prompt so analysis,
   * investigation, fix-gen, and review share the same baseline view
   * of the repo. Empty for repos that haven't opted in.
   */
  repoContext?: string
): Promise<{ fix: FixRecommendation; lastResponseId?: string; agentRootCause?: string; agentInvestigationFindings?: string } | null> {
  try {
    const iterLabel = previousAttempt
      ? ` (iteration ${previousAttempt.iteration + 1})`
      : '';
    core.info(`\n🔧 Attempting to generate fix recommendation${iterLabel}...`);

    const repairContext = buildRepairContext({
      testFile: errorData.fileName || 'unknown',
      testName: errorData.testName || 'unknown',
      errorMessage: errorData.message,
      workflowRunId: inputs.workflowRunId || github.context.runId.toString(),
      jobName: inputs.jobName || 'unknown',
      commitSha: inputs.commitSha || github.context.sha,
      branch:
        inputs.branch || github.context.ref.replace('refs/heads/', ''),
      repository:
        inputs.repository || `${repoDetails.owner}/${repoDetails.repo}`,
      prNumber: inputs.prNumber,
      targetAppPrNumber: inputs.prNumber,
    });

    const autoFixTargetRepo = parseRepoString(inputs.autoFixTargetRepo, 'AUTO_FIX_TARGET_REPO');

    const repairAgent = new SimplifiedRepairAgent(
      openaiClient,
      {
        octokit,
        owner: autoFixTargetRepo.owner,
        repo: autoFixTargetRepo.repo,
        branch: inputs.branch || inputs.autoFixBaseBranch || 'main',
      },
      {
        modelOverrideFixGen: inputs.modelOverrideFixGen,
        modelOverrideReview: inputs.modelOverrideReview,
      }
    );
    const skills = skillStore
      ? {
          relevant: skillStore.findRelevant({
            framework: (errorData as ErrorData).framework || 'unknown',
            spec: errorData.fileName,
            errorMessage: errorData.message,
          }),
          flakiness: skillStore.detectFlakiness(errorData.fileName || 'unknown'),
        }
      : undefined;

    const result = await repairAgent.generateFixRecommendation(
      repairContext,
      errorData as ErrorData,
      previousAttempt,
      previousResponseId,
      skills,
      priorInvestigationContext,
      repoContext
    );

    if (result) {
      core.info(
        `✅ Fix recommendation generated with ${result.fix.confidence}% confidence`
      );
    } else {
      core.info('❌ Could not generate fix recommendation');
    }
    return result;
  } catch (error) {
    core.warning(`Failed to generate fix recommendation: ${error}`);
    return null;
  }
}

/**
 * Local fix-validate loop.
 * Clones the test repo, applies fixes locally, runs the test command,
 * and iterates up to MAX_ITERATIONS times. Only pushes + creates a PR
 * when the test passes.
 */
export async function iterativeFixValidateLoop(
  inputs: ActionInputs,
  repoDetails: { owner: string; repo: string },
  autoFixTargetRepo: { owner: string; repo: string },
  errorData: { message: string; testName?: string; fileName?: string; framework?: string },
  openaiClient: OpenAIClient,
  octokit: Octokit,
  skillStore?: SkillStore,
  _classificationResponseId?: string,
  investigationContext?: string,
  /** See `generateFixRecommendation.repoContext` */
  repoContext?: string
): Promise<{
  fixRecommendation: FixRecommendation | null;
  autoFixResult: ApplyResult | null;
  iterations: number;
  prUrl?: string;
  agentRootCause?: string;
  agentInvestigationFindings?: string;
  /**
   * Set when a policy gate (blast-radius scaling, etc.) intentionally held
   * back an auto-fix that would otherwise have been applied. Coordinator
   * forwards these to the run output so downstream consumers can tell
   * "fix was withheld for safety" apart from "no fix possible".
   */
  autoFixSkipped?: boolean;
  autoFixSkippedReason?: string;
}> {
  const maxIterations = FIX_VALIDATE_LOOP.MAX_ITERATIONS;
  let fixRecommendation: FixRecommendation | null = null;
  let autoFixResult: ApplyResult | null = null;
  let completedIterations = 0;
  let agentRootCause: string | undefined;
  let agentInvestigationFindings: string | undefined;
  let autoFixSkipped = false;
  let autoFixSkippedReason: string | undefined;
  let previousAttempt:
    | {
        iteration: number;
        previousFix: FixRecommendation;
        validationLogs: string;
        priorAgentRootCause?: string;
        priorAgentInvestigationFindings?: string;
      }
    | undefined;
  const failedFixFingerprints = new Set<string>();
  const minConfidence = inputs.autoFixMinConfidence ?? AUTO_FIX.DEFAULT_MIN_CONFIDENCE;
  const baseBranch = inputs.branch || inputs.autoFixBaseBranch || 'main';

  const validator = new LocalFixValidator(
    {
      owner: autoFixTargetRepo.owner,
      repo: autoFixTargetRepo.repo,
      branch: baseBranch,
      githubToken: inputs.githubToken,
      npmToken: inputs.npmToken,
      testCommand: inputs.validationTestCommand!,
      spec: inputs.validationSpec || errorData.fileName,
      previewUrl: inputs.validationPreviewUrl || DEFAULT_PRODUCT_URL,
      testTimeoutMs: FIX_VALIDATE_LOOP.TEST_TIMEOUT_MS,
    },
    octokit
  );

  let validatorReady = false;

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      completedIterations = iteration + 1;
      core.info(
        `\n${'='.repeat(60)}\n🔄 Fix-Validate iteration ${iteration + 1}/${maxIterations}\n${'='.repeat(60)}`
      );

      const fixResult = await generateFixRecommendation(
        inputs,
        repoDetails,
        errorData,
        openaiClient,
        octokit,
        previousAttempt,
        undefined,
        skillStore,
        investigationContext,
        repoContext
      );

      if (!fixResult) {
        fixRecommendation = null;
        core.warning(`Iteration ${iteration + 1}: could not generate fix recommendation`);
        break;
      }

      fixRecommendation = fixResult.fix;
      if (fixResult.agentRootCause) agentRootCause = fixResult.agentRootCause;
      if (fixResult.agentInvestigationFindings) agentInvestigationFindings = fixResult.agentInvestigationFindings;

      if (!fixRecommendation.proposedChanges?.length) {
        core.info(`Iteration ${iteration + 1}: fix rejected — no changes proposed`);
        break;
      }

      const { required: iterRequired, reasons: iterReasons } = requiredConfidence(
        fixRecommendation,
        minConfidence
      );
      if (fixRecommendation.confidence < iterRequired) {
        const suffix = iterReasons.length
          ? ` (blast-radius scaling: ${iterReasons.join('; ')})`
          : '';
        const reason = `Blast-radius gate: confidence ${fixRecommendation.confidence}% < required ${iterRequired}%${suffix}`;
        core.info(
          `Iteration ${iteration + 1}: fix rejected — ${reason}`
        );
        // Only record the skip when the threshold was actually raised by
        // blast-radius scaling. When it's just the base threshold, there
        // is no "policy held this back" story to surface — the model
        // simply didn't reach the user-configured bar.
        if (iterReasons.length > 0) {
          autoFixSkipped = true;
          autoFixSkippedReason = reason;
        }
        break;
      }

      const fingerprint = fixFingerprint(fixRecommendation);
      if (failedFixFingerprints.has(fingerprint)) {
        core.warning(
          `Iteration ${iteration + 1}: fix identical to a previous failed attempt. Stopping.`
        );
        break;
      }

      core.info(
        `Iteration ${iteration + 1}: fix passed quality gates (confidence: ${fixRecommendation.confidence}%, changes: ${fixRecommendation.proposedChanges.length})`
      );

      if (!validatorReady) {
        await validator.setup();
        validatorReady = true;

        const baseline = await validator.baselineCheck();
        if (baseline.passed) {
          core.info('✅ Baseline check passed — test passes without fix. Failure was likely transient.');
          core.info('📊 learning-telemetry baseline=passed validation=skipped iterations=0');
          return { fixRecommendation: null, autoFixResult: null, iterations: 0, agentRootCause, agentInvestigationFindings, autoFixSkipped, autoFixSkippedReason };
        }
        core.info('❌ Baseline check confirmed failure — proceeding with fix.');
        core.info(`📊 learning-telemetry baseline=failed durationMs=${baseline.durationMs}`);
      }

      try {
        await validator.applyFix(fixRecommendation.proposedChanges);
      } catch (applyError) {
        core.warning(`Iteration ${iteration + 1}: failed to apply fix locally — ${applyError}`);
        break;
      }

      core.info(`\n🧪 Running test locally...`);
      const testResult = await validator.runTest();

      if (testResult.passed) {
        core.info(
          `\n✅ Test PASSED on iteration ${iteration + 1}! (${testResult.durationMs}ms)`
        );
        core.info(`📊 learning-telemetry validation=passed iteration=${iteration + 1} durationMs=${testResult.durationMs}`);

        const branchName = generateFixBranchName(
          fixRecommendation.proposedChanges[0].file
        );

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
        } catch (pushError) {
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

      core.warning(
        `\n❌ Test FAILED on iteration ${iteration + 1} (exit code: ${testResult.exitCode}, ${testResult.durationMs}ms)`
      );
      core.info(`📊 learning-telemetry validation=failed iteration=${iteration + 1} durationMs=${testResult.durationMs}`);
      failedFixFingerprints.add(fingerprint);
      await validator.reset();

      if (iteration < maxIterations - 1) {
        core.info('Feeding failure logs + prior agent reasoning back into repair agent for next attempt...');
        // R4 + v1.49.1: delegate to buildNextPreviousAttempt so the
        // "source prior-agent fields from fixResult, NOT from the outer
        // accumulator" contract is enforced by the function signature.
        // See the helper's docstring for the rationale. Summary: the
        // outer agentRootCause / agentInvestigationFindings vars are a
        // last-non-empty accumulator used for the final return + skill
        // save, NOT a per-iteration snapshot. Using them here would
        // attribute iteration N-1's findings to iteration N whenever
        // iteration N produced no findings (orchestrator error, sparse run, etc.).
        previousAttempt = buildNextPreviousAttempt(
          iteration + 1,
          fixRecommendation,
          fixResult,
          testResult.logs
        );
      } else {
        core.warning(`\n🛑 All ${maxIterations} fix attempts exhausted. Giving up.`);
      }
    }
  } finally {
    if (validatorReady) {
      await validator.cleanup();
    }
  }

  return { fixRecommendation, autoFixResult, iterations: completedIterations, agentRootCause, agentInvestigationFindings, autoFixSkipped, autoFixSkippedReason };
}

/**
 * Normalize a file path so shared-code pattern matching is robust to:
 *   - leading "./" (model-emitted relative paths)
 *   - missing leading slash (bare `helpers/auth.ts`)
 *   - Windows-style separators (unlikely in GH API output, but cheap to handle)
 *   - mixed case (`PageObjects/` vs `/pageobjects/`)
 * The returned string always starts with `/` and is lowercase, so callers can
 * rely on `.includes('/pageobjects/')` semantics.
 */
function normalizeFileForPatternMatch(path: string): string {
  return ('/' + path.replace(/^\.\//, '').replace(/\\/g, '/')).toLowerCase();
}

/**
 * Compute the confidence required to apply an auto-fix, scaling the base
 * threshold up when the fix touches shared code (page objects, helpers,
 * commands, etc.) or spans multiple files. A fix in those surfaces can
 * cascade to many tests, so we demand more certainty before shipping it.
 *
 * Returns an object so call-sites can surface *why* the threshold went up
 * in logs / skip reasons, which is useful for auditing the policy.
 */
export function requiredConfidence(
  fix: FixRecommendation,
  baseMinConfidence: number
): { required: number; reasons: string[] } {
  const reasons: string[] = [];
  let required = baseMinConfidence;

  const files = new Set(fix.proposedChanges.map((c) => c.file));
  const sharedMatches = [...files].filter((f) => {
    const normalized = normalizeFileForPatternMatch(f);
    return BLAST_RADIUS.SHARED_CODE_PATTERNS.some((p) => normalized.includes(p));
  });

  if (sharedMatches.length > 0) {
    required += BLAST_RADIUS.SHARED_CODE_BOOST;
    reasons.push(
      `touches shared code (${sharedMatches.join(', ')}) — +${BLAST_RADIUS.SHARED_CODE_BOOST}`
    );
  }

  if (files.size >= 2) {
    required += BLAST_RADIUS.MULTI_FILE_BOOST;
    reasons.push(
      `spans ${files.size} files — +${BLAST_RADIUS.MULTI_FILE_BOOST}`
    );
  }

  // Cap the *scaled* threshold but never demote the caller's explicit floor.
  // If someone passes `baseMinConfidence = 100`, honor it: preserving the
  // explicit intent matters more than our "model rarely emits >95" heuristic.
  const effectiveMax = Math.max(
    baseMinConfidence,
    BLAST_RADIUS.MAX_REQUIRED_CONFIDENCE
  );
  if (required > effectiveMax) {
    required = effectiveMax;
  }

  return { required, reasons };
}

/**
 * Produces a stable fingerprint for a fix so we can detect duplicates across
 * any number of prior attempts (not just the immediately previous one).
 */
export function fixFingerprint(fix: FixRecommendation): string {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  return fix.proposedChanges
    .map((c) => `${c.file}::${normalize(c.oldCode)}::${normalize(c.newCode)}`)
    .sort()
    .join('\n');
}

/**
 * The minimal shape of `generateFixRecommendation`'s return value that the
 * retry-context builder cares about. Kept narrow so tests don't have to
 * fabricate a full result object just to exercise the threading semantic.
 */
export interface FixResultForRetry {
  agentRootCause?: string;
  agentInvestigationFindings?: string;
}

/**
 * Build the `previousAttempt` object that's threaded into the NEXT
 * iteration of `iterativeFixValidateLoop`. This helper exists specifically
 * to enforce the staleness-avoidance contract identified in the v1.49.1
 * review:
 *
 *   The prior-iteration agent reasoning MUST come from `fixResult`
 *   (the just-completed iteration's output), NOT from any outer-scope
 *   accumulator. If iteration N returned no investigation findings —
 *   e.g. sparse agentic run, orchestrator error —
 *   iteration N+1 must see "no prior findings", not iteration N-1's
 *   stale findings presented as if iteration N had concluded them.
 *
 * The function signature pins this contract into the type system: the
 * only way to populate the prior fields is to pass the current
 * iteration's `FixResultForRetry`. An outer-scope accumulator cannot
 * leak in by accident.
 */
export function buildNextPreviousAttempt(
  nextIteration: number,
  previousFix: FixRecommendation,
  fixResult: FixResultForRetry,
  validationLogs: string
): {
  iteration: number;
  previousFix: FixRecommendation;
  validationLogs: string;
  priorAgentRootCause?: string;
  priorAgentInvestigationFindings?: string;
} {
  return {
    iteration: nextIteration,
    previousFix,
    validationLogs,
    priorAgentRootCause: fixResult.agentRootCause,
    priorAgentInvestigationFindings: fixResult.agentInvestigationFindings,
  };
}

/**
 * Outcome wrapper so callers can distinguish:
 *   - "applied (or attempted)"  → `applied` is the ApplyResult
 *   - "intentionally held back by a policy gate" → `applied: null` + `skipReason`
 *   - "no apply happened for other reasons (no changes, internal error)" → both undefined
 *
 * The `skipReason` mirrors the `autoFixSkipped` signal from
 * `iterativeFixValidateLoop` and is surfaced on the run output so downstream
 * Slack / dashboards can tell safety-withheld fixes apart from other skips.
 */
export interface AttemptAutoFixOutcome {
  applied: ApplyResult | null;
  skipReason?: string;
}

export async function attemptAutoFix(
  inputs: ActionInputs,
  fixRecommendation: FixRecommendation,
  octokit: Octokit,
  repoDetails: { owner: string; repo: string },
  errorData?: { fileName?: string }
): Promise<AttemptAutoFixOutcome> {
  core.info('\n🤖 Auto-fix is enabled, attempting to apply fix...');

  const baseMin =
    inputs.autoFixMinConfidence ?? AUTO_FIX.DEFAULT_MIN_CONFIDENCE;
  const { required, reasons } = requiredConfidence(
    fixRecommendation,
    baseMin
  );
  if (fixRecommendation.confidence < required) {
    const suffix = reasons.length
      ? ` (blast-radius scaling: ${reasons.join('; ')})`
      : '';
    const skipMessage = `confidence ${fixRecommendation.confidence}% below required ${required}%${suffix}`;
    core.info(`⏭️ Auto-fix skipped: ${skipMessage}`);
    // Only tag this as a policy-withheld skip when blast-radius actually
    // raised the bar. A plain "confidence below user threshold" skip is
    // "no viable fix", not a safety hold-back.
    return {
      applied: null,
      skipReason: reasons.length > 0 ? `Blast-radius gate: ${skipMessage}` : undefined,
    };
  }

  const fixApplier = createFixApplier({
    octokit,
    owner: repoDetails.owner,
    repo: repoDetails.repo,
    baseBranch: inputs.branch || inputs.autoFixBaseBranch || 'main',
    minConfidence: required,
    enableValidation: inputs.enableValidation,
    validationWorkflow: inputs.validationWorkflow,
    validationTestCommand: inputs.validationTestCommand,
  });

  // Outer gate already enforced `confidence >= required`, so the canApply
  // confidence check is redundant here — only the "no proposed changes"
  // branch can actually fire. Keep the call because canApply is the
  // applier's canonical readiness check, but make the log truthful.
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

        const spec =
          inputs.validationSpec ||
          errorData?.fileName ||
          fixRecommendation.proposedChanges[0]?.file;
        const previewUrl =
          inputs.validationPreviewUrl || DEFAULT_PRODUCT_URL;

        if (!inputs.validationPreviewUrl) {
          core.info(
            `No preview URL provided, falling back to production: ${previewUrl}`
          );
        }

        if (!spec) {
          core.warning(
            'No spec file identified for validation, skipping validation trigger'
          );
          result.validationStatus = 'skipped';
        } else {
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
              core.info(
                `✅ Validation workflow triggered: run ID ${validationResult.runId}`
              );
            } else {
              core.info(
                '✅ Validation workflow triggered: run ID not available yet'
              );
            }
          } else {
            core.warning('Could not trigger validation workflow');
            result.validationStatus = 'skipped';
          }
        }
      }
    } else {
      core.warning(`❌ Auto-fix failed: ${result.error}`);
    }

    return { applied: result };
  } catch (error) {
    core.warning(`Auto-fix error: ${error}`);
    return { applied: null };
  }
}

