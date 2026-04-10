import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from './openai-client';
import { ArtifactFetcher } from './artifact-fetcher';
import { ActionInputs, FixRecommendation } from './types';
import { ApplyResult } from './repair/fix-applier';
import { AUTO_FIX, CURSOR_CLOUD, DEFAULT_PRODUCT_REPO } from './config/constants';
import { parseRepoString } from './utils/repo-utils';
import { PipelineCoordinator } from './pipeline/coordinator';

export { fixFingerprint } from './pipeline/validator';

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

export function resolveAutoFixTargetRepo(inputs: ActionInputs): {
  owner: string;
  repo: string;
} {
  return parseRepoString(inputs.autoFixTargetRepo, 'AUTO_FIX_TARGET_REPO');
}

export function setInconclusiveOutput(
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

export function setErrorOutput(reason: string): void {
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

export function setSuccessOutput(
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
