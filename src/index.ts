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
    const errorData = await processWorkflowLogs(octokit, artifactFetcher, inputs, repoDetails);

    if (!errorData) {
      // Check if this is due to workflow still running
      const context = github.context;
      const { owner, repo } = context.repo;
      const runId = inputs.workflowRunId || context.runId.toString();

      try {
        const workflowRun = await octokit.actions.getWorkflowRun({
          owner,
          repo,
          run_id: parseInt(runId, 10)
        });

        if (workflowRun.data.status !== 'completed') {
          core.warning(`Workflow run ${runId} is still in progress (status: ${workflowRun.data.status})`);
          const pendingTriageJson = {
            verdict: 'PENDING',
            confidence: 0,
            reasoning: 'Workflow is still running. Please wait for it to complete before running triage analysis.',
            summary: 'Analysis pending - workflow not completed',
            indicators: [],
            metadata: {
              analyzedAt: new Date().toISOString(),
              workflowStatus: workflowRun.data.status
            }
          };
          core.setOutput('verdict', 'PENDING');
          core.setOutput('confidence', '0');
          core.setOutput('reasoning', 'Workflow is still running. Please wait for it to complete before running triage analysis.');
          core.setOutput('summary', 'Analysis pending - workflow not completed');
          core.setOutput('triage_json', JSON.stringify(pendingTriageJson));
          return;
        }
      } catch (error) {
        core.debug(`Error checking workflow status: ${error}`);
      }

      core.setFailed('No error data found to analyze');
      return;
    }

    // Analyze with AI
    const result = await analyzeFailure(openaiClient, errorData);

    // Generate fix recommendation for TEST_ISSUE verdicts
    let fixRecommendation: FixRecommendation | null = null;
    if (result.verdict === 'TEST_ISSUE') {
      fixRecommendation = await generateFixRecommendation(inputs, repoDetails, errorData, openaiClient);
      if (fixRecommendation) {
        result.fixRecommendation = fixRecommendation;
      }
    }

    // Check confidence threshold
    if (result.confidence < inputs.confidenceThreshold) {
      core.warning(`Confidence ${result.confidence}% is below threshold ${inputs.confidenceThreshold}%`);
      setInconclusiveOutput(result, inputs, errorData);
      return;
    }

    // Set successful outputs
    setSuccessOutput(result, errorData);

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

function getInputs(): ActionInputs {
  const repositoryInput = core.getInput('REPOSITORY');
  return {
    githubToken: core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN || '',
    openaiApiKey: core.getInput('OPENAI_API_KEY', { required: true }),
    errorMessage: core.getInput('ERROR_MESSAGE'),
    workflowRunId: core.getInput('WORKFLOW_RUN_ID'),
    jobName: core.getInput('JOB_NAME'),
    confidenceThreshold: parseInt(core.getInput('CONFIDENCE_THRESHOLD') || '70', 10),
    prNumber: core.getInput('PR_NUMBER'),
    commitSha: core.getInput('COMMIT_SHA'),
    repository: repositoryInput ? repositoryInput.trim() : undefined,
    testFrameworks: core.getInput('TEST_FRAMEWORKS')
  };
}

function resolveRepository(inputs: ActionInputs): { owner: string; repo: string } {
  if (inputs.repository) {
    const cleaned = inputs.repository.replace(/\.git$/i, '').trim();
    const parts = cleaned.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
    core.warning(`Invalid repository input '${inputs.repository}'. Falling back to current repository context.`);
  }
  return github.context.repo;
}

