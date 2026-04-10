import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { analyzeFailure } from './simplified-analyzer';
import { OpenAIClient } from './openai-client';
import { ArtifactFetcher } from './artifact-fetcher';
import { ActionInputs, FixRecommendation } from './types';
import { buildRepairContext } from './repair-context';
import { SimplifiedRepairAgent } from './repair/simplified-repair-agent';
import { processWorkflowLogs } from './services/log-processor';
import { createFixApplier, ApplyResult, generateFixBranchName } from './repair/fix-applier';
import { LocalFixValidator } from './services/local-fix-validator';
import { AUTO_FIX, CURSOR_CLOUD, FIX_VALIDATE_LOOP, DEFAULT_PRODUCT_REPO, DEFAULT_PRODUCT_URL } from './config/constants';
import { parseRepoString } from './utils/repo-utils';
import { CursorCloudValidator, CursorValidationParams } from './services/cursor-cloud-validator';
import { SkillStore, buildSkill, describeFixPattern } from './services/skill-store';

async function run(): Promise<void> {
  try {
    // Get inputs
    const inputs = getInputs();

    // Initialize clients
    const octokit = new Octokit({ auth: inputs.githubToken });
    const repoDetails = resolveRepository(inputs);
    const openaiClient = new OpenAIClient(inputs.openaiApiKey);
    const artifactFetcher = new ArtifactFetcher(octokit);

    // Get error data using the log processor service
    const errorData = await processWorkflowLogs(
      octokit,
      artifactFetcher,
      inputs,
      repoDetails
    );

    if (!errorData) {
      // Check if this is due to workflow still running
      const context = github.context;
      const { owner, repo } = context.repo;
      const runId = inputs.workflowRunId || context.runId.toString();

      try {
        const workflowRun = await octokit.actions.getWorkflowRun({
          owner,
          repo,
          run_id: parseInt(runId, 10),
        });

        if (workflowRun.data.status !== 'completed') {
          if (inputs.jobName) {
            try {
              const jobs = await octokit.actions.listJobsForWorkflowRun({
                owner,
                repo,
                run_id: parseInt(runId, 10),
                filter: 'latest',
              });
              const targetJob = jobs.data.jobs.find(
                (job) => job.name === inputs.jobName
              );

              if (!targetJob) {
                core.warning(
                  `Job '${inputs.jobName}' not found yet while workflow is still in progress`
                );
              } else if (
                targetJob.status === 'completed' &&
                targetJob.conclusion !== 'failure'
              ) {
                core.info(
                  `Job '${inputs.jobName}' completed with conclusion: ${targetJob.conclusion} — nothing to triage`
                );
                core.setOutput('verdict', 'NO_FAILURE');
                core.setOutput('confidence', '100');
                core.setOutput(
                  'reasoning',
                  `Job '${inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion}). No triage needed.`
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
                    reasoning: `Job '${inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion}). No triage needed.`,
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
      return;
    }

    // Load skill memory BEFORE classification so the classifier benefits from
    // flakiness history and the responseId chains into the repair pipeline.
    const autoFixTargetRepo = inputs.autoFixTargetRepo
      ? resolveAutoFixTargetRepo(inputs)
      : null;

    let skillStore: SkillStore | undefined;
    if (autoFixTargetRepo) {
      skillStore = new SkillStore(octokit, autoFixTargetRepo.owner, autoFixTargetRepo.repo);
      await skillStore.load().catch((err) => {
        core.warning(`Skill store load failed (non-fatal): ${err}`);
      });
    }

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

    // Analyze with AI
    const result = skillContext
      ? await analyzeFailure(openaiClient, errorData, skillContext)
      : await analyzeFailure(openaiClient, errorData);
    const classificationResponseId = result.responseId;

    // Short-circuit before any repair attempt when the verdict is not actionable
    // or confidence is too low.  This prevents wasted API calls and avoids creating
    // auto-fix branches that would later be overridden to INCONCLUSIVE.
    if (result.confidence < inputs.confidenceThreshold) {
      core.warning(
        `Confidence ${result.confidence}% is below threshold ${inputs.confidenceThreshold}%`
      );
      setInconclusiveOutput(result, inputs, errorData);
      return;
    }

    if (result.verdict !== 'TEST_ISSUE') {
      setSuccessOutput(result, errorData, null, flakinessSignal);
      return;
    }

    // Emit core classification outputs NOW so they survive if repair times out.
    // The full triage_json (with fix details) is written after repair completes.
    core.setOutput('verdict', result.verdict);
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', result.reasoning);
    core.setOutput('summary', result.summary || '');

    // Generate fix recommendation for TEST_ISSUE verdicts
    let fixRecommendation: FixRecommendation | null = null;
    let autoFixResult: ApplyResult | null = null;

    if (inputs.enableAutoFix && inputs.enableValidation && inputs.validationTestCommand && autoFixTargetRepo) {
      const loopResult = await iterativeFixValidateLoop(
        inputs,
        repoDetails,
        autoFixTargetRepo,
        errorData,
        openaiClient,
        octokit,
        skillStore,
        classificationResponseId
      );
      fixRecommendation = loopResult.fixRecommendation;
      autoFixResult = loopResult.autoFixResult;
    } else {
      const singleResult = await generateFixRecommendation(
        inputs,
        repoDetails,
        errorData,
        openaiClient,
        octokit,
        undefined,
        classificationResponseId,
        skillStore
      );
      fixRecommendation = singleResult?.fix ?? null;
      if (fixRecommendation && inputs.enableAutoFix && autoFixTargetRepo) {
        autoFixResult = await attemptAutoFix(
          inputs,
          fixRecommendation,
          octokit,
          autoFixTargetRepo,
          errorData
        );
      }
    }

    if (fixRecommendation) {
      result.fixRecommendation = fixRecommendation;
    }

    // Overwrite with final outputs including fix/auto-fix results
    setSuccessOutput(result, errorData, autoFixResult, flakinessSignal);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred';
    core.setOutput('verdict', 'ERROR');
    core.setOutput('confidence', '0');
    core.setOutput('reasoning', errorMsg);
    core.setOutput('summary', `Triage failed: ${errorMsg}`);
    core.setOutput('triage_json', JSON.stringify({
      verdict: 'ERROR',
      confidence: 0,
      reasoning: errorMsg,
      summary: `Triage failed: ${errorMsg}`,
      indicators: [],
      metadata: { analyzedAt: new Date().toISOString(), error: true },
    }));
    core.setFailed(`Action failed: ${errorMsg}`);
  }
}

function getInputs(): ActionInputs {
  const repositoryInput = core.getInput('REPOSITORY');
  return {
    githubToken:
      core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN || '',
    openaiApiKey: core.getInput('OPENAI_API_KEY', { required: true }),
    errorMessage: core.getInput('ERROR_MESSAGE'),
    workflowRunId: core.getInput('WORKFLOW_RUN_ID'),
    jobName: core.getInput('JOB_NAME'),
    confidenceThreshold: safeParseInt(
      core.getInput('CONFIDENCE_THRESHOLD'),
      70
    ),
    prNumber: core.getInput('PR_NUMBER'),
    commitSha: core.getInput('COMMIT_SHA'),
    repository: repositoryInput ? repositoryInput.trim() : undefined,
    testFrameworks: core.getInput('TEST_FRAMEWORKS'),
    enableAutoFix: core.getInput('ENABLE_AUTO_FIX') === 'true',
    autoFixBaseBranch: core.getInput('AUTO_FIX_BASE_BRANCH') || 'main',
    autoFixMinConfidence: safeParseInt(
      core.getInput('AUTO_FIX_MIN_CONFIDENCE'),
      AUTO_FIX.DEFAULT_MIN_CONFIDENCE
    ),
    autoFixTargetRepo: core.getInput('AUTO_FIX_TARGET_REPO') || undefined,
    branch: core.getInput('BRANCH') || undefined,
    // Validation inputs
    enableValidation: core.getInput('ENABLE_VALIDATION') === 'true',
    validationWorkflow:
      core.getInput('VALIDATION_WORKFLOW') || 'validate-fix.yml',
    validationPreviewUrl: core.getInput('VALIDATION_PREVIEW_URL') || undefined,
    validationSpec: core.getInput('VALIDATION_SPEC') || undefined,
    validationTestCommand:
      core.getInput('VALIDATION_TEST_COMMAND') || undefined,
    npmToken: core.getInput('NPM_TOKEN') || undefined,
    // Agentic repair input
    enableAgenticRepair: core.getInput('ENABLE_AGENTIC_REPAIR') === 'true',
    // Product repo diff inputs
    productRepo: core.getInput('PRODUCT_REPO') || DEFAULT_PRODUCT_REPO,
    productDiffCommits: safeParseInt(core.getInput('PRODUCT_DIFF_COMMITS'), 5),
    // Cursor Cloud Agent validation inputs
    enableCursorValidation:
      core.getInput('ENABLE_CURSOR_VALIDATION') === 'true',
    cursorApiKey: core.getInput('CURSOR_API_KEY') || undefined,
    cursorValidationMode:
      (core.getInput('CURSOR_VALIDATION_MODE') as 'poll' | 'async') || 'poll',
    cursorValidationTimeout: safeParseInt(
      core.getInput('CURSOR_VALIDATION_TIMEOUT'),
      CURSOR_CLOUD.VALIDATION_TIMEOUT_MS
    ),
  };
}

// parseRepoString imported from ./utils/repo-utils

function resolveRepository(inputs: ActionInputs): {
  owner: string;
  repo: string;
} {
  return parseRepoString(inputs.repository, 'REPOSITORY');
}

function resolveAutoFixTargetRepo(inputs: ActionInputs): {
  owner: string;
  repo: string;
} {
  return parseRepoString(inputs.autoFixTargetRepo, 'AUTO_FIX_TARGET_REPO');
}

async function generateFixRecommendation(
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
  skillStore?: SkillStore
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

    // Resolve where the test code lives (for fetching source files)
    const autoFixTargetRepo = resolveAutoFixTargetRepo(inputs);

    // Initialize repair agent with shared OpenAI client and source fetch context
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
            framework: (errorData as import('./types').ErrorData).framework || 'unknown',
            spec: errorData.fileName,
            errorMessage: errorData.message,
          }),
          flakiness: skillStore.detectFlakiness(errorData.fileName || 'unknown'),
        }
      : undefined;

    const result = await repairAgent.generateFixRecommendation(
      repairContext,
      errorData as import('./types').ErrorData,
      previousAttempt,
      previousResponseId,
      skills
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
async function iterativeFixValidateLoop(
  inputs: ActionInputs,
  repoDetails: { owner: string; repo: string },
  autoFixTargetRepo: { owner: string; repo: string },
  errorData: { message: string; testName?: string; fileName?: string; framework?: string },
  openaiClient: OpenAIClient,
  octokit: Octokit,
  skillStore?: SkillStore,
  classificationResponseId?: string
): Promise<{
  fixRecommendation: FixRecommendation | null;
  autoFixResult: ApplyResult | null;
}> {
  const maxIterations = FIX_VALIDATE_LOOP.MAX_ITERATIONS;
  let fixRecommendation: FixRecommendation | null = null;
  let autoFixResult: ApplyResult | null = null;
  let previousAttempt:
    | { iteration: number; previousFix: FixRecommendation; validationLogs: string }
    | undefined;
  const failedFixFingerprints = new Set<string>();
  const minConfidence = inputs.autoFixMinConfidence || AUTO_FIX.DEFAULT_MIN_CONFIDENCE;
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
        skillStore
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
            const changeType = (firstChange as { changeType?: string })?.changeType || 'OTHER';
            const skill = buildSkill({
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
                pattern: describeFixPattern(fixRecommendation.proposedChanges),
              },
              confidence: fixRecommendation.confidence,
              iterations: iteration + 1,
              prUrl: pushResult.prUrl || '',
              validatedLocally: true,
              priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
            });
            await skillStore.save(skill).catch((err) => {
              core.warning(`Failed to save skill: ${err}`);
            });
            await skillStore.recordOutcome(skill.id, true).catch(() => {});
          }
        } catch (pushError) {
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

        if (skillStore && fixRecommendation) {
          const repoFullName = `${autoFixTargetRepo.owner}/${autoFixTargetRepo.repo}`;
          const firstChange = fixRecommendation.proposedChanges?.[0];
          const changeType = (firstChange as { changeType?: string })?.changeType || 'OTHER';
          const failedSkill = buildSkill({
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
              pattern: describeFixPattern(fixRecommendation.proposedChanges || []),
            },
            confidence: fixRecommendation.confidence,
            iterations: maxIterations,
            prUrl: '',
            validatedLocally: false,
            priorSkillCount: skillStore.countForSpec(errorData.fileName || 'unknown'),
          });
          await skillStore.save(failedSkill).catch(() => {});
          await skillStore.recordOutcome(failedSkill.id, false).catch(() => {});
          core.info(`📝 Saved failed fix trajectory as negative skill example (${failedSkill.id})`);
        }
      }
    }
  } finally {
    if (validatorReady) {
      await validator.cleanup();
    }
  }

  return { fixRecommendation, autoFixResult };
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

