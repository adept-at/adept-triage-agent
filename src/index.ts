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
import { createFixApplier, ApplyResult, ValidationOutcome } from './repair/fix-applier';
import { AUTO_FIX, CURSOR_CLOUD, FIX_VALIDATE_LOOP, DEFAULT_PRODUCT_REPO, DEFAULT_PRODUCT_URL } from './config/constants';
import { parseRepoString } from './utils/repo-utils';
import { CursorCloudValidator, CursorValidationParams } from './services/cursor-cloud-validator';

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

    // Analyze with AI
    const result = await analyzeFailure(openaiClient, errorData);

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
      setSuccessOutput(result, errorData, null);
      return;
    }

    // Generate fix recommendation for TEST_ISSUE verdicts
    let fixRecommendation: FixRecommendation | null = null;
    let autoFixResult: ApplyResult | null = null;

    if (inputs.enableAutoFix && inputs.enableValidation) {
      // Iterative fix-validate loop: generate fix, validate, retry on failure
      const autoFixTargetRepo = resolveAutoFixTargetRepo(inputs);
      const loopResult = await iterativeFixValidateLoop(
        inputs,
        repoDetails,
        autoFixTargetRepo,
        errorData,
        openaiClient,
        octokit
      );
      fixRecommendation = loopResult.fixRecommendation;
      autoFixResult = loopResult.autoFixResult;
    } else {
      // Original single-attempt flow (no validation loop)
      fixRecommendation = await generateFixRecommendation(
        inputs,
        repoDetails,
        errorData,
        openaiClient,
        octokit
      );
      if (fixRecommendation && inputs.enableAutoFix) {
        const autoFixTargetRepo = resolveAutoFixTargetRepo(inputs);
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

    // Set successful outputs
    setSuccessOutput(result, errorData, autoFixResult);
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
  }
): Promise<FixRecommendation | null> {
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
        branch: inputs.autoFixBaseBranch || 'main',
      },
      {
        enableAgenticRepair: inputs.enableAgenticRepair,
      }
    );
    const recommendation = await repairAgent.generateFixRecommendation(
      repairContext,
      errorData as import('./types').ErrorData,
      previousAttempt
    );

    if (recommendation) {
      core.info(
        `✅ Fix recommendation generated with ${recommendation.confidence}% confidence`
      );
    } else {
      core.info('❌ Could not generate fix recommendation');
    }
    return recommendation;
  } catch (error) {
    core.warning(`Failed to generate fix recommendation: ${error}`);
    return null;
  }
}

/**
 * Iterative fix-validate loop.
 * Generates a fix, applies it, triggers validation, waits for result.
 * If validation fails, feeds the failure logs back into the repair agent
 * and tries again — up to FIX_VALIDATE_LOOP.MAX_ITERATIONS times.
 */
async function iterativeFixValidateLoop(
  inputs: ActionInputs,
  repoDetails: { owner: string; repo: string },
  autoFixTargetRepo: { owner: string; repo: string },
  errorData: { message: string; testName?: string; fileName?: string },
  openaiClient: OpenAIClient,
  octokit: Octokit
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

  const fixApplier = createFixApplier({
    octokit,
    owner: autoFixTargetRepo.owner,
    repo: autoFixTargetRepo.repo,
    baseBranch: inputs.autoFixBaseBranch || 'main',
    minConfidence:
      inputs.autoFixMinConfidence || AUTO_FIX.DEFAULT_MIN_CONFIDENCE,
    enableValidation: inputs.enableValidation,
    validationWorkflow: inputs.validationWorkflow,
    validationTestCommand: inputs.validationTestCommand,
  });

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    core.info(
      `\n${'='.repeat(60)}\n🔄 Fix-Validate iteration ${iteration + 1}/${maxIterations}\n${'='.repeat(60)}`
    );

    // 1. Generate fix (with feedback from previous attempt if any)
    fixRecommendation = await generateFixRecommendation(
      inputs,
      repoDetails,
      errorData,
      openaiClient,
      octokit,
      previousAttempt
    );

    if (!fixRecommendation) {
      core.warning(`Iteration ${iteration + 1}: could not generate fix recommendation`);
      break;
    }

    // Quality gate: confidence + has changes
    if (!fixApplier.canApply(fixRecommendation)) {
      core.info(
        `Iteration ${iteration + 1}: fix rejected — confidence below threshold or no changes proposed`
      );
      break;
    }

    // Quality gate (iterations 2+): reject if this fix duplicates ANY prior failed attempt
    const fingerprint = fixFingerprint(fixRecommendation);
    if (failedFixFingerprints.has(fingerprint)) {
      core.warning(
        `Iteration ${iteration + 1}: repair agent proposed a fix identical to a previous failed attempt. Stopping.`
      );
      break;
    }

    core.info(
      `Iteration ${iteration + 1}: fix passed quality gates (confidence: ${fixRecommendation.confidence}%, changes: ${fixRecommendation.proposedChanges.length})`
    );

    // 2. Apply fix (create branch on first iteration, reset + reapply on subsequent)
    if (iteration === 0) {
      autoFixResult = await fixApplier.applyFix(fixRecommendation);
    } else if (autoFixResult?.branchName) {
      autoFixResult = await fixApplier.reapplyFix(
        fixRecommendation,
        autoFixResult.branchName
      );
    }

    if (!autoFixResult?.success || !autoFixResult.branchName) {
      core.warning(`Iteration ${iteration + 1}: failed to apply fix — ${autoFixResult?.error}`);
      break;
    }

    core.info(`✅ Fix applied to branch: ${autoFixResult.branchName}`);

    // 3. Trigger validation
    const spec =
      inputs.validationSpec ||
      (errorData as { fileName?: string }).fileName ||
      fixRecommendation.proposedChanges[0]?.file;
    const previewUrl =
      inputs.validationPreviewUrl || DEFAULT_PRODUCT_URL;

    if (!spec) {
      core.warning('No spec file identified for validation');
      autoFixResult.validationStatus = 'skipped';
      break;
    }

    const validationTrigger = await fixApplier.triggerValidation({
      branch: autoFixResult.branchName,
      spec,
      previewUrl,
      triageRunId: github.context.runId.toString(),
      testCommand: inputs.validationTestCommand,
    });

    if (!validationTrigger?.runId) {
      core.warning('Could not get validation run ID — cannot poll for results');
      autoFixResult.validationStatus = 'pending';
      if (validationTrigger?.url) autoFixResult.validationUrl = validationTrigger.url;
      break;
    }

    autoFixResult.validationRunId = validationTrigger.runId;
    autoFixResult.validationUrl = validationTrigger.url;

    // 4. Wait for validation to complete
    core.info(`\n🧪 Waiting for validation run ${validationTrigger.runId}...`);
    const outcome: ValidationOutcome = await fixApplier.waitForValidation(
      validationTrigger.runId
    );

    if (outcome.passed) {
      core.info(
        `\n✅ Validation PASSED on iteration ${iteration + 1}! PR will be created by validate-fix workflow.`
      );
      autoFixResult.validationStatus = 'passed';
      autoFixResult.validationUrl = outcome.url || autoFixResult.validationUrl;
      return { fixRecommendation, autoFixResult };
    }

    // 5. Validation failed — record fingerprint and prepare feedback for next iteration
    core.warning(
      `\n❌ Validation FAILED on iteration ${iteration + 1} (conclusion: ${outcome.conclusion})`
    );
    autoFixResult.validationStatus = 'failed';
    failedFixFingerprints.add(fingerprint);

    if (iteration < maxIterations - 1) {
      core.info('Feeding failure logs back into repair agent for next attempt...');
      previousAttempt = {
        iteration: iteration + 1,
        previousFix: fixRecommendation,
        validationLogs: outcome.logs || 'No logs available',
      };
    } else {
      core.warning(
        `\n🛑 All ${maxIterations} fix attempts exhausted. Giving up.`
      );
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
    baseBranch: inputs.autoFixBaseBranch || 'main',
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
  autoFixResult?: ApplyResult | null
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
    core.setOutput('validation_status', 'skipped');
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

      // Log validation status
      if (autoFixResult.validationRunId) {
        core.info(`\n🧪 Validation: ${autoFixResult.validationStatus}`);
        core.info(`  Run ID: ${autoFixResult.validationRunId}`);
        core.info(
          `  URL: ${
            autoFixResult.validationUrl ||
            `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${autoFixResult.validationRunId}`
          }`
        );
        core.info(
          '\n👉 Validation was triggered. Any PR creation must happen in your downstream workflow or be done manually.'
        );
      } else if (autoFixResult.validationStatus === 'pending') {
        core.info('\n🧪 Validation: pending');
        if (autoFixResult.validationUrl) {
          core.info(`  URL: ${autoFixResult.validationUrl}`);
        } else {
          core.info('  Run ID / URL not available yet');
        }
        core.info(
          '\n👉 Validation was triggered. Any PR creation must happen in your downstream workflow or be done manually.'
        );
      } else {
        core.info(
          '\n👉 To create a PR, visit your repository and open a PR from the branch above.'
        );
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
