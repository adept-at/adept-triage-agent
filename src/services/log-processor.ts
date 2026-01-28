/**
 * Log processing service
 * Extracts error data from workflow logs and builds error context
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import { ErrorData, Screenshot, StructuredErrorSummary, PRDiff, ActionInputs } from '../types';
import { ArtifactFetcher } from '../artifact-fetcher';
import { extractErrorFromLogs } from '../simplified-analyzer';
import { LOG_LIMITS } from '../config/constants';

interface RepoDetails {
  owner: string;
  repo: string;
}

interface JobInfo {
  id: number;
  name: string;
  conclusion: string | null;
  status?: string;
  html_url: string;
  steps?: Array<{ name: string; conclusion: string | null }>;
}

/**
 * Processes workflow logs and extracts error data
 */
export async function processWorkflowLogs(
  octokit: Octokit,
  artifactFetcher: ArtifactFetcher,
  inputs: ActionInputs,
  repoDetails: RepoDetails
): Promise<ErrorData | null> {
  const context = github.context;
  const { owner, repo } = repoDetails;

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
  const isCurrentJob = !!(inputs.jobName && (inputs.jobName === context.job || inputs.jobName.includes(context.job)));

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

  const targetJob = findTargetJob(jobs.data.jobs as JobInfo[], inputs, isCurrentJob ?? false);
  if (!targetJob) {
    return null;
  }

  const failedJob = targetJob;
  core.info(`Analyzing job: ${failedJob.name} (status: ${failedJob.status}, conclusion: ${failedJob.conclusion || 'none'})`);

  // Get job logs for error extraction
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

    if (inputs.prNumber && extractedError) {
      core.info('PR diff available - using extracted error context only');
    }
  } catch (error) {
    core.warning(`Failed to download job logs: ${error}`);
  }

  // Fetch artifacts in parallel
  const [screenshots, artifactLogs, prDiff] = await fetchArtifactsParallel(
    artifactFetcher,
    runId,
    failedJob.name,
    repoDetails,
    inputs
  );

  // Build combined context
  const combinedContext = buildErrorContext(
    failedJob,
    extractedError,
    artifactLogs,
    fullLogs,
    inputs
  );

  // Validate we have meaningful data
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

  // Create error data object
  if (extractedError) {
    const errorData: ErrorData = {
      ...extractedError,
      context: `Job: ${failedJob.name}. ${extractedError.context || 'Complete failure context including all logs and artifacts'}`,
      testName: extractedError.testName || failedJob.name,
      fileName: extractedError.fileName || failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
      screenshots: screenshots,
      logs: [combinedContext],
      cypressArtifactLogs: capArtifactLogs(artifactLogs),
      prDiff: prDiff || undefined
    };
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
  fallbackError.structuredSummary = buildStructuredSummary(fallbackError);
  return fallbackError;
}

/**
 * Find the target job to analyze
 */
function findTargetJob(
  jobs: JobInfo[],
  inputs: ActionInputs,
  isCurrentJob: boolean | undefined
): JobInfo | null {
  if (inputs.jobName) {
    const targetJob = jobs.find(job => job.name === inputs.jobName);
    if (!targetJob) {
      core.warning(`Job '${inputs.jobName}' not found`);
      return null;
    }

    if (isCurrentJob && targetJob.status === 'in_progress') {
      core.info('Current job is still in progress, analyzing available logs...');
    } else if (targetJob.conclusion !== 'failure' && targetJob.status === 'completed') {
      core.warning(`Job '${inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion})`);
      return null;
    }
    return targetJob;
  }

  // Look for any failed job
  const failedJob = jobs.find(job => job.conclusion === 'failure');
  if (!failedJob) {
    core.warning('No failed jobs found');
    return null;
  }
  return failedJob;
}

/**
 * Helper to log diff results consistently
 */
function logDiffResult(diff: PRDiff | null, source: string): void {
  if (diff) {
    core.info(`✅ Successfully fetched ${source}:`);
    core.info(`   - Total files changed: ${diff.totalChanges}`);
    core.info(`   - Lines added: +${diff.additions}`);
    core.info(`   - Lines deleted: -${diff.deletions}`);
    if (diff.files.length > 0) {
      core.info(`   - Top files:`);
      diff.files.slice(0, 5).forEach(f => {
        core.info(`     • ${f.filename} (+${f.additions}/-${f.deletions})`);
      });
      if (diff.files.length > 5) {
        core.info(`     ... and ${diff.files.length - 5} more files`);
      }
    }
  }
}

/**
 * Fetch diff with fallback strategies:
 * 1. If PR number is provided, fetch PR diff
 * 2. If branch is provided and not main/master, fetch branch diff vs main
 * 3. If commit SHA is provided (production deploy), fetch commit diff
 */
