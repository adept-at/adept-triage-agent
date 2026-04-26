/**
 * Fix Applier Implementation
 * Applies automated fixes to test code by creating branches and committing changes
 * Uses GitHub REST API (no local git repository required)
 */

import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import { FixRecommendation } from '../types';
import { AUTO_FIX } from '../config/constants';

/**
 * Result of applying a fix
 */
export interface ApplyResult {
  /** Whether the fix was successfully applied */
  success: boolean;
  /** Files that were modified */
  modifiedFiles: string[];
  /** Error message if fix failed */
  error?: string;
  /** Git commit SHA if committed */
  commitSha?: string;
  /** Branch name that was created */
  branchName?: string;
  /** Validation workflow run ID (if validation was triggered) */
  validationRunId?: number;
  /** Validation status */
  validationStatus?: 'pending' | 'passed' | 'failed' | 'skipped';
  /** Validation workflow URL (if available) */
  validationUrl?: string;
}

/**
 * Configuration for fix application
 */
export interface FixApplierConfig {
  /** Octokit instance for GitHub API calls */
  octokit: Octokit;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Base branch to create fix branch from */
  baseBranch: string;
  /** Minimum confidence threshold to apply fix */
  minConfidence: number;
  /** Enable validation workflow trigger after fix is applied */
  enableValidation?: boolean;
  /** Validation workflow file name (e.g., 'validate-fix.yml') */
  validationWorkflow?: string;
  /** Original test command template with {spec} and {url} placeholders */
  validationTestCommand?: string;
}

/**
 * Parameters for triggering validation
 */
export interface ValidationParams {
  /** Branch containing the fix */
  branch: string;
  /** Spec file to test */
  spec: string;
  /** Preview URL to test against */
  previewUrl: string;
  /** Original triage run ID for context */
  triageRunId?: string;
  /** Original test command template with {spec} and {url} placeholders */
  testCommand?: string;
}

/**
 * Outcome of waiting for a validation workflow to complete
 */
export interface ValidationOutcome {
  /** Whether the test passed */
  passed: boolean;
  /** Workflow run conclusion (success, failure, etc.) */
  conclusion: string;
  /** Logs from the validation run (for feedback on failure) */
  logs?: string;
  /** Run ID of the completed validation */
  runId: number;
  /** URL to the workflow run */
  url?: string;
}

/**
 * Interface for applying fixes to codebases
 */
export interface FixApplier {
  /**
   * Check if the fix can be applied based on confidence threshold
   */
  canApply(recommendation: FixRecommendation): boolean;

  /**
   * Apply the recommended fix
   * Creates a new branch, applies changes, commits, and pushes
   */
  applyFix(recommendation: FixRecommendation): Promise<ApplyResult>;

  /**
   * Re-apply a fix on an existing branch by resetting to base and committing fresh.
   * Used in iterative fix-validate loops.
   */
  reapplyFix(
    recommendation: FixRecommendation,
    branchName: string
  ): Promise<ApplyResult>;

  /**
   * Trigger validation workflow to test the fix.
   * Returns run ID and URL when available, empty object if triggered but not yet discoverable, or null on failure.
   */
  triggerValidation(
    params: ValidationParams
  ): Promise<{ runId?: number; url?: string } | null>;

  /**
   * Wait for a validation workflow run to complete and return the outcome.
   */
  waitForValidation(runId: number): Promise<ValidationOutcome>;

  /**
   * Fetch failure logs from a completed validation workflow run.
   */
  getValidationFailureLogs(runId: number): Promise<string>;
}

/**
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a rate limit error (429)
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/**
 * Check if an error is a not found error (404)
 */
function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 404;
  }
  return false;
}

/**
 * Check if an error is a permission error (401/403)
 */
function isPermissionError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 401 || status === 403;
  }
  return false;
}

/**
 * Execute an async function with retry logic for rate limiting
 */
async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error) && attempt < RETRY_CONFIG.maxRetries - 1) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        core.warning(
          `Rate limited during ${context}, retrying in ${delay}ms (attempt ${
            attempt + 1
          }/${RETRY_CONFIG.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Get a human-readable error message based on error type
 */
function getErrorMessage(error: unknown, context: string): string {
  const baseMessage = error instanceof Error ? error.message : String(error);

  if (isNotFoundError(error)) {
    return `Not found: ${context}. Check that the resource exists and the token has access.`;
  }
  if (isPermissionError(error)) {
    return `Permission denied: ${context}. Ensure the token has 'contents: write' permission.`;
  }
  if (isRateLimitError(error)) {
    return `Rate limit exceeded during ${context}. Try again later.`;
  }

  return `${context}: ${baseMessage}`;
}

/**
 * GitHub-based fix applier using GitHub REST API
 * Does not require a local git repository
 */
export class GitHubFixApplier implements FixApplier {
  private config: FixApplierConfig;

  constructor(config: FixApplierConfig) {
    this.config = config;
  }

  /**
   * Check if the fix can be applied based on confidence threshold
   */
  canApply(recommendation: FixRecommendation): boolean {
    if (recommendation.confidence < this.config.minConfidence) {
      core.info(
        `Fix confidence (${recommendation.confidence}%) is below threshold (${this.config.minConfidence}%)`
      );
      return false;
    }

    if (
      !recommendation.proposedChanges ||
      recommendation.proposedChanges.length === 0
    ) {
      core.info('No proposed changes in fix recommendation');
      return false;
    }

    return true;
  }

  /**
   * Apply the recommended fix by creating a branch and committing changes via GitHub API
   */
  async applyFix(recommendation: FixRecommendation): Promise<ApplyResult> {
    let branchName = '';

    const { octokit, owner, repo, baseBranch } = this.config;

    // Log target repository for debugging
    core.info(`Target repository: ${owner}/${repo}`);
    core.info(`Base branch: ${baseBranch}`);

    try {
      // Validate proposed changes exist
      if (
        !recommendation.proposedChanges ||
        recommendation.proposedChanges.length === 0
      ) {
        return {
          success: false,
          modifiedFiles: [],
          error: 'No proposed changes to apply',
        };
      }

      // Get the test file from the first proposed change
      const testFile = recommendation.proposedChanges[0].file;
      branchName = generateFixBranchName(testFile);

      core.info(`Creating fix branch: ${branchName}`);

      // Validate base branch exists before proceeding
      let baseSha: string;
      try {
        const baseBranchRef = await withRetry(
          () =>
            octokit.git.getRef({
              owner,
              repo,
              ref: `heads/${baseBranch}`,
            }),
          `getting base branch '${baseBranch}'`
        );
        baseSha = baseBranchRef.data.object.sha;
        core.debug(`Base branch ${baseBranch} SHA: ${baseSha}`);
      } catch (error) {
        const errorMsg = getErrorMessage(
          error,
          `Base branch '${baseBranch}' in ${owner}/${repo}`
        );
        core.error(errorMsg);
        return {
          success: false,
          modifiedFiles: [],
          error: errorMsg,
        };
      }

      // Create the new branch
      try {
        await withRetry(
          () =>
            octokit.git.createRef({
              owner,
              repo,
              ref: `refs/heads/${branchName}`,
              sha: baseSha,
            }),
          'creating fix branch'
        );
        core.info(`Created branch: ${branchName}`);
      } catch (error) {
        // Check if branch already exists (unlikely with unique suffix, but possible)
        if (
          error instanceof Error &&
          error.message.includes('Reference already exists')
        ) {
          // Try with a more unique suffix
          branchName = generateFixBranchName(testFile, new Date(), true);
          core.info(`Branch exists, trying with unique name: ${branchName}`);
          await withRetry(
            () =>
              octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha: baseSha,
              }),
            'creating fix branch (retry with unique name)'
          );
          core.info(`Created branch: ${branchName}`);
        } else {
          throw error;
        }
      }

      // Delegate to shared commit logic
      const commitResult = await this.commitChanges(recommendation, branchName);

      if (!commitResult.success) {
        await this.cleanupBranch(
          branchName,
          commitResult.error || 'commit failed'
        );
        return commitResult;
      }

      core.info(`Successfully created fix branch: ${branchName}`);
      if (commitResult.commitSha) {
        core.info(`Commit SHA: ${commitResult.commitSha}`);
      }

      return commitResult;
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'applying fix');
      core.error(`Failed to apply fix: ${errorMessage}`);

      // Try to clean up the branch if we created it
      if (branchName) {
        await this.cleanupBranch(branchName, 'error during fix application');
      }

      return {
        success: false,
        modifiedFiles: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Clean up a branch, logging any errors instead of silencing them
   */
  private async cleanupBranch(
    branchName: string,
    reason: string
  ): Promise<void> {
    try {
      await this.config.octokit.git.deleteRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: `heads/${branchName}`,
      });
      core.debug(`Cleaned up branch ${branchName} (${reason})`);
    } catch (cleanupError) {
      // Log cleanup errors instead of silently ignoring
      const errorMsg =
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);
      core.debug(`Failed to clean up branch ${branchName}: ${errorMsg}`);
    }
  }

  /**
   * Trigger validation workflow to test the fix
   * Uses GitHub Actions workflow_dispatch to run the validate-fix workflow
   */
  async triggerValidation(
    params: ValidationParams
  ): Promise<{ runId?: number; url?: string } | null> {
    const { octokit, owner, repo, validationWorkflow, enableValidation } =
      this.config;

    // Check if validation is enabled
    if (!enableValidation) {
      core.info('Validation is not enabled, skipping validation trigger');
      return null;
    }

    const workflowFile = validationWorkflow || 'validate-fix.yml';

    core.info(`Triggering validation workflow: ${workflowFile}`);
    core.info(`  Branch: ${params.branch}`);
    core.info(`  Spec: ${params.spec}`);
    core.info(`  Preview URL: ${params.previewUrl}`);

    try {
      // Trigger the workflow
      await withRetry(
        () =>
          octokit.actions.createWorkflowDispatch({
            owner,
            repo,
            workflow_id: workflowFile,
            ref: 'main', // Trigger from main branch, but test the fix branch
            inputs: {
              branch: params.branch,
              spec: params.spec,
              preview_url: params.previewUrl,
              triage_run_id: params.triageRunId || '',
              fix_branch_name: params.branch,
              test_command: params.testCommand || '',
            },
          }),
        'triggering validation workflow'
      );

      core.info('Validation workflow triggered successfully');

      const dispatchedAt = new Date();
      const maxPollAttempts = 10;
      const pollInterval = 3000;

      for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
        await sleep(attempt === 1 ? 5000 : pollInterval);
        core.info(`Searching for validation run (attempt ${attempt}/${maxPollAttempts})...`);

        const runs = await withRetry(
          () =>
            octokit.actions.listWorkflowRuns({
              owner,
              repo,
              workflow_id: workflowFile,
              per_page: 10,
            }),
          'listing workflow runs'
        );

        const match = runs.data.workflow_runs.find((run) => {
          const createdAt = new Date(run.created_at);
          return createdAt >= new Date(dispatchedAt.getTime() - 30_000);
        });

        if (match) {
          core.info(`Validation workflow run ID: ${match.id}`);
          core.info(`Validation workflow URL: ${match.html_url}`);
          return { runId: match.id, url: match.html_url };
        }
      }

      core.warning(
        `Validation workflow was triggered, but could not find run after ${maxPollAttempts} attempts`
      );
      return {};
    } catch (error) {
      const errorMsg = getErrorMessage(error, 'triggering validation workflow');
      core.error(errorMsg);
      return null;
    }
  }

  /**
   * Re-apply a fix on an existing branch.
   * Resets the branch to the base branch SHA, then applies the new fix fresh.
   * This ensures oldCode always matches the original source.
   */
  async reapplyFix(
    recommendation: FixRecommendation,
    branchName: string
  ): Promise<ApplyResult> {
    const { octokit, owner, repo, baseBranch } = this.config;

    try {
      const baseBranchRef = await withRetry(
        () => octokit.git.getRef({ owner, repo, ref: `heads/${baseBranch}` }),
        `getting base branch '${baseBranch}'`
      );
      const baseSha = baseBranchRef.data.object.sha;

      await withRetry(
        () =>
          octokit.git.updateRef({
            owner,
            repo,
            ref: `heads/${branchName}`,
            sha: baseSha,
            force: true,
          }),
        `resetting branch ${branchName} to base`
      );
      core.info(`Reset branch ${branchName} to base SHA ${baseSha.slice(0, 7)}`);

      // Now apply the fix using the same commit logic as applyFix, but skip branch creation
      return await this.commitChanges(recommendation, branchName);
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'reapplying fix');
      core.error(`Failed to reapply fix: ${errorMessage}`);
      return { success: false, modifiedFiles: [], error: errorMessage };
    }
  }

  /**
   * Poll for a validation workflow run to complete.
   */
  async waitForValidation(runId: number): Promise<ValidationOutcome> {
    const { octokit, owner, repo } = this.config;
    const POLL_INTERVAL_MS = 15_000;
    const POLL_TIMEOUT_MS = 900_000;
    const INITIAL_POLL_DELAY_MS = 20_000;

    core.info(`Waiting for validation run ${runId} to complete...`);
    await sleep(INITIAL_POLL_DELAY_MS);

    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const run = await octokit.actions.getWorkflowRun({
          owner,
          repo,
          run_id: runId,
        });

        const { status, conclusion, html_url } = run.data;
        core.info(`  Validation run ${runId}: status=${status}, conclusion=${conclusion ?? 'n/a'}`);

        if (status === 'completed') {
          const passed = conclusion === 'success';
          let logs: string | undefined;
          if (!passed) {
            logs = await this.getValidationFailureLogs(runId);
          }
          return { passed, conclusion: conclusion || 'unknown', logs, runId, url: html_url };
        }
      } catch (error) {
        core.warning(`Error polling validation run ${runId}: ${error}`);
      }

      await sleep(POLL_INTERVAL_MS);
    }

    return {
      passed: false,
      conclusion: 'timeout',
      logs: `Validation run ${runId} did not complete within ${POLL_TIMEOUT_MS / 1000}s`,
      runId,
    };
  }

  /**
   * Fetch logs from a completed validation workflow run.
   */
  async getValidationFailureLogs(runId: number): Promise<string> {
    const { octokit, owner, repo } = this.config;

    try {
      const jobs = await withRetry(
        () =>
          octokit.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: runId,
            filter: 'latest',
          }),
        `listing jobs for validation run ${runId}`
      );

      const failedJob =
        jobs.data.jobs.find((j) => j.conclusion === 'failure') ||
        jobs.data.jobs[0];

      if (!failedJob) return 'No job found in validation run';

      const logsResponse = await withRetry(
        () =>
          octokit.actions.downloadJobLogsForWorkflowRun({
            owner,
            repo,
            job_id: failedJob.id,
          }),
        `downloading logs for validation job ${failedJob.id}`
      );

      const rawLogs =
        typeof logsResponse.data === 'string'
          ? logsResponse.data
          : String(logsResponse.data);

      // Keep the last 20K chars — the tail is where the failure details are
      const maxLen = 20_000;
      if (rawLogs.length > maxLen) {
        return rawLogs.slice(-maxLen);
      }
      return rawLogs;
    } catch (error) {
      core.warning(`Failed to fetch validation logs for run ${runId}: ${error}`);
      return `Could not fetch validation logs: ${error}`;
    }
  }

  /**
   * Shared commit logic used by both applyFix and reapplyFix.
   */
  private async commitChanges(
    recommendation: FixRecommendation,
    branchName: string
  ): Promise<ApplyResult> {
    const { octokit, owner, repo } = this.config;
    const modifiedFiles: string[] = [];
    let lastCommitSha = '';

    const totalChanges = recommendation.proposedChanges.length;
    // Per-file accumulator. Multiple changes targeting the same file compose
    // sequentially against this buffer so they all land in a single blob in
    // one tree item. Without this, two changes to the same path would push
    // two tree items with the same path; Git's createTree silently keeps the
    // last entry, dropping all earlier edits.
    const fileBuffers = new Map<
      string,
      {
        content: string;
        fileSha: string;
        appliedChanges: number;
        firstJustification: string;
      }
    >();
    const validationErrors: string[] = [];
    let appliedTotal = 0;

    for (const change of recommendation.proposedChanges) {
      const filePath = change.file;
      try {
        // Fetch the file once per unique path; subsequent changes operate on
        // the cumulative buffer (post prior edits), not a fresh copy.
        let buffer = fileBuffers.get(filePath);
        if (!buffer) {
          const fileResponse = await withRetry(
            () =>
              octokit.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: branchName,
              }),
            `getting file content for ${filePath}`
          );

          if (
            Array.isArray(fileResponse.data) ||
            fileResponse.data.type !== 'file'
          ) {
            validationErrors.push(`${filePath} is not a file`);
            continue;
          }

          buffer = {
            content: Buffer.from(
              fileResponse.data.content,
              'base64'
            ).toString('utf-8'),
            fileSha: fileResponse.data.sha,
            appliedChanges: 0,
            firstJustification: change.justification,
          };
          fileBuffers.set(filePath, buffer);
        }

        if (!change.oldCode || !change.newCode) {
          // Skip changes that have no code to apply (e.g. metadata-only).
          continue;
        }

        // Match against the buffer's CURRENT (possibly already-edited) content.
        const currentContent = buffer.content;
        let matchIndex = currentContent.indexOf(change.oldCode);
        let effectiveOldCode = change.oldCode;

        // Fuzzy matching fallback when exact match fails
        if (matchIndex === -1) {
          core.info(`Exact match failed for ${filePath}, trying fuzzy strategies...`);

          // Strategy 1: strip line-number prefixes the LLM may have copied
          const stripped = change.oldCode
            .split('\n')
            .map((line: string) => line.replace(/^\s*\d+:\s?/, ''))
            .join('\n');
          if (stripped !== change.oldCode) {
            matchIndex = currentContent.indexOf(stripped);
            if (matchIndex !== -1) {
              effectiveOldCode = stripped;
              core.info(`  ✅ Matched after stripping line number prefixes`);
            }
          }

          // Strategy 2: normalize trailing whitespace per line
          if (matchIndex === -1) {
            const normalizedOld = change.oldCode
              .split('\n')
              .map((l: string) => l.trimEnd())
              .join('\n');
            const normalizedContent = currentContent
              .split('\n')
              .map((l: string) => l.trimEnd())
              .join('\n');
            const normIdx = normalizedContent.indexOf(normalizedOld);
            if (normIdx !== -1) {
              const linesBefore = normalizedContent.slice(0, normIdx).split('\n').length - 1;
              const linesInOld = normalizedOld.split('\n').length;
              const actualLines = currentContent.split('\n');
              effectiveOldCode = actualLines.slice(linesBefore, linesBefore + linesInOld).join('\n');
              matchIndex = currentContent.indexOf(effectiveOldCode);
              if (matchIndex !== -1) {
                core.info(`  ✅ Matched after trailing whitespace normalization`);
              }
            }
          }

          // Strategy 3: line-range extraction near the specified line number.
          // Note: when prior edits in the same file have shifted lines, the
          // recommendation's `change.line` is approximate; the strict-then-
          // fuzzy match plus uniqueness check below still keeps this safe.
          if (matchIndex === -1 && change.line > 0) {
            const contentLines = currentContent.split('\n');
            const oldLineCount = change.oldCode.split('\n').length;
            const start = Math.max(0, change.line - 3);
            const end = Math.min(contentLines.length, change.line + oldLineCount + 2);

            for (let s = start; s <= Math.min(start + 5, end - oldLineCount); s++) {
              const candidate = contentLines.slice(s, s + oldLineCount).join('\n');
              const similarity = computeLineSimilarity(change.oldCode, candidate);
              if (similarity >= 0.5) {
                const candidateIdx = currentContent.indexOf(candidate);
                if (candidateIdx !== -1) {
                  const secondIdx = currentContent.indexOf(candidate, candidateIdx + 1);
                  if (secondIdx === -1) {
                    matchIndex = candidateIdx;
                    effectiveOldCode = candidate;
                    core.info(`  ✅ Matched via line-range similarity (${(similarity * 100).toFixed(0)}%) at line ${s + 1}`);
                    break;
                  }
                }
              }
            }
          }

          if (matchIndex === -1) {
            validationErrors.push(
              `Could not find old code to replace in ${filePath}`
            );
            continue;
          }
        }

        const secondMatch = currentContent.indexOf(
          effectiveOldCode,
          matchIndex + 1
        );
        if (secondMatch !== -1) {
          validationErrors.push(
            `oldCode matches multiple locations in ${filePath} — ambiguous replacement rejected`
          );
          continue;
        }

        // Apply the edit to the buffer so subsequent changes see it.
        buffer.content =
          currentContent.slice(0, matchIndex) +
          change.newCode +
          currentContent.slice(matchIndex + effectiveOldCode.length);
        buffer.appliedChanges += 1;
        appliedTotal += 1;
      } catch (fileError) {
        validationErrors.push(
          getErrorMessage(fileError, `validating ${filePath}`)
        );
      }
    }

    if (appliedTotal === 0) {
      for (const err of validationErrors) core.warning(err);
      return {
        success: false,
        modifiedFiles: [],
        error: `No files could be modified. Validation errors: ${validationErrors.join('; ')}`,
      };
    }

    if (totalChanges > 1 && validationErrors.length > 0) {
      core.warning(
        `${validationErrors.length} of ${totalChanges} changes failed validation — aborting to avoid incomplete fix`
      );
      for (const err of validationErrors) {
        core.warning(`  - ${err}`);
      }
      return {
        success: false,
        modifiedFiles: [],
        error: `Partial fix rejected: ${validationErrors.length} of ${totalChanges} changes failed validation`,
      };
    }

    // Atomic commit: one tree item per unique file path with the fully
    // composed (post all-edits) content.
    try {
      const branchRef = await withRetry(
        () => octokit.git.getRef({ owner, repo, ref: `heads/${branchName}` }),
        `getting ref for ${branchName}`
      );
      const baseSha = branchRef.data.object.sha;

      const treeItems: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        content: string;
      }> = [];

      for (const [filePath, buffer] of fileBuffers) {
        if (buffer.appliedChanges === 0) continue;
        treeItems.push({
          path: filePath,
          mode: '100644' as const,
          type: 'blob' as const,
          content: buffer.content,
        });
        modifiedFiles.push(filePath);
      }

      const fileList = modifiedFiles.join(', ');
      const firstFile = modifiedFiles[0];
      const justification = fileBuffers
        .get(firstFile)!
        .firstJustification.slice(0, 50);
      const commitMessage = `fix(test): ${justification}

Automated fix generated by adept-triage-agent.

Files: ${fileList}
Confidence: ${recommendation.confidence}%`;

      const tree = await withRetry(
        () =>
          octokit.git.createTree({
            owner,
            repo,
            base_tree: baseSha,
            tree: treeItems,
          }),
        'creating tree for atomic commit'
      );

      const commit = await withRetry(
        () =>
          octokit.git.createCommit({
            owner,
            repo,
            message: commitMessage,
            tree: tree.data.sha,
            parents: [baseSha],
          }),
        'creating commit'
      );

      await withRetry(
        () =>
          octokit.git.updateRef({
            owner,
            repo,
            ref: `heads/${branchName}`,
            sha: commit.data.sha,
          }),
        `updating ref heads/${branchName}`
      );

      lastCommitSha = commit.data.sha;
      for (const f of modifiedFiles) core.info(`Modified: ${f}`);
    } catch (commitError) {
      const errorMsg = getErrorMessage(commitError, 'atomic commit');
      core.error(errorMsg);
      return {
        success: false,
        modifiedFiles: [],
        error: `Atomic commit failed: ${errorMsg}`,
      };
    }

    return {
      success: true,
      modifiedFiles,
      commitSha: lastCommitSha || undefined,
      branchName,
    };
  }
}

/**
 * Factory function for creating fix appliers
 */
export function createFixApplier(config: FixApplierConfig): FixApplier {
  return new GitHubFixApplier(config);
}

/**
 * Generate a branch name for a fix
 * Includes timestamp with milliseconds for uniqueness to prevent collisions
 */
export function generateFixBranchName(
  testFile: string,
  timestamp: Date = new Date(),
  forceUnique: boolean = false
): string {
  const sanitizedFile = testFile
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40); // Reduced to allow room for longer timestamp

  const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');

  // Add milliseconds for uniqueness to prevent branch name collisions
  const uniqueSuffix = forceUnique
    ? `-${timestamp.getTime().toString(36)}` // Full timestamp in base36 for guaranteed uniqueness
    : `-${timestamp.getMilliseconds().toString().padStart(3, '0')}`; // Just milliseconds normally

  return `${AUTO_FIX.BRANCH_PREFIX}${sanitizedFile}-${dateStr}${uniqueSuffix}`;
}

/**
 * Compute line-by-line similarity between two code blocks.
 * Returns 0-1 where 1 means all tokens in the shorter block appear in the longer one.
 */
function computeLineSimilarity(a: string, b: string): number {
  const aLines = a.split('\n').map((l) => l.trim()).filter(Boolean);
  const bLines = b.split('\n').map((l) => l.trim()).filter(Boolean);
  if (aLines.length === 0 || bLines.length === 0) return 0;

  let matched = 0;
  for (const aLine of aLines) {
    const aTokens = aLine.split(/\s+/).filter((t) => t.length > 2);
    if (aTokens.length === 0) { matched++; continue; }
    for (const bLine of bLines) {
      const hitCount = aTokens.filter((t) => bLine.includes(t)).length;
      if (hitCount >= aTokens.length * 0.6) {
        matched++;
        break;
      }
    }
  }

  return matched / aLines.length;
}
