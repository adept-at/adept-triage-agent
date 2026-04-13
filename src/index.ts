import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from './openai-client';
import { ArtifactFetcher } from './artifact-fetcher';
import { ActionInputs } from './types';
import { AUTO_FIX, CURSOR_CLOUD, DEFAULT_PRODUCT_REPO } from './config/constants';
import { parseRepoString } from './utils/repo-utils';
import { PipelineCoordinator } from './pipeline/coordinator';

export { fixFingerprint } from './pipeline/validator';
export { setSuccessOutput, setInconclusiveOutput, setErrorOutput, resolveAutoFixTargetRepo } from './pipeline/output';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    if (inputs.cursorApiKey) {
      core.setSecret(inputs.cursorApiKey);
    }
    if (inputs.triageAwsAccessKeyId) {
      core.setSecret(inputs.triageAwsAccessKeyId);
    }
    if (inputs.triageAwsSecretAccessKey) {
      core.setSecret(inputs.triageAwsSecretAccessKey);
    }
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
    // DynamoDB skill store inputs
    triageAwsAccessKeyId: core.getInput('TRIAGE_AWS_ACCESS_KEY_ID') || undefined,
    triageAwsSecretAccessKey: core.getInput('TRIAGE_AWS_SECRET_ACCESS_KEY') || undefined,
    triageAwsRegion: core.getInput('TRIAGE_AWS_REGION') || 'us-east-1',
    triageDynamoTable: core.getInput('TRIAGE_DYNAMO_TABLE') || 'triage-skills-v1-live',
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