async function attemptAutoFix(
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
      inputs.autoFixMinConfidence || AUTO_FIX.DEFAULT_MIN_CONFIDENCE,
    enableValidation: inputs.enableValidation,
    validationWorkflow: inputs.validationWorkflow,
    validationTestCommand: inputs.validationTestCommand,
  });

  // Check if the fix can be applied (confidence check)
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

      // Trigger validation if enabled
      if (inputs.enableValidation && result.branchName) {
        core.info('\n🧪 Triggering validation workflow...');

        // Determine spec and preview URL for validation
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
      } else if (inputs.enableCursorValidation && result.branchName) {
        core.info('\n🤖 Triggering Cursor cloud agent validation...');
        try {
          await triggerCursorValidation(
            inputs,
            result,
            fixRecommendation,
            repoDetails,
            errorData
          );
        } catch (cursorError) {
          core.warning(`Cursor cloud agent validation error: ${cursorError}`);
          result.validationStatus = 'skipped';
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

/**
 * Trigger Cursor Cloud Agent validation as an alternative to
 * the GitHub Actions workflow_dispatch validation.
 *
 * This is called from attemptAutoFix when ENABLE_CURSOR_VALIDATION=true.
 * It does not modify any existing validation logic — the firing workflow
 * chooses which path to use via the input parameter.
 */
async function triggerCursorValidation(
  inputs: ActionInputs,
  result: ApplyResult,
  fixRecommendation: FixRecommendation,
  repoDetails: { owner: string; repo: string },
  errorData?: { fileName?: string }
): Promise<void> {
  if (!inputs.cursorApiKey) {
    core.warning(
      'CURSOR_API_KEY is required for Cursor cloud agent validation'
    );
    result.validationStatus = 'skipped';
    return;
  }

  const spec =
    inputs.validationSpec ||
    errorData?.fileName ||
    fixRecommendation.proposedChanges[0]?.file;
  const previewUrl =
    inputs.validationPreviewUrl || DEFAULT_PRODUCT_URL;

  if (!spec) {
    core.warning(
      'No spec file identified for Cursor validation, skipping'
    );
    result.validationStatus = 'skipped';
    return;
  }

  const repositoryUrl = `https://github.com/${repoDetails.owner}/${repoDetails.repo}`;

  const validationParams: CursorValidationParams = {
    repositoryUrl,
    branch: result.branchName!,
    spec,
    previewUrl,
    framework: inputs.testFrameworks,
    testCommand: inputs.validationTestCommand,
    triageRunId: inputs.workflowRunId,
  };

  const validator = new CursorCloudValidator(inputs.cursorApiKey);
  const mode = inputs.cursorValidationMode || 'poll';
  const timeout = inputs.cursorValidationTimeout;

  core.info(`\n🤖 Launching Cursor cloud agent validation (mode: ${mode})`);

  const cursorResult = await validator.validate(
    validationParams,
    mode,
    timeout
  );

  result.validationUrl = cursorResult.agentUrl;

  if (cursorResult.status === 'FINISHED') {
    if (cursorResult.testPassed === true) {
      result.validationStatus = 'passed';
      core.info('✅ Cursor cloud agent: tests PASSED');
    } else if (cursorResult.testPassed === false) {
      result.validationStatus = 'failed';
      core.warning('❌ Cursor cloud agent: tests FAILED');
    } else {
      result.validationStatus = 'pending';
      core.info(
        '❓ Cursor cloud agent finished but result could not be determined'
      );
    }
  } else if (cursorResult.status === 'ERROR') {
    result.validationStatus = 'failed';
    core.warning('❌ Cursor cloud agent encountered an error');
  } else {
    result.validationStatus = 'pending';
  }

  core.info(`  Agent ID: ${cursorResult.agentId}`);
  core.info(`  Agent URL: ${cursorResult.agentUrl}`);
  core.info(`  Summary: ${cursorResult.summary}`);

  core.setOutput('cursor_agent_id', cursorResult.agentId);
  core.setOutput('cursor_agent_url', cursorResult.agentUrl || '');
  core.setOutput('cursor_validation_summary', cursorResult.summary || '');
}

function setInconclusiveOutput(
  result: { confidence: number; reasoning: string; indicators?: string[] },
  inputs: ActionInputs,
  errorData: { screenshots?: Array<{ name: string }>; logs?: string[] }
): void {
  const inconclusiveTriageJson = {
    verdict: 'INCONCLUSIVE',
    confidence: result.confidence,
    reasoning: `Low confidence: ${result.reasoning}`,
    summary: 'Analysis inconclusive due to low confidence',
    indicators: result.indicators || [],
    metadata: {
      analyzedAt: new Date().toISOString(),
      confidenceThreshold: inputs.confidenceThreshold,
      hasScreenshots:
        (errorData.screenshots && errorData.screenshots.length > 0) || false,
      logSize: errorData.logs?.reduce((sum, l) => sum + l.length, 0) ?? 0,
    },
  };
  core.setOutput('verdict', 'INCONCLUSIVE');
  core.setOutput('confidence', result.confidence.toString());
  core.setOutput('reasoning', `Low confidence: ${result.reasoning}`);
  core.setOutput('summary', 'Analysis inconclusive due to low confidence');
  core.setOutput('triage_json', JSON.stringify(inconclusiveTriageJson));
}

function setErrorOutput(reason: string): void {
  core.setOutput('verdict', 'ERROR');
  core.setOutput('confidence', '0');
  core.setOutput('reasoning', reason);
  core.setOutput('summary', `Triage failed: ${reason}`);
  core.setOutput(
    'triage_json',
    JSON.stringify({
      verdict: 'ERROR',
      confidence: 0,
      reasoning: reason,
      summary: `Triage failed: ${reason}`,
      indicators: [],
      metadata: { analyzedAt: new Date().toISOString(), error: true },
    })
  );
  core.setFailed(reason);
}

function setSuccessOutput(
  result: {
    verdict: string;
    confidence: number;
    reasoning: string;
    summary?: string;
    indicators?: string[];
    suggestedSourceLocations?: {
      file: string;
      lines: string;
      reason: string;
    }[];
    fixRecommendation?: FixRecommendation;
  },
  errorData: { screenshots?: Array<{ name: string }>; logs?: string[] },
  autoFixResult?: ApplyResult | null,
  flakiness?: { isFlaky: boolean; fixCount: number; windowDays: number; message: string }
): void {
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
            validation: {
              status: autoFixResult.validationStatus || 'skipped',
              runId: autoFixResult.validationRunId,
              url: autoFixResult.validationUrl,
            },
          },
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
    metadata: {
      analyzedAt: new Date().toISOString(),
      hasScreenshots:
        (errorData.screenshots && errorData.screenshots.length > 0) || false,
      logSize: errorData.logs?.reduce((sum, l) => sum + l.length, 0) ?? 0,
      hasFixRecommendation: !!result.fixRecommendation,
      autoFixApplied: autoFixResult?.success || false,
    },
  };

  core.setOutput('verdict', result.verdict);
  core.setOutput('confidence', result.confidence.toString());
  core.setOutput('reasoning', result.reasoning);
  core.setOutput('summary', result.summary);
  core.setOutput('triage_json', JSON.stringify(triageJson));

  // Add fix recommendation outputs if available
  if (result.fixRecommendation) {
    core.setOutput('has_fix_recommendation', 'true');
    core.setOutput(
      'fix_recommendation',
      JSON.stringify(result.fixRecommendation)
    );
    core.setOutput('fix_summary', result.fixRecommendation.summary);
    core.setOutput(
      'fix_confidence',
      result.fixRecommendation.confidence.toString()
    );
  } else {
    core.setOutput('has_fix_recommendation', 'false');
  }

  // Add auto-fix outputs
  if (autoFixResult?.success) {
    core.setOutput('auto_fix_applied', 'true');
    core.setOutput('auto_fix_branch', autoFixResult.branchName || '');
    core.setOutput('auto_fix_commit', autoFixResult.commitSha || '');
    core.setOutput(
      'auto_fix_files',
      JSON.stringify(autoFixResult.modifiedFiles)
    );

    // Add validation outputs
    if (autoFixResult.validationRunId) {
      core.setOutput(
        'validation_run_id',
        autoFixResult.validationRunId.toString()
      );
      core.setOutput(
        'validation_status',
        autoFixResult.validationStatus || 'pending'
      );
      core.setOutput(
        'validation_url',
        autoFixResult.validationUrl ||
          `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${autoFixResult.validationRunId}`
      );
    } else if (autoFixResult.validationStatus === 'pending') {
      core.setOutput('validation_status', 'pending');
      if (autoFixResult.validationUrl) {
        core.setOutput('validation_url', autoFixResult.validationUrl);
      }
    } else {
      core.setOutput(
        'validation_status',
        autoFixResult.validationStatus || 'skipped'
      );
    }
  } else {
    core.setOutput('auto_fix_applied', 'false');
    core.setOutput(
      'validation_status',
      autoFixResult?.validationStatus || 'skipped'
    );
  }

  // Log results
  core.info(`Verdict: ${result.verdict}`);
  core.info(`Confidence: ${result.confidence}%`);
  core.info(`Summary: ${result.summary}`);

  // Log suggested source locations for PRODUCT_ISSUE
  if (
    result.verdict === 'PRODUCT_ISSUE' &&
    result.suggestedSourceLocations &&
    result.suggestedSourceLocations.length > 0
  ) {
    core.info('\n🎯 Suggested Source Locations to Investigate:');
    result.suggestedSourceLocations.forEach((location, index) => {
      core.info(`  ${index + 1}. ${location.file} (lines ${location.lines})`);
      core.info(`     Reason: ${location.reason}`);
    });
  }

  // Log fix recommendation for TEST_ISSUE
  if (result.verdict === 'TEST_ISSUE' && result.fixRecommendation) {
    core.info('\n🔧 Fix Recommendation Generated:');
    core.info(`  Confidence: ${result.fixRecommendation.confidence}%`);
    core.info(
      `  Changes: ${result.fixRecommendation.proposedChanges.length} file(s)`
    );
    core.info(
      `  Evidence: ${result.fixRecommendation.evidence.length} item(s)`
    );
    core.info('\n📝 Fix Summary:');
    core.info(result.fixRecommendation.summary);

    // Log auto-fix result
    if (autoFixResult?.success) {
      core.info('\n✅ Auto-Fix Applied:');
      core.info(`  Branch: ${autoFixResult.branchName}`);
      core.info(`  Commit: ${autoFixResult.commitSha}`);
      core.info(`  Files: ${autoFixResult.modifiedFiles.join(', ')}`);

      if (autoFixResult.validationStatus === 'passed') {
        core.info('\n🧪 Validation: passed (locally validated before push)');
      } else if (autoFixResult.validationRunId) {
        core.info(`\n🧪 Validation: ${autoFixResult.validationStatus}`);
        core.info(`  Run ID: ${autoFixResult.validationRunId}`);
      } else {
        core.info(`\n🧪 Validation: ${autoFixResult.validationStatus || 'skipped'}`);
      }
    }
  }
}

// Export for testing
export { run };

/**
 * Safely parse an integer with a fallback default.
 * Returns the default when the input is empty, undefined, or not a valid integer.
 */
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Run the action if this is the main module
if (require.main === module) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Fatal unhandled error: ${message}`);
  });
}