async function fetchDiffWithFallback(
  artifactFetcher: ArtifactFetcher,
  inputs: ActionInputs
): Promise<PRDiff | null> {
  const mainBranches = ['main', 'master'];

  // Strategy 1: PR diff (highest priority - most specific)
  if (inputs.prNumber) {
    const prNum = inputs.prNumber;
    core.info(`📋 Fetching PR diff for PR #${prNum} from ${inputs.repository || 'current repo'}...`);
    try {
      const diff = await artifactFetcher.fetchPRDiff(prNum, inputs.repository);
      logDiffResult(diff, 'PR diff');
      if (diff) return diff;
      core.warning(`⚠️ PR diff fetch returned null for PR #${prNum}`);
    } catch (error) {
      core.warning(`❌ Failed to fetch PR diff for PR #${prNum}: ${error}`);
    }
  }

  // Strategy 2: Branch diff (for preview URL runs on feature branches)
  if (inputs.branch && !mainBranches.includes(inputs.branch.toLowerCase())) {
    core.info(`📋 Fetching branch diff: main...${inputs.branch} (preview URL mode)...`);
    try {
      const diff = await artifactFetcher.fetchBranchDiff(inputs.branch, 'main', inputs.repository);
      logDiffResult(diff, 'branch diff');
      if (diff) return diff;
      core.warning(`⚠️ Branch diff fetch returned null for ${inputs.branch}`);
    } catch (error) {
      core.warning(`❌ Failed to fetch branch diff for ${inputs.branch}: ${error}`);
    }
  }

  // Strategy 3: Commit diff (for production deploys on main)
  if (inputs.commitSha) {
    const isMainBranch = !inputs.branch || mainBranches.includes(inputs.branch.toLowerCase());
    if (isMainBranch) {
      core.info(`📋 Fetching commit diff for ${inputs.commitSha.substring(0, 7)} (production deploy mode)...`);
      try {
        const diff = await artifactFetcher.fetchCommitDiff(inputs.commitSha, inputs.repository);
        logDiffResult(diff, 'commit diff');
        if (diff) return diff;
        core.warning(`⚠️ Commit diff fetch returned null for ${inputs.commitSha.substring(0, 7)}`);
      } catch (error) {
        core.warning(`❌ Failed to fetch commit diff: ${error}`);
      }
    }
  }

  // No diff available
  if (!inputs.prNumber && !inputs.branch && !inputs.commitSha) {
    core.info(`ℹ️ No PR_NUMBER, BRANCH, or COMMIT_SHA provided, skipping diff fetch`);
  } else {
    core.info(`ℹ️ All diff fetch strategies exhausted, proceeding without diff`);
  }
  return null;
}

/**
 * Fetch all artifacts in parallel
 */
async function fetchArtifactsParallel(
  artifactFetcher: ArtifactFetcher,
  runId: string,
  jobName: string,
  repoDetails: RepoDetails,
  inputs: ActionInputs
): Promise<[Screenshot[], string, PRDiff | null]> {
  const screenshotsPromise = artifactFetcher
    .fetchScreenshots(runId, jobName, repoDetails)
    .then(screenshots => {
      core.info(`Found ${screenshots.length} screenshots`);
      return screenshots;
    })
    .catch(error => {
      core.warning(`Failed to fetch screenshots: ${error}`);
      return [] as Screenshot[];
    });

  const artifactLogsPromise = artifactFetcher
    .fetchCypressArtifactLogs(runId, jobName, repoDetails)
    .then(logs => {
      if (logs) {
        core.info(`Found Cypress artifact logs (${logs.length} characters)`);
      }
      return logs;
    })
    .catch(error => {
      core.warning(`Failed to fetch Cypress artifact logs: ${error}`);
      return '';
    });

  const prDiffPromise = fetchDiffWithFallback(artifactFetcher, inputs);

  return Promise.all([screenshotsPromise, artifactLogsPromise, prDiffPromise]);
}

/**
 * Build optimized error context
 */
function buildErrorContext(
  failedJob: JobInfo,
  extractedError: ErrorData | null,
  artifactLogs: string,
  fullLogs: string,
  inputs: ActionInputs
): string {
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

  // Include GitHub Actions logs based on available data
  if (!inputs.prNumber || !extractedError) {
    const maxLogSize = LOG_LIMITS.GITHUB_MAX_SIZE;
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
  return contextParts.join('\n');
}

/**
 * Cap potentially large artifact logs and focus on error slices
 */
export function capArtifactLogs(raw: string): string {
  if (!raw) return '';
  const MAX = LOG_LIMITS.ARTIFACT_SOFT_CAP;
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

/**
 * Build a minimal StructuredErrorSummary from existing ErrorData
 */
export function buildStructuredSummary(err: ErrorData): StructuredErrorSummary {
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
  } as StructuredErrorSummary;
}
