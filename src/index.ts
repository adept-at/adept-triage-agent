import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { analyzeFailure, extractErrorFromLogs } from './simplified-analyzer';
import { OpenAIClient } from './openai-client';
import { ArtifactFetcher } from './artifact-fetcher';
import { ErrorData, ActionInputs, Screenshot, FixRecommendation } from './types';
import { buildRepairContext } from './repair-context';
import { SimplifiedRepairAgent } from './repair/simplified-repair-agent';

async function run(): Promise<void> {
  try {
    // Get inputs
    const inputs = getInputs();
    
    // Initialize clients
    const octokit = new Octokit({ auth: inputs.githubToken });
    const repoDetails = resolveRepository(inputs);
    const openaiClient = new OpenAIClient(inputs.openaiApiKey);
    const artifactFetcher = new ArtifactFetcher(octokit);
    
    // Get error data
    const errorData = await getErrorData(octokit, artifactFetcher, inputs, repoDetails);
    
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
    
    // Generate fix recommendation for TEST_ISSUE verdicts
    let fixRecommendation: FixRecommendation | null = null;
    if (result.verdict === 'TEST_ISSUE') {
      try {
        core.info('\n🔧 Attempting to generate fix recommendation...');
        
        // Build repair context from error data
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
          targetAppPrNumber: inputs.prNumber // Assuming same for now
        });
        
        // Initialize simplified repair agent
        const repairAgent = new SimplifiedRepairAgent(inputs.openaiApiKey);
        // Pass both repair context AND the full error data for complete context
        fixRecommendation = await repairAgent.generateFixRecommendation(repairContext, errorData);
        
        if (fixRecommendation) {
          core.info(`✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`);
          result.fixRecommendation = fixRecommendation;
        } else {
          core.info('❌ Could not generate fix recommendation');
        }
      } catch (error) {
        core.warning(`Failed to generate fix recommendation: ${error}`);
      }
    }
    
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
      ...(result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations ? { suggestedSourceLocations: result.suggestedSourceLocations } : {}),
      ...(result.verdict === 'TEST_ISSUE' && result.fixRecommendation ? { fixRecommendation: result.fixRecommendation } : {}),
      metadata: {
        analyzedAt: new Date().toISOString(),
        hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
        logSize: errorData.logs?.join('').length || 0,
        hasFixRecommendation: !!result.fixRecommendation
      }
    };
    
    // Set outputs
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

async function getErrorData(
  octokit: Octokit,
  artifactFetcher: ArtifactFetcher,
  inputs: ActionInputs,
  repoDetails: { owner: string; repo: string }
): Promise<ErrorData | null> {
  const context = github.context;
  const { owner, repo } = repoDetails;
  
  // If direct error message is provided, use it
  if (inputs.errorMessage) {
    const errorData: ErrorData = {
      message: inputs.errorMessage,
      framework: 'unknown',
      context: 'Error message provided directly via input'
    };
    
    return errorData;
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
    screenshots = await artifactFetcher.fetchScreenshots(runId, failedJob.name, repoDetails);
    core.info(`Found ${screenshots.length} screenshots`);
  } catch (error) {
    core.warning(`Failed to fetch screenshots: ${error}`);
    // Continue with empty screenshots array
  }
  
  // Fetch Cypress artifact logs independently
  try {
    artifactLogs = await artifactFetcher.fetchCypressArtifactLogs(runId, failedJob.name, repoDetails);
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
    const errorData: ErrorData = {
      ...extractedError,
      context: `Job: ${failedJob.name}. ${extractedError.context || 'Complete failure context including all logs and artifacts'}`,
      testName: extractedError.testName || failedJob.name,
      fileName: extractedError.fileName || failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
      screenshots: screenshots,
      logs: [combinedContext],
      // Cap artifact logs to avoid bloating the prompt
      cypressArtifactLogs: capArtifactLogs(artifactLogs),
      prDiff: prDiff || undefined
    };
    // Attach a minimal structured summary to improve prompt guidance
    errorData.structuredSummary = buildStructuredSummary(errorData);
    return errorData;
  }
  
  // Fallback if no error could be extracted
  const fallbackError: ErrorData = {
    message: 'Test failure - see full context for details',
    framework: 'cypress',
    failureType: 'test-failure',
    context: `Job: ${failedJob.name}. Complete failure context including all logs and artifacts`,
    testName: failedJob.name,
    fileName: failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
    screenshots: screenshots,
    logs: [combinedContext],
    cypressArtifactLogs: capArtifactLogs(artifactLogs),
    prDiff: prDiff || undefined
  };
  // Attach a minimal structured summary here as well
  fallbackError.structuredSummary = buildStructuredSummary(fallbackError);
  return fallbackError;
}

