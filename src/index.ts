import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { analyzeFailure, extractErrorFromLogs } from './analyzer';
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
          // Exit with success since this is an expected state, not an error
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
    
    // Check confidence threshold
    if (result.confidence < inputs.confidenceThreshold) {
      core.warning(`Confidence ${result.confidence}% is below threshold ${inputs.confidenceThreshold}%`);
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
      return;
    }
    
    // Create triage JSON output
    const triageJson = {
      verdict: result.verdict,
      confidence: result.confidence,
      reasoning: result.reasoning,
      summary: result.summary,
      indicators: result.indicators || [],
      metadata: {
        analyzedAt: new Date().toISOString(),
        hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
        logSize: errorData.logs?.join('').length || 0
      }
    };
    
    // Set outputs
    core.setOutput('verdict', result.verdict);
    core.setOutput('confidence', result.confidence.toString());
    core.setOutput('reasoning', result.reasoning);
    core.setOutput('summary', result.summary);
    core.setOutput('triage_json', JSON.stringify(triageJson));
    
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
    confidenceThreshold: parseInt(core.getInput('CONFIDENCE_THRESHOLD') || '70', 10),
    prNumber: core.getInput('PR_NUMBER'),
    commitSha: core.getInput('COMMIT_SHA'),
    repository: core.getInput('REPOSITORY')
  };
}

async function getErrorData(
  octokit: Octokit,
  artifactFetcher: ArtifactFetcher,
  inputs: ActionInputs
): Promise<ErrorData | null> {
  const context = github.context;
  const { owner, repo } = context.repo;
  
  // If direct error message is provided, use it
  if (inputs.errorMessage) {
    return {
      message: inputs.errorMessage,
      framework: 'unknown',
      context: 'Error message provided directly via input'
    };
  }
  
  // Determine the workflow run ID
  let runId = inputs.workflowRunId;
  
  // Check for workflow_run event
  if (!runId && context.payload.workflow_run) {
    runId = context.payload.workflow_run.id.toString();
  }
  
  // Fall back to current run ID
  if (!runId) {
    runId = context.runId.toString();
  }
  
  // Special handling for current job analysis
  const isCurrentJob = inputs.jobName && (inputs.jobName === context.job || inputs.jobName.includes(context.job));
  
  // Check if workflow is completed when analyzing a different workflow
  if (!isCurrentJob && (inputs.workflowRunId || context.payload.workflow_run)) {
    const workflowRun = await octokit.actions.getWorkflowRun({
      owner,
      repo,
      run_id: parseInt(runId, 10)
    });
    
    if (workflowRun.data.status !== 'completed') {
      core.warning('Workflow run is not completed yet');
      return null;
    }
  } else if (isCurrentJob) {
    core.info(`Analyzing current job: ${inputs.jobName} (workflow still in progress)`);
  }
  
  // Get the failed job
  const jobs = await octokit.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: parseInt(runId, 10),
    filter: 'latest'
  });
  
  let targetJob;
  
  if (inputs.jobName) {
    // Look for specific job by name
    targetJob = jobs.data.jobs.find(job => job.name === inputs.jobName);
    if (!targetJob) {
      core.warning(`Job '${inputs.jobName}' not found`);
      return null;
    }
    
    // For current job, we might not have a conclusion yet
    if (isCurrentJob && targetJob.status === 'in_progress') {
      core.info('Current job is still in progress, analyzing available logs...');
    } else if (targetJob.conclusion !== 'failure' && targetJob.status === 'completed') {
      core.warning(`Job '${inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion})`);
      return null;
    }
  } else {
    // Look for any failed job
    targetJob = jobs.data.jobs.find(job => job.conclusion === 'failure');
    if (!targetJob) {
      core.warning('No failed jobs found');
      return null;
    }
  }
  
  const failedJob = targetJob;
  core.info(`Analyzing job: ${failedJob.name} (status: ${failedJob.status}, conclusion: ${failedJob.conclusion || 'none'})`);
  
  // Get job logs for error extraction only
  let fullLogs = '';
  let extractedError: ErrorData | null = null;
  try {
    const logsResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: failedJob.id
    });
    fullLogs = logsResponse.data as unknown as string;
    core.info(`Downloaded ${fullLogs.length} characters of logs for error extraction`);
    
    // Extract structured error from logs immediately
    extractedError = extractErrorFromLogs(fullLogs);
    
    // If we have a PR diff coming, limit the GitHub logs to just the extracted error context
    if (inputs.prNumber && extractedError) {
      // We'll use the extracted error context instead of full logs
      core.info('PR diff available - using extracted error context only');
    }
  } catch (error) {
    core.warning(`Failed to download job logs: ${error}`);
  }
  
  // Get ALL artifacts - screenshots and logs
  let artifactLogs = '';
  let screenshots: Screenshot[] = [];
  
  // Fetch screenshots independently
  try {
    screenshots = await artifactFetcher.fetchScreenshots(runId, failedJob.name);
    core.info(`Found ${screenshots.length} screenshots`);
  } catch (error) {
    core.warning(`Failed to fetch screenshots: ${error}`);
    // Continue with empty screenshots array
  }
  
  // Fetch Cypress artifact logs independently
  try {
    artifactLogs = await artifactFetcher.fetchCypressArtifactLogs(runId, failedJob.name);
    if (artifactLogs) {
      core.info(`Found Cypress artifact logs (${artifactLogs.length} characters)`);
    }
  } catch (error) {
    core.warning(`Failed to fetch Cypress artifact logs: ${error}`);
    // Continue with empty artifact logs
  }
  
  // Fetch PR diff if PR number is provided
  let prDiff = null;
  if (inputs.prNumber) {
    try {
      prDiff = await artifactFetcher.fetchPRDiff(inputs.prNumber, inputs.repository);
      if (prDiff) {
        core.info(`Successfully fetched PR diff with ${prDiff.totalChanges} changed files`);
      }
    } catch (error) {
      core.warning(`Failed to fetch PR diff: ${error}`);
    }
  }
  
  // Build optimized context based on available data
  const contextParts: string[] = [
    `=== JOB INFORMATION ===`,
    `Job Name: ${failedJob.name}`,
    `Job URL: ${failedJob.html_url}`,
    `Failed Step: ${failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown'}`,
    ``
  ];

  // If we have extracted error, include it prominently
  if (extractedError && extractedError.message) {
    contextParts.push(
      `=== EXTRACTED ERROR CONTEXT ===`,
      extractedError.message,
      ``
    );
  }

  // Always include Cypress artifact logs if available
  if (artifactLogs) {
    contextParts.push(
      `=== CYPRESS ARTIFACT LOGS ===`,
      artifactLogs,
      ``
    );
  }

  // Include GitHub Actions logs only if:
  // 1. No PR diff is available (we have more token budget)
  // 2. OR no error was extracted (we need the full context)
  // 3. Limit to last 50KB if including to save tokens
  if (!inputs.prNumber || !extractedError) {
    const maxLogSize = 50000; // 50KB limit for GitHub logs when included
    const truncatedLogs = fullLogs.length > maxLogSize 
      ? `${fullLogs.substring(fullLogs.length - maxLogSize)}\n\n[Logs truncated to last ${maxLogSize} characters]`
      : fullLogs;
    
    contextParts.push(
      `=== GITHUB ACTIONS LOGS (TRUNCATED) ===`,
      truncatedLogs,
      ``
    );
  }

  contextParts.push(`=== END OF LOGS ===`);
  const combinedContext = contextParts.join('\n');
  
  // Validate we have at least some meaningful data
  const hasLogs = !!(fullLogs && fullLogs.length > 0);
  const hasScreenshots = !!(screenshots && screenshots.length > 0);
  const hasArtifactLogs = !!(artifactLogs && artifactLogs.length > 0);
  const hasPRDiff = !!(prDiff && prDiff.files && prDiff.files.length > 0);
  
  if (!hasLogs && !hasScreenshots && !hasArtifactLogs && !hasPRDiff) {
    core.warning('No meaningful data collected for analysis (no logs, screenshots, artifacts, or PR diff)');
    core.info('Attempting analysis with minimal context...');
  } else {
    core.info(`Data collected for analysis: logs=${hasLogs}, screenshots=${hasScreenshots}, artifactLogs=${hasArtifactLogs}, prDiff=${hasPRDiff}`);
  }
  
  // Create error data object, using extracted error if available
  if (extractedError) {
    return {
      ...extractedError,
      context: `Job: ${failedJob.name}. ${extractedError.context || 'Complete failure context including all logs and artifacts'}`,
      testName: extractedError.testName || failedJob.name,
      fileName: extractedError.fileName || failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
      screenshots: screenshots,
      logs: [combinedContext],
      cypressArtifactLogs: artifactLogs,
      prDiff: prDiff || undefined
    };
  }
  
  // Fallback if no error could be extracted
  return {
    message: 'Test failure - see full context for details',
    framework: 'cypress',
    failureType: 'test-failure',
    context: `Job: ${failedJob.name}. Complete failure context including all logs and artifacts`,
    testName: failedJob.name,
    fileName: failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
    screenshots: screenshots,
    logs: [combinedContext],
    cypressArtifactLogs: artifactLogs,
    prDiff: prDiff || undefined
  };
}

// Export for testing
export { run };

// Run the action if this is the main module
if (require.main === module) {
  run();
}