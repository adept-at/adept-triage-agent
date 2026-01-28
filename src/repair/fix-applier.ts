/**
 * Fix Applier Implementation
 * Applies automated fixes to test code by creating branches and committing changes
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs/promises';
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
}

/**
 * Configuration for fix application
 */
export interface FixApplierConfig {
  /** Base branch to create fix branch from */
  baseBranch: string;
  /** Minimum confidence threshold to apply fix */
  minConfidence: number;
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
}

/**
 * GitHub-based fix applier using git commands
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

    if (!recommendation.proposedChanges || recommendation.proposedChanges.length === 0) {
      core.info('No proposed changes in fix recommendation');
      return false;
    }

    return true;
  }

  /**
   * Apply the recommended fix by creating a branch and committing changes
   */
  async applyFix(recommendation: FixRecommendation): Promise<ApplyResult> {
    const modifiedFiles: string[] = [];
    let branchName = '';
    let commitSha = '';

    try {
      // Get the test file from the first proposed change
      const testFile = recommendation.proposedChanges[0]?.file || 'unknown';
      branchName = generateFixBranchName(testFile);

      core.info(`Creating fix branch: ${branchName}`);

      // Fetch the base branch
      await this.execGit(['fetch', 'origin', this.config.baseBranch]);

      // Create and checkout new branch from base
      await this.execGit(['checkout', '-b', branchName, `origin/${this.config.baseBranch}`]);

      // Apply each proposed change
      for (const change of recommendation.proposedChanges) {
        const filePath = change.file;

        try {
          // Read the current file content
          const currentContent = await fs.readFile(filePath, 'utf-8');

          // Apply the change (simple string replacement)
          if (change.oldCode && change.newCode) {
            const newContent = currentContent.replace(change.oldCode, change.newCode);

            if (newContent === currentContent) {
              core.warning(`Could not find old code to replace in ${filePath}`);
              continue;
            }

            await fs.writeFile(filePath, newContent, 'utf-8');
            modifiedFiles.push(filePath);
            core.info(`Modified: ${filePath}`);
          }
        } catch (fileError) {
          core.warning(`Failed to modify ${filePath}: ${fileError}`);
        }
      }

      if (modifiedFiles.length === 0) {
        // Clean up - go back to original branch
        await this.execGit(['checkout', '-']);
        await this.execGit(['branch', '-D', branchName]);

        return {
          success: false,
          modifiedFiles: [],
          error: 'No files were successfully modified',
        };
      }

      // Stage the modified files
      await this.execGit(['add', ...modifiedFiles]);

      // Create the commit
      const commitMessage = generateFixCommitMessage(recommendation);
      await this.execGit(['commit', '-m', commitMessage]);

      // Get the commit SHA
      commitSha = await this.getCommitSha();

      // Push the branch
      await this.execGit(['push', '-u', 'origin', branchName]);

      core.info(`Successfully pushed fix branch: ${branchName}`);
      core.info(`Commit SHA: ${commitSha}`);

      return {
        success: true,
        modifiedFiles,
        commitSha,
        branchName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      core.error(`Failed to apply fix: ${errorMessage}`);

      // Try to clean up the branch if we created it
      try {
        await this.execGit(['checkout', '-']);
        if (branchName) {
          await this.execGit(['branch', '-D', branchName]);
        }
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        modifiedFiles,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a git command
   */
  private async execGit(args: string[]): Promise<void> {
    const exitCode = await exec.exec('git', args);
    if (exitCode !== 0) {
      throw new Error(`Git command failed: git ${args.join(' ')}`);
    }
  }

  /**
   * Get the current commit SHA
   */
  private async getCommitSha(): Promise<string> {
    let output = '';
    await exec.exec('git', ['rev-parse', 'HEAD'], {
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    return output.trim();
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
 */
export function generateFixBranchName(
  testFile: string,
  timestamp: Date = new Date()
): string {
  const sanitizedFile = testFile
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
  return `${AUTO_FIX.BRANCH_PREFIX}${sanitizedFile}-${dateStr}`;
}

/**
 * Generate a commit message for a fix
 */
export function generateFixCommitMessage(recommendation: FixRecommendation): string {
  const files = recommendation.proposedChanges.map(c => c.file).join(', ');
  const summary = recommendation.summary.slice(0, 50);

  return `fix(test): ${summary}

Automated fix generated by adept-triage-agent.

Files modified: ${files}
Confidence: ${recommendation.confidence}%

${recommendation.reasoning}`;
}
