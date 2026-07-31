import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from './openai-client';
import { ArtifactFetcher } from './artifact-fetcher';
import { ActionInputs } from './types';
import { AUTO_FIX, DEFAULT_PRODUCT_REPO } from './config/constants';
import { parseRepoString } from './utils/repo-utils';
import { PipelineCoordinator } from './pipeline/coordinator';
import { setErrorOutput } from './pipeline/output';

export { fixFingerprint, requiredConfidence } from './pipeline/validator';
export { setSuccessOutput, setInconclusiveOutput, setErrorOutput, resolveAutoFixTargetRepo } from './pipeline/output';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const octokit = new Octokit({ auth: inputs.githubToken });
    const repoDetails = resolveRepository(inputs);
    const openaiClient = new OpenAIClient(inputs.openaiApiKey);
    const artifactFetcher = new ArtifactFetcher(octokit);

    const coordinator = new PipelineCoordinator({
      octokit, openaiClient, artifactFetcher, inputs, repoDetails,
    });
    await coordinator.execute();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred';
    setErrorOutput(errorMsg);
  }
}

function getInputs(): ActionInputs {
  const repositoryInput = core.getInput('REPOSITORY');
  const workflowRunIdInput = core.getInput('WORKFLOW_RUN_ID');
  const workflowRunAttemptInput = core.getInput('WORKFLOW_RUN_ATTEMPT');
  const workflowRunEventAttempt = github.context.payload.workflow_run?.run_attempt;
  const currentRunAttempt =
    !workflowRunIdInput && !github.context.payload.workflow_run
      ? process.env.GITHUB_RUN_ATTEMPT
      : undefined;
  return {
    githubToken:
      core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN || '',
    openaiApiKey: core.getInput('OPENAI_API_KEY', { required: true }),
    errorMessage: core.getInput('ERROR_MESSAGE'),
    errorFile: core.getInput('ERROR_FILE') || undefined,
    errorTestName: core.getInput('ERROR_TEST_NAME') || undefined,
    persistResults: core.getInput('PERSIST_RESULTS') !== 'false',
    workflowRunId: workflowRunIdInput,
    workflowRunAttempt: clampInt(
      workflowRunAttemptInput ||
        (workflowRunEventAttempt
          ? String(workflowRunEventAttempt)
          : currentRunAttempt),
      1,
      1,
      1000
    ),
    sourceRunGateRequired: workflowRunAttemptInput !== '',
    jobName: core.getInput('JOB_NAME'),
    confidenceThreshold: clampInt(
      core.getInput('CONFIDENCE_THRESHOLD'),
      70,
      0,
      100
    ),
    prNumber: core.getInput('PR_NUMBER'),
    commitSha: core.getInput('COMMIT_SHA'),
    repository: repositoryInput ? repositoryInput.trim() : undefined,
    testFrameworks: core.getInput('TEST_FRAMEWORKS'),
    enableAutoFix: core.getInput('ENABLE_AUTO_FIX') === 'true',
    autoFixBaseBranch: core.getInput('AUTO_FIX_BASE_BRANCH') || 'main',
    autoFixMinConfidence: clampInt(
      core.getInput('AUTO_FIX_MIN_CONFIDENCE'),
      AUTO_FIX.DEFAULT_MIN_CONFIDENCE,
      0,
      100
    ),
    autoFixTargetRepo: core.getInput('AUTO_FIX_TARGET_REPO') || undefined,
    branch: core.getInput('BRANCH') || undefined,
    // Validation inputs
    enableValidation: core.getInput('ENABLE_VALIDATION') === 'true',
    enableLocalValidation:
      core.getInput('ENABLE_LOCAL_VALIDATION') === 'true',
    validationWorkflow:
      core.getInput('VALIDATION_WORKFLOW') || 'validate-fix.yml',
    validationPreviewUrl: core.getInput('VALIDATION_PREVIEW_URL') || undefined,
    validationSpec: core.getInput('VALIDATION_SPEC') || undefined,
    validationTestCommand:
      core.getInput('VALIDATION_TEST_COMMAND') || undefined,
    npmToken: core.getInput('NPM_TOKEN') || undefined,
    // Product repo diff inputs
    productRepo: core.getInput('PRODUCT_REPO') || DEFAULT_PRODUCT_REPO,
    productDiffCommits: clampInt(core.getInput('PRODUCT_DIFF_COMMITS'), 5, 1, 50),
    triageAwsRegion: core.getInput('TRIAGE_AWS_REGION') || 'us-east-1',
    triageDynamoTable: core.getInput('TRIAGE_DYNAMO_TABLE') || 'triage-skills-v1-live',
    modelOverrideFixGen: core.getInput('MODEL_OVERRIDE_FIX_GEN') || undefined,
    modelOverrideReview: core.getInput('MODEL_OVERRIDE_REVIEW') || undefined,
  };
}

function resolveRepository(inputs: ActionInputs): {
  owner: string;
  repo: string;
} {
  return parseRepoString(inputs.repository, 'REPOSITORY');
}

// Export for testing
export { run };

/**
 * Safely parse an integer and clamp to a documented inclusive range.
 * Empty/invalid input falls back to defaultValue (already in range).
 */
function clampInt(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (!value || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  if (parsed < min || parsed > max) {
    core.warning(
      `Input value ${parsed} outside range [${min}, ${max}]; using ${defaultValue}`
    );
    return defaultValue;
  }
  return parsed;
}

// Run the action if this is the main module
if (require.main === module) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    setErrorOutput(`Fatal unhandled error: ${message}`);
  });
}
