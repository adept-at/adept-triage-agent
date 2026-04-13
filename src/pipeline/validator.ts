import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ActionInputs, ErrorData, FixRecommendation } from '../types';
import { buildRepairContext } from '../repair-context';
import { SimplifiedRepairAgent } from '../repair/simplified-repair-agent';
import { createFixApplier, ApplyResult, generateFixBranchName } from '../repair/fix-applier';
import { LocalFixValidator } from '../services/local-fix-validator';
import { AUTO_FIX, FIX_VALIDATE_LOOP, DEFAULT_PRODUCT_URL } from '../config/constants';
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
  },
  previousResponseId?: string,
  skillStore?: SkillStore,
  priorInvestigationContext?: string
): Promise<{ fix: FixRecommendation; lastResponseId?: string } | null> {
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
        enableAgenticRepair: inputs.enableAgenticRepair,
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
      priorInvestigationContext
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
  classificationResponseId?: string,
  investigationContext?: string
): Promise<{
  fixRecommendation: FixRecommendation | null;
  autoFixResult: ApplyResult | null;
  iterations: number;
  prUrl?: string;
}> {
  const maxIterations = FIX_VALIDATE_LOOP.MAX_ITERATIONS;
  let fixRecommendation: FixRecommendation | null = null;
  let autoFixResult: ApplyResult | null = null;
  let completedIterations = 0;
  let previousAttempt:
    | { iteration: number; previousFix: FixRecommendation; validationLogs: string }
    | undefined;
  const failedFixFingerprints = new Set<string>();
  const minConfidence = inputs.autoFixMinConfidence ?? AUTO_FIX.DEFAULT_MIN_CONFIDENCE;
  const baseBranch = inputs.branch || inputs.autoFixBaseBranch || 'main';
  let lastResponseId: string | undefined = classificationResponseId;

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
        lastResponseId,
        skillStore,
        investigationContext
      );

      if (!fixResult) {
        fixRecommendation = null;
        core.warning(`Iteration ${iteration + 1}: could not generate fix recommendation`);
        break;
      }

      fixRecommendation = fixResult.fix;
      lastResponseId = fixResult.lastResponseId ?? lastResponseId;

      if (
        fixRecommendation.confidence < minConfidence ||
        !fixRecommendation.proposedChanges?.length
      ) {
        core.info(
          `Iteration ${iteration + 1}: fix rejected — confidence ${fixRecommendation.confidence}% below ${minConfidence}% or no changes`
        );
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
          return { fixRecommendation: null, autoFixResult: null, iterations: 0 };
        }
        core.info('❌ Baseline check confirmed failure — proceeding with fix.');
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

          return { fixRecommendation, autoFixResult, iterations: iteration + 1, prUrl: pushResult.prUrl };
        } catch (pushError) {
          core.warning(`Test passed but push/PR creation failed: ${pushError}`);
          autoFixResult = {
            success: false,
            modifiedFiles: fixRecommendation.proposedChanges.map((c) => c.file),
            error: `Push failed after successful test: ${pushError}`,
            validationStatus: 'passed',
          };
        }

        return { fixRecommendation, autoFixResult, iterations: iteration + 1 };
      }

      core.warning(
        `\n❌ Test FAILED on iteration ${iteration + 1} (exit code: ${testResult.exitCode}, ${testResult.durationMs}ms)`
      );
      failedFixFingerprints.add(fingerprint);
      await validator.reset();

      if (iteration < maxIterations - 1) {
        core.info('Feeding failure logs back into repair agent for next attempt...');
        previousAttempt = {
          iteration: iteration + 1,
          previousFix: fixRecommendation,
          validationLogs: testResult.logs,
        };
      } else {
        core.warning(`\n🛑 All ${maxIterations} fix attempts exhausted. Giving up.`);
      }
    }
  } finally {
    if (validatorReady) {
      await validator.cleanup();
    }
  }

  return { fixRecommendation, autoFixResult, iterations: completedIterations };
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

export async function attemptAutoFix(
  inputs: ActionInputs,
  fixRecommendation: FixRecommendation,
  octokit: Octokit,
  repoDetails: { owner: string; repo: string },
  errorData?: { fileName?: string }
): Promise<ApplyResult | null> {
  core.info('\n🤖 Auto-fix is enabled, attempting to apply fix...');

  const fixApplier = createFixApplier({
    octokit,
    owner: repoDetails.owner,
    repo: repoDetails.repo,
    baseBranch: inputs.branch || inputs.autoFixBaseBranch || 'main',
    minConfidence:
      inputs.autoFixMinConfidence ?? AUTO_FIX.DEFAULT_MIN_CONFIDENCE,
    enableValidation: inputs.enableValidation,
    validationWorkflow: inputs.validationWorkflow,
    validationTestCommand: inputs.validationTestCommand,
  });

  if (!fixApplier.canApply(fixRecommendation)) {
    core.info(
      '⏭️ Auto-fix skipped: confidence below threshold or no changes proposed'
    );
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

    return result;
  } catch (error) {
    core.warning(`Auto-fix error: ${error}`);
    return null;
  }
}