// Export for testing
export { run };

// Run the action if this is the main module
if (require.main === module) {
  run();
}

// Helper: cap potentially large artifact logs and focus on error slices
function capArtifactLogs(raw: string): string {
  if (!raw) return '';
  const MAX = 20000; // 20KB soft cap
  // Build the ANSI escape regex at runtime to avoid linter's control-regex warning
  const esc = String.fromCharCode(27);
  const ansiPattern = new RegExp(`${esc}\\[[0-9;]*m`, 'g');
  const clean = raw.replace(ansiPattern, '');
  if (clean.length <= MAX) return clean;

  // Try to focus around error-like lines
  const lines = clean.split('\n');
  const errorRegex = /(error|failed|failure|exception|assertion|expected|timeout|cypress error)/i;
  const focused: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (errorRegex.test(lines[i])) {
      const start = Math.max(0, i - 10);
      const end = Math.min(lines.length, i + 10);
      focused.push(...lines.slice(start, end));
    }
  }
  const uniqueFocused = Array.from(new Set(focused));
  const focusedJoined = uniqueFocused.join('\n');
  if (focusedJoined.length > 1000) {
    return `${focusedJoined.substring(0, 10000)}\n\n[Artifact logs truncated]`;
  }

  // Fallback: head and tail
  const head = clean.substring(0, Math.floor(MAX / 2));
  const tail = clean.substring(clean.length - Math.floor(MAX / 2));
  return `${head}\n\n[...truncated...]\n\n${tail}`;
}

// Helper: derive a minimal StructuredErrorSummary from existing ErrorData
function buildStructuredSummary(err: ErrorData): import('./types').StructuredErrorSummary {
  const hasTimeout = /\btimeout|timed out\b/i.test(err.message || '');
  const hasAssertion = /assertion|expected\s+.*to/i.test(err.message || '');
  const hasDom = /element|selector|not found|visible|covered|detached/i.test(err.message || '');
  const hasNetwork = /network|fetch|graphql|api|500|404|502|503/i.test(err.message || '');
  const hasNullPtr = /cannot read (properties|property) of null|undefined/i.test(err.message || '');

  return {
    primaryError: {
      type: err.failureType || 'Error',
      message: (err.message || '').slice(0, 500)
    },
    testContext: {
      testName: err.testName || 'unknown',
      testFile: err.fileName || 'unknown',
      framework: err.framework || 'unknown'
    },
    failureIndicators: {
      hasNetworkErrors: hasNetwork,
      hasNullPointerErrors: hasNullPtr,
      hasTimeoutErrors: hasTimeout,
      hasDOMErrors: hasDom,
      hasAssertionErrors: hasAssertion,
      isMobileTest: false,
      hasLongTimeout: hasTimeout,
      hasAltTextSelector: /\[alt=/.test(err.message || ''),
      hasElementExistenceCheck: /expected to find|never found/i.test(err.message || ''),
      hasVisibilityIssue: /not visible|covered|hidden/i.test(err.message || ''),
      hasViewportContext: false
    },
    keyMetrics: {
      hasScreenshots: !!(err.screenshots && err.screenshots.length > 0),
      logSize: err.logs?.join('').length || 0
    }
  } as import('./types').StructuredErrorSummary;
}