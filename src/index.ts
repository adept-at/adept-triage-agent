import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { analyzeFailure } from './analyzer';
import { OpenAIClient } from './openai-client';
import { ArtifactFetcher } from './artifact-fetcher';
import { ErrorData, ActionInputs, Screenshot } from './types';

async function run(): Promise<void> {
  try {
    // Get inputs
    const inputs = getInputs();
    
    // Initialize clients
    const octokit = new Octokit({ auth: inputs.githubToken });
    const openaiClient = new OpenAIClient(inputs.openaiApiKey);
    const artifactFetcher = new ArtifactFetcher(octokit);
    
    // Get error data
    const errorData = await getErrorData(octokit, artifactFetcher, inputs);
    
    if (!errorData) {
      core.setFailed('No error data found to analyze');
      return;
    }
    
    // Analyze with AI
    const result = await analyzeFailure(openaiClient, errorData);
    
    // Check confidence threshold
    if (result.confidence < inputs.confidenceThreshold) {
      core.warning(`Confidence ${result.confidence}% is below threshold ${inputs.confidenceThreshold}%`);
      core.setOutput('verdict', 'INCONCLUSIVE');
      core.setOutput('confidence', result.confidence.toString());
      core.setOutput('reasoning', `Low confidence: ${result.reasoning}`);
      core.setOutput('summary', 'Analysis inconclusive due to low confidence');
      return;
    }
    
    // Set outputs
    core.setOutput('verdict', result.verdict);
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', result.reasoning);
    core.setOutput('summary', result.summary);
    
    // Log results
    core.info(`Verdict: ${result.verdict}`);
    core.info(`Confidence: ${result.confidence}%`);
    core.info(`Summary: ${result.summary}`);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

function getInputs(): ActionInputs {
  return {
    githubToken: core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN || '',
    openaiApiKey: core.getInput('OPENAI_API_KEY', { required: true }),
    errorMessage: core.getInput('ERROR_MESSAGE'),
    workflowRunId: core.getInput('WORKFLOW_RUN_ID'),
    jobName: core.getInput('JOB_NAME'),
    confidenceThreshold: parseInt(core.getInput('CONFIDENCE_THRESHOLD') || '70', 10)
  };
}

async function getErrorData(octokit: Octokit, artifactFetcher: ArtifactFetcher, inputs: ActionInputs): Promise<ErrorData | null> {
  const context = github.context;
  
  if (inputs.errorMessage) {
    // Direct error message provided
    return {
      message: inputs.errorMessage,
      framework: 'unknown',
      context: 'Error message provided directly via input'
    };
  }
  
  // Get workflow context
  const runId = context.runId.toString();
  const { owner, repo } = context.repo;
  
  // Get the failed job
  const jobs = await octokit.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: parseInt(runId, 10),
    filter: 'latest'
  });
  
  const failedJob = jobs.data.jobs.find(job => job.conclusion === 'failure');
  if (!failedJob) {
    core.warning('No failed job found in workflow');
    return null;
  }
  
  core.info(`Analyzing failed job: ${failedJob.name}`);
  
  // Get ALL job logs - no filtering
  let fullLogs = '';
  try {
    const logsResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: failedJob.id
    });
    fullLogs = logsResponse.data as unknown as string;
    core.info(`Downloaded ${fullLogs.length} characters of logs`);
  } catch (error) {
    core.warning(`Failed to download job logs: ${error}`);
  }
  
  // Get ALL artifacts - screenshots and logs
  let artifactLogs = '';
  let screenshots: Screenshot[] = [];
  
  try {
    // Fetch screenshots
    screenshots = await artifactFetcher.fetchScreenshots(runId, failedJob.name);
    core.info(`Found ${screenshots.length} screenshots`);
    
    // Fetch Cypress artifact logs
    artifactLogs = await artifactFetcher.fetchCypressArtifactLogs(runId, failedJob.name);
    if (artifactLogs) {
      core.info(`Found Cypress artifact logs (${artifactLogs.length} characters)`);
    }
  } catch (error) {
    core.warning(`Failed to fetch artifacts: ${error}`);
  }
  
  // Combine EVERYTHING into one context blob
  const combinedContext = [
    `=== JOB INFORMATION ===`,
    `Job Name: ${failedJob.name}`,
    `Job URL: ${failedJob.html_url}`,
    `Failed Step: ${failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown'}`,
    ``,
    `=== GITHUB ACTIONS LOGS ===`,
    fullLogs,
    ``,
    `=== CYPRESS ARTIFACT LOGS ===`,
    artifactLogs || 'No Cypress logs found',
    ``,
    `=== END OF LOGS ===`
  ].join('\n');
  
  // Create a simple error data object with ALL context
  return {
    message: 'Test failure - see full context for details',
    framework: 'cypress',
    failureType: 'test-failure',
    context: 'Complete failure context including all logs and artifacts',
    testName: failedJob.name,
    fileName: failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
    screenshots: screenshots,
    logs: [combinedContext],
    cypressArtifactLogs: artifactLogs
  };
}

// Export for testing
export { run };

// Run the action if this is the main module
if (require.main === module) {
  run();
} 