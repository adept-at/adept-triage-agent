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
   * Trigger validation workflow to test the fix
   * Returns the workflow run ID
   */
  triggerValidation(
    params: ValidationParams
  ): Promise<{ runId: number } | null>;
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
    const modifiedFiles: string[] = [];
    let branchName = '';
    let lastCommitSha = '';

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

      // Apply each proposed change
      for (const change of recommendation.proposedChanges) {
        const filePath = change.file;

        try {
          // Get the current file content from the new branch
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

          // Ensure we got a file (not a directory)
          if (
            Array.isArray(fileResponse.data) ||
            fileResponse.data.type !== 'file'
          ) {
            core.warning(`${filePath} is not a file, skipping`);
            continue;
          }

          const currentContent = Buffer.from(
            fileResponse.data.content,
            'base64'
          ).toString('utf-8');
          const fileSha = fileResponse.data.sha;

          // Apply the change (simple string replacement - replaces first occurrence only)
          if (change.oldCode && change.newCode) {
            const newContent = currentContent.replace(
              change.oldCode,
              change.newCode
            );

            if (newContent === currentContent) {
              core.warning(`Could not find old code to replace in ${filePath}`);
              continue;
            }

            // Commit the change
            const commitMessage = `fix(test): ${change.justification.slice(
              0,
              50
            )}

Automated fix generated by adept-triage-agent.

File: ${filePath}
Confidence: ${recommendation.confidence}%`;

            const updateResponse = await withRetry(
              () =>
                octokit.repos.createOrUpdateFileContents({
                  owner,
                  repo,
                  path: filePath,
                  message: commitMessage,
                  content: Buffer.from(newContent).toString('base64'),
                  sha: fileSha,
                  branch: branchName,
                }),
              `committing changes to ${filePath}`
            );

            // Safely extract commit SHA
            const commitSha = updateResponse.data?.commit?.sha;
            if (commitSha) {
              lastCommitSha = commitSha;
            } else {
              core.warning(
                `No commit SHA returned for ${filePath}, using previous value`
              );
            }

            modifiedFiles.push(filePath);
            core.info(`Modified: ${filePath}`);
          }
        } catch (fileError) {
          const errorMsg = getErrorMessage(fileError, `modifying ${filePath}`);
          core.warning(errorMsg);
        }
      }

      if (modifiedFiles.length === 0) {
        // Clean up - delete the branch we created
        await this.cleanupBranch(branchName, 'no files modified');

        return {
          success: false,
          modifiedFiles: [],
          error: 'No files were successfully modified',
        };
      }

      core.info(`Successfully created fix branch: ${branchName}`);
      if (lastCommitSha) {
        core.info(`Commit SHA: ${lastCommitSha}`);
      }

      return {
        success: true,
        modifiedFiles,
        commitSha: lastCommitSha || undefined,
        branchName,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'applying fix');
      core.error(`Failed to apply fix: ${errorMessage}`);

      // Try to clean up the branch if we created it
      if (branchName) {
        await this.cleanupBranch(branchName, 'error during fix application');
      }

      return {
        success: false,
        modifiedFiles,
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
  ): Promise<{ runId: number } | null> {
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
            },
          }),
        'triggering validation workflow'
      );

      core.info('Validation workflow triggered successfully');

      // Wait a moment for the workflow run to be created
      await sleep(2000);

      // Try to find the workflow run ID
      const runs = await withRetry(
        () =>
          octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: workflowFile,
            branch: 'main',
            per_page: 5,
            status: 'queued',
          }),
        'listing workflow runs'
      );

      // Find the most recent run (should be the one we just triggered)
      if (runs.data.workflow_runs.length > 0) {
        const latestRun = runs.data.workflow_runs[0];
        core.info(`Validation workflow run ID: ${latestRun.id}`);
        core.info(`Validation workflow URL: ${latestRun.html_url}`);
        return { runId: latestRun.id };
      }

      // If no queued runs, check in_progress
      const inProgressRuns = await withRetry(
        () =>
          octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: workflowFile,
            branch: 'main',
            per_page: 5,
            status: 'in_progress',
          }),
        'listing in_progress workflow runs'
      );

      if (inProgressRuns.data.workflow_runs.length > 0) {
        const latestRun = inProgressRuns.data.workflow_runs[0];
        core.info(`Validation workflow run ID: ${latestRun.id}`);
        core.info(`Validation workflow URL: ${latestRun.html_url}`);
        return { runId: latestRun.id };
      }

      core.warning('Could not find validation workflow run ID');
      return null;
    } catch (error) {
      const errorMsg = getErrorMessage(error, 'triggering validation workflow');
      core.error(errorMsg);
      return null;
    }
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
 * Generate a commit message for a fix
 */
export function generateFixCommitMessage(
  recommendation: FixRecommendation
): string {
  const files = recommendation.proposedChanges.map((c) => c.file).join(', ');
  const summary = recommendation.summary.slice(0, 50);

  return `fix(test): ${summary}

Automated fix generated by adept-triage-agent.

Files modified: ${files}
Confidence: ${recommendation.confidence}%

${recommendation.reasoning}`;
}