async function generateFixRecommendation(
  inputs: ActionInputs,
  repoDetails: { owner: string; repo: string },
  errorData: { message: string; testName?: string; fileName?: string },
  openaiClient: OpenAIClient
): Promise<FixRecommendation | null> {
  try {
    core.info('\n🔧 Attempting to generate fix recommendation...');

    const repairContext = buildRepairContext({
      testFile: errorData.fileName || 'unknown',
      testName: errorData.testName || 'unknown',
      errorMessage: errorData.message,
      workflowRunId: inputs.workflowRunId || github.context.runId.toString(),
      jobName: inputs.jobName || 'unknown',
      commitSha: inputs.commitSha || github.context.sha,
      branch: github.context.ref.replace('refs/heads/', ''),
      repository: inputs.repository || `${repoDetails.owner}/${repoDetails.repo}`,
      prNumber: inputs.prNumber,
      targetAppPrNumber: inputs.prNumber
    });

    // Initialize repair agent with shared OpenAI client
    const repairAgent = new SimplifiedRepairAgent(openaiClient);
    const recommendation = await repairAgent.generateFixRecommendation(repairContext, errorData as import('./types').ErrorData);

    if (recommendation) {
      core.info(`✅ Fix recommendation generated with ${recommendation.confidence}% confidence`);
    } else {
      core.info('❌ Could not generate fix recommendation');
    }
    return recommendation;
  } catch (error) {
    core.warning(`Failed to generate fix recommendation: ${error}`);
    return null;
  }
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
      hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
      logSize: errorData.logs?.join('').length || 0
    }
  };
  core.setOutput('verdict', 'INCONCLUSIVE');
  core.setOutput('confidence', result.confidence.toString());
  core.setOutput('reasoning', `Low confidence: ${result.reasoning}`);
  core.setOutput('summary', 'Analysis inconclusive due to low confidence');
  core.setOutput('triage_json', JSON.stringify(inconclusiveTriageJson));
}

function setSuccessOutput(
  result: {
    verdict: string;
    confidence: number;
    reasoning: string;
    summary?: string;
    indicators?: string[];
    suggestedSourceLocations?: { file: string; lines: string; reason: string }[];
    fixRecommendation?: FixRecommendation;
  },
  errorData: { screenshots?: Array<{ name: string }>; logs?: string[] }
): void {
  const triageJson = {
    verdict: result.verdict,
    confidence: result.confidence,
    reasoning: result.reasoning,
    summary: result.summary,
    indicators: result.indicators || [],
    ...(result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations ? { suggestedSourceLocations: result.suggestedSourceLocations } : {}),
    ...(result.verdict === 'TEST_ISSUE' && result.fixRecommendation ? { fixRecommendation: result.fixRecommendation } : {}),
    metadata: {
      analyzedAt: new Date().toISOString(),
      hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
      logSize: errorData.logs?.join('').length || 0,
      hasFixRecommendation: !!result.fixRecommendation
    }
  };

  core.setOutput('verdict', result.verdict);
  core.setOutput('confidence', result.confidence.toString());
  core.setOutput('reasoning', result.reasoning);
  core.setOutput('summary', result.summary);
  core.setOutput('triage_json', JSON.stringify(triageJson));

  // Add fix recommendation outputs if available
  if (result.fixRecommendation) {
    core.setOutput('has_fix_recommendation', 'true');
    core.setOutput('fix_recommendation', JSON.stringify(result.fixRecommendation));
    core.setOutput('fix_summary', result.fixRecommendation.summary);
    core.setOutput('fix_confidence', result.fixRecommendation.confidence.toString());
  } else {
    core.setOutput('has_fix_recommendation', 'false');
  }

  // Log results
  core.info(`Verdict: ${result.verdict}`);
  core.info(`Confidence: ${result.confidence}%`);
  core.info(`Summary: ${result.summary}`);

  // Log suggested source locations for PRODUCT_ISSUE
  if (result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations && result.suggestedSourceLocations.length > 0) {
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
    core.info(`  Changes: ${result.fixRecommendation.proposedChanges.length} file(s)`);
    core.info(`  Evidence: ${result.fixRecommendation.evidence.length} item(s)`);
    core.info('\n📝 Fix Summary:');
    core.info(result.fixRecommendation.summary);
  }
}

// Export for testing
export { run };

// Run the action if this is the main module
if (require.main === module) {
  run();
}
