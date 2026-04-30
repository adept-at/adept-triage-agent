import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';
import { Screenshot } from './types';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { PRDiff, PRDiffFile } from './types';
import { SHORT_SHA_LENGTH } from './config/constants';
import { parseRepoString } from './utils/repo-utils';

interface RepoDetails {
  owner: string;
  repo: string;
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }
  return Buffer.from(data as ArrayBuffer);
}

interface GitHubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  url?: string;
  archive_download_url?: string;
  expired?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
}

export class ArtifactFetcher {
  constructor(private octokit: Octokit) {}

  async fetchScreenshots(runId: string, jobName?: string, repoDetails?: RepoDetails): Promise<Screenshot[]> {
    try {
      const { owner, repo } = repoDetails ?? github.context.repo;
      const screenshots: Screenshot[] = [];

      // List artifacts for the workflow run
      const artifactsResponse = await this.octokit.actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: parseInt(runId, 10)
      });

      core.info(`Found ${artifactsResponse.data.total_count} artifacts`);

      // Look for screenshot artifacts - cypress, WDIO, or generic log artifacts
      let screenshotArtifacts = artifactsResponse.data.artifacts.filter(artifact => {
        const name = artifact.name.toLowerCase();
        return name.includes('screenshot') ||
               name.includes('cypress') ||
               name.includes('wdio') ||
               name.includes('wdio-logs') ||
               name.includes('webdriver') ||
               (name.includes('cy-') && (name.includes('logs') || name.includes('artifacts')));
      });

      // If jobName is provided, try to narrow to job-specific artifacts.
      // First, try the exact-job heuristic (matrix-name fragment or full
      // name). If that fails, try a looser token-overlap match before
      // falling back to "use everything" — the overlap heuristic catches
      // common consumer naming patterns like job=`cancelTest`,
      // artifact=`wdio-logs-cancel`, where exact substring fails but
      // tokens overlap meaningfully.
      if (jobName) {
        const matrixMatch = jobName.match(/\((.*?)\)/);
        const searchName = matrixMatch ? matrixMatch[1] : jobName;
        const jobLower = jobName.toLowerCase();
        const searchLower = searchName.toLowerCase();

        let jobSpecificArtifacts = screenshotArtifacts.filter(artifact =>
          artifact.name.toLowerCase().includes(searchLower)
        );

        if (jobSpecificArtifacts.length === 0) {
          const jobTokens = jobLower
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length >= 3);
          if (jobTokens.length > 0) {
            jobSpecificArtifacts = screenshotArtifacts.filter((artifact) => {
              const artifactLower = artifact.name.toLowerCase();
              return jobTokens.some((token) => artifactLower.includes(token));
            });
            if (jobSpecificArtifacts.length > 0) {
              core.info(
                `Found ${jobSpecificArtifacts.length} artifact(s) via token-overlap match for job "${jobName}" (tokens: ${jobTokens.join(', ')})`
              );
            }
          }
        }

        if (jobSpecificArtifacts.length > 0) {
          if (jobSpecificArtifacts.length !== screenshotArtifacts.length) {
            core.info(
              `Narrowed to ${jobSpecificArtifacts.length} artifact(s) specific to job: ${jobName} (searching for: ${searchName})`
            );
          }
          screenshotArtifacts = jobSpecificArtifacts;
        } else {
          // Falling back to all matching artifacts is dangerous when a
          // workflow has multiple sibling jobs — sibling-job screenshots
          // can contaminate the classifier. Keep the fallback because
          // some single-job consumers rely on it, but warn loudly.
          core.warning(
            `No artifacts specifically matched job "${jobName}" (also tried tokens). Falling back to all ${screenshotArtifacts.length} matching artifact(s) — sibling-job contamination is possible.`
          );
        }
      }

      if (screenshotArtifacts.length === 0) {
        core.info('No screenshot artifacts found');
        return screenshots;
      }

      // Download and process each artifact
      for (const artifact of screenshotArtifacts) {
        core.info(`Processing artifact: ${artifact.name}`);
        
        try {
          // Download artifact
          const downloadResponse = await this.octokit.actions.downloadArtifact({
            owner,
            repo,
            artifact_id: artifact.id,
            archive_format: 'zip'
          });
          // Process ZIP file
          const buffer = toBuffer(downloadResponse.data);
          const zip = new AdmZip(buffer);
          const entries = zip.getEntries();

          for (const entry of entries) {
            const entryName = entry.entryName;
            
            // Check if this is a screenshot file (pass artifact name for WDIO context)
            if (this.isScreenshotFile(entryName, artifact.name)) {
              const fileName = path.basename(entryName);
              const fileData = entry.getData();
              
              screenshots.push({
                name: fileName,
                path: entryName,
                base64Data: fileData.toString('base64'),
                timestamp: artifact.created_at || undefined,
              });

              core.info(`Found screenshot: ${fileName}`);
            }
          }
        } catch (error) {
          core.warning(`Failed to process artifact ${artifact.name}: ${error}`);
        }
      }

      core.info(`Total screenshots found: ${screenshots.length}`);
      return screenshots;

    } catch (error) {
      core.error(`Failed to fetch screenshots: ${error}`);
      return [];
    }
  }

  private isScreenshotFile(fileName: string, artifactName?: string): boolean {
    const lowerName = fileName.toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    
    if (!imageExtensions.some(ext => lowerName.endsWith(ext))) return false;

    // Inside a WDIO artifact, any image at the root is a test failure screenshot
    if (artifactName) {
      const lowerArtifact = artifactName.toLowerCase();
      if (lowerArtifact.includes('wdio') || lowerArtifact.includes('webdriver')) {
        return true;
      }
    }

    return lowerName.includes('screenshot') ||
           lowerName.includes('failure') ||
           lowerName.includes('error') ||
           /\(failed\)/.test(lowerName) ||
           lowerName.includes('cypress/screenshots/') ||
           lowerName.includes('data/');
  }

  async fetchLogs(_runId: string, jobId: number, repoDetails?: RepoDetails): Promise<string[]> {
    try {
      const { owner, repo } = repoDetails ?? github.context.repo;
      const logs: string[] = [];

      // Download job logs
      const logsResponse = await this.octokit.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: jobId
      });

      const logContent = String(logsResponse.data);
      
      // Extract relevant error context from logs
      const lines = logContent.split('\n');
      const errorContext = this.extractErrorContext(lines);
      
      if (errorContext.length > 0) {
        logs.push(...errorContext);
      }

      return logs;
    } catch (error) {
      core.warning(`Failed to fetch additional logs: ${error}`);
      return [];
    }
  }

  async fetchTestArtifactLogs(runId: string, jobName?: string, repoDetails?: RepoDetails): Promise<string> {
    try {
      const { owner, repo } = repoDetails ?? github.context.repo;
      let artifactLogs = '';

      // List artifacts for the workflow run
      const artifactsResponse = await this.octokit.actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: parseInt(runId, 10)
      });

      core.info(`Found ${artifactsResponse.data.total_count} artifacts for test logs`);

      // Look for test log artifacts (Cypress or WDIO)
      const logArtifacts = artifactsResponse.data.artifacts.filter(artifact => {
        const name = artifact.name.toLowerCase();
        return name.includes('cy-logs') || name.includes('cypress-logs') ||
               name.includes('wdio-logs') || name.includes('wdio-artifacts') ||
               (name.includes('cypress') && (name.includes('log') || name.includes('artifacts')));
      });

      if (logArtifacts.length === 0) {
        core.info('No test log artifacts found');
        return artifactLogs;
      }

      // If jobName is provided, filter to specific job artifact
      if (jobName) {
        // Extract matrix name from job name format: "previewUrlTest (matrix-name.js)"
        const matrixMatch = jobName.match(/\((.*?)\)/);
        const searchName = matrixMatch ? matrixMatch[1] : jobName;
        
        const specificArtifact = logArtifacts.find(artifact => 
          artifact.name.toLowerCase().includes(searchName.toLowerCase())
        );
        if (specificArtifact) {
          core.info(`Found specific artifact for job ${jobName}: ${specificArtifact.name}`);
          return await this.processArtifactForLogs(specificArtifact, { owner, repo });
        }
      }

      // Process all matching artifacts
      for (const artifact of logArtifacts) {
        const logs = await this.processArtifactForLogs(artifact, { owner, repo });
        if (logs) {
          artifactLogs += logs + '\n\n';
        }
      }

      return artifactLogs;
    } catch (error) {
      core.warning(`Failed to fetch test artifact logs: ${error}`);
      return '';
    }
  }

  private async processArtifactForLogs(artifact: GitHubArtifact, repoDetails: RepoDetails): Promise<string> {
    const { owner, repo } = repoDetails;
    let logs = '';
    
    try {
      core.info(`Processing artifact: ${artifact.name}`);
      
      // Download artifact
      const downloadResponse = await this.octokit.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: artifact.id,
        archive_format: 'zip'
      });

      // Process zip content
      const buffer = toBuffer(downloadResponse.data);
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      core.info(`Artifact contains ${zipEntries.length} entries`);
      
      // Track what we find
      const contents = {
        screenshots: [] as string[],
        videos: [] as string[],
        textFiles: [] as { name: string; content: string }[],
        otherFiles: [] as string[]
      };

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        
        const entryName = entry.entryName.toLowerCase();
        const fullName = entry.entryName;
        
        if (entryName.endsWith('.png') || entryName.endsWith('.jpg') || entryName.endsWith('.jpeg')) {
          contents.screenshots.push(fullName);
        } else if (entryName.endsWith('.mp4') || entryName.endsWith('.avi') || entryName.endsWith('.mov')) {
          contents.videos.push(fullName);
        } else if (entryName.endsWith('.txt') || entryName.endsWith('.log') || 
                   entryName.includes('output') || entryName.includes('.json')) {
          // These are likely text files we can read
          try {
            const content = zip.readAsText(entry);
            if (content && content.trim().length > 0) {
              contents.textFiles.push({ name: fullName, content });
            }
          } catch (err) {
            core.warning(`Could not read text file ${fullName}: ${err}`);
          }
        } else {
          contents.otherFiles.push(fullName);
        }
      }

      // Build a summary of artifact contents
      logs += `=== Artifact: ${artifact.name} ===\n`;
      logs += `Found: ${contents.screenshots.length} screenshots, ${contents.videos.length} videos, ${contents.textFiles.length} text files\n\n`;

      // Include any text file contents
      if (contents.textFiles.length > 0) {
        logs += `Text Files:\n`;
        for (const textFile of contents.textFiles) {
          logs += `\n--- ${textFile.name} ---\n`;
          logs += textFile.content;
          logs += '\n';
        }
      }

      // List screenshots (these are handled separately by fetchScreenshots)
      if (contents.screenshots.length > 0) {
        logs += `\nScreenshots in artifact:\n`;
        contents.screenshots.forEach(s => logs += `- ${s}\n`);
      }

      // List videos
      if (contents.videos.length > 0) {
        logs += `\nVideos in artifact:\n`;
        contents.videos.forEach(v => logs += `- ${v}\n`);
      }

      return logs;
    } catch (err) {
      core.warning(`Failed to process artifact ${artifact.name}: ${err}`);
      return '';
    }
  }

  private extractErrorContext(lines: string[], contextLines: number = 10): string[] {
    const errorContext: string[] = [];
    
    // Keywords that indicate error context
    const errorKeywords = [
      'error:', 'failed:', 'failure:', 'exception:', 
      'assertion', 'expected', 'timeout', 'cypress error',
      '✖', '×', '✗', 'fail'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (errorKeywords.some(keyword => line.includes(keyword))) {
        // Get context before and after the error
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);
        
        const context = lines.slice(start, end);
        errorContext.push(...context.filter(l => l.trim().length > 0));
      }
    }

    // Deduplicate while preserving order
    return [...new Set(errorContext)];
  }

  async fetchPRDiff(prNumber: string, repository?: string): Promise<PRDiff | null> {
    try {
      const { owner, repo } = parseRepoString(repository, 'fetchPRDiff');

      core.info(`Fetching PR diff for PR #${prNumber} in ${owner}/${repo}`);

      // Get PR details including files
      const prResponse = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: parseInt(prNumber, 10)
      });

      // Get the list of files changed in the PR
      const filesResponse = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: parseInt(prNumber, 10),
        per_page: 100 // Increase to get more files
      });

      const files: PRDiffFile[] = filesResponse.data.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch // This contains the actual diff
      }));

      // Sort files by relevance (test files and heavily modified files first)
      const sortedFiles = this.sortFilesByRelevance(files);

      const prDiff: PRDiff = {
        files: sortedFiles,
        totalChanges: prResponse.data.changed_files,
        additions: prResponse.data.additions,
        deletions: prResponse.data.deletions
      };

      core.info(`PR #${prNumber} has ${prDiff.totalChanges} changed files with +${prDiff.additions}/-${prDiff.deletions} lines`);

      // Log summary of changed files
      const filesSummary = sortedFiles.slice(0, 10).map(f => `  - ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
      core.info(`Changed files (sorted by relevance):\n${filesSummary}${files.length > 10 ? `\n  ... and ${files.length - 10} more files` : ''}`);

      return prDiff;
    } catch (error) {
      // Provide more helpful error messages for common issues
      const errorWithStatus = error as { status?: number; message?: string };
      if (errorWithStatus.status === 404 || errorWithStatus.status === 403) {
        const isCurrentRepo = !repository || repository === `${github.context.repo.owner}/${github.context.repo.repo}`;
        
        if (!isCurrentRepo) {
          core.warning(`Failed to fetch PR diff: ${error}`);
          core.warning(`This appears to be a cross-repository access issue. The GitHub Actions token may not have permission to access ${repository}.`);
          core.warning(`To fix this, use a Personal Access Token (PAT) with 'repo' scope instead of the default GITHUB_TOKEN.`);
          core.warning(`See https://github.com/adept-at/adept-triage-agent/blob/main/README_CROSS_REPO_PR.md for detailed instructions.`);
        } else {
          core.warning(`Failed to fetch PR diff: ${error}`);
          core.warning(`PR #${prNumber} may not exist or the token lacks permissions to access it.`);
        }
      } else {
        core.warning(`Failed to fetch PR diff: ${error}`);
      }
      return null;
    }
  }

  private sortFilesByRelevance(files: PRDiffFile[]): PRDiffFile[] {
    return files.sort((a, b) => {
      // Priority 1: Test files (most relevant)
      const aIsTest = this.isTestFile(a.filename);
      const bIsTest = this.isTestFile(b.filename);
      if (aIsTest && !bIsTest) return -1;
      if (!aIsTest && bIsTest) return 1;

      // Priority 2: Source files that tests might be testing
      const aIsSource = this.isSourceFile(a.filename);
      const bIsSource = this.isSourceFile(b.filename);
      if (aIsSource && !bIsSource) return -1;
      if (!aIsSource && bIsSource) return 1;

      // Priority 3: Files with more changes (likely more impactful)
      const aChanges = a.additions + a.deletions;
      const bChanges = b.additions + b.deletions;
      if (aChanges !== bChanges) {
        return bChanges - aChanges; // Descending order
      }

      // Priority 4: Configuration files
      const aIsConfig = this.isConfigFile(a.filename);
      const bIsConfig = this.isConfigFile(b.filename);
      if (aIsConfig && !bIsConfig) return -1;
      if (!aIsConfig && bIsConfig) return 1;

      // Default: alphabetical
      return a.filename.localeCompare(b.filename);
    });
  }

  private isTestFile(filename: string): boolean {
    const testPatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /\.cy\.[jt]sx?$/,
      /__tests__\//,
      /cypress\//,
      /e2e\//,
      /test\//
    ];
    return testPatterns.some(pattern => pattern.test(filename));
  }

  private isSourceFile(filename: string): boolean {
    const sourcePatterns = [
      /\.[jt]sx?$/,
      /\.vue$/,
      /\.py$/,
      /\.go$/,
      /\.java$/,
      /\.cs$/
    ];
    // Exclude test files
    return sourcePatterns.some(pattern => pattern.test(filename)) && !this.isTestFile(filename);
  }

  private isConfigFile(filename: string): boolean {
    const configPatterns = [
      /package\.json$/,
      /tsconfig\.json$/,
      /\.config\.[jt]s$/,
      /webpack\./,
      /vite\./,
      /rollup\./,
      /\.yml$/,
      /\.yaml$/
    ];
    return configPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Fetch diff for a specific commit (useful for production deploys)
   * This gets the changes introduced by a single commit
   */
  async fetchCommitDiff(commitSha: string, repository?: string): Promise<PRDiff | null> {
    try {
      const { owner, repo } = parseRepoString(repository, 'fetchCommitDiff');

      core.info(`Fetching commit diff for ${commitSha.substring(0, SHORT_SHA_LENGTH)} in ${owner}/${repo}`);

      // Get the commit details
      const commitResponse = await this.octokit.repos.getCommit({
        owner,
        repo,
        ref: commitSha
      });

      const commit = commitResponse.data;
      const files: PRDiffFile[] = (commit.files || []).map(file => ({
        filename: file.filename,
        status: file.status || 'modified',
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch
      }));

      // Sort files by relevance
      const sortedFiles = this.sortFilesByRelevance(files);

      const diff: PRDiff = {
        files: sortedFiles,
        totalChanges: files.length,
        additions: commit.stats?.additions || 0,
        deletions: commit.stats?.deletions || 0
      };

      core.info(`Commit ${commitSha.substring(0, SHORT_SHA_LENGTH)} has ${diff.totalChanges} changed files with +${diff.additions}/-${diff.deletions} lines`);

      if (sortedFiles.length > 0) {
        const filesSummary = sortedFiles.slice(0, 10).map(f => `  - ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
        core.info(`Changed files (sorted by relevance):\n${filesSummary}${files.length > 10 ? `\n  ... and ${files.length - 10} more files` : ''}`);
      }

      return diff;
    } catch (error) {
      core.warning(`Failed to fetch commit diff for ${commitSha}: ${error}`);
      return null;
    }
  }

  /**
   * Fetch a combined diff of the most recent commits on a repo's default branch.
   * Useful when tests run against production and there is no PR/branch/commit context
   * — gives the triage agent visibility into what recently shipped.
   */
  async fetchRecentProductDiff(
    productRepo: string,
    commitCount: number = 5
  ): Promise<PRDiff | null> {
    try {
      const [owner, repo] = productRepo.split('/');
      if (!owner || !repo) {
        core.warning(`Invalid product repo format: ${productRepo}`);
        return null;
      }

      core.info(`Fetching last ${commitCount} commits from ${productRepo}...`);

      const commitsResponse = await this.octokit.repos.listCommits({
        owner,
        repo,
        sha: 'main',
        per_page: commitCount + 1,
      });

      const commits = commitsResponse.data;
      if (commits.length < 2) {
        core.info('Not enough commits to compare');
        return null;
      }

      const oldestSha = commits[Math.min(commitCount, commits.length - 1)].sha;
      const newestSha = commits[0].sha;

      core.info(`Comparing ${oldestSha.substring(0, SHORT_SHA_LENGTH)}...${newestSha.substring(0, SHORT_SHA_LENGTH)} in ${productRepo}`);

      const compareResponse = await this.octokit.repos.compareCommits({
        owner,
        repo,
        base: oldestSha,
        head: newestSha,
      });

      const comparison = compareResponse.data;
      const files: PRDiffFile[] = (comparison.files || []).map(file => ({
        filename: file.filename,
        status: file.status || 'modified',
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
      }));

      const sortedFiles = this.sortFilesByRelevance(files);

      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

      const diff: PRDiff = {
        files: sortedFiles,
        totalChanges: files.length,
        additions: totalAdditions,
        deletions: totalDeletions,
      };

      const commitMessages = commits
        .slice(0, commitCount)
        .map(c => `  - ${c.sha.substring(0, SHORT_SHA_LENGTH)}: ${c.commit.message.split('\n')[0]}`)
        .join('\n');

      core.info(`Recent product commits:\n${commitMessages}`);
      core.info(`Product diff: ${diff.totalChanges} files changed, +${diff.additions}/-${diff.deletions} lines`);

      if (sortedFiles.length > 0) {
        const filesSummary = sortedFiles.slice(0, 10).map(f => `  - ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
        core.info(`Changed files (sorted by relevance):\n${filesSummary}${files.length > 10 ? `\n  ... and ${files.length - 10} more files` : ''}`);
      }

      return diff;
    } catch (error) {
      const errorWithStatus = error as { status?: number };
      if (errorWithStatus.status === 404) {
        core.warning(`Product repo ${productRepo} not found or not accessible with current token`);
      } else {
        core.warning(`Failed to fetch recent product diff from ${productRepo}: ${error}`);
      }
      return null;
    }
  }

  /**
   * Fetch diff between a branch and base branch (useful for preview URL runs)
   */
  async fetchBranchDiff(branch: string, baseBranch: string = 'main', repository?: string): Promise<PRDiff | null> {
    try {
      const { owner, repo } = parseRepoString(repository, 'fetchBranchDiff');

      core.info(`Fetching branch diff: ${baseBranch}...${branch} in ${owner}/${repo}`);

      // Use compare API to get the diff between branches
      const compareResponse = await this.octokit.repos.compareCommits({
        owner,
        repo,
        base: baseBranch,
        head: branch
      });

      const comparison = compareResponse.data;
      const files: PRDiffFile[] = (comparison.files || []).map(file => ({
        filename: file.filename,
        status: file.status || 'modified',
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch
      }));

      // Sort files by relevance
      const sortedFiles = this.sortFilesByRelevance(files);

      // Calculate totals from files since comparison doesn't have aggregate stats
      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

      const diff: PRDiff = {
        files: sortedFiles,
        totalChanges: files.length,
        additions: totalAdditions,
        deletions: totalDeletions
      };

      core.info(`Branch ${branch} has ${diff.totalChanges} files changed vs ${baseBranch} with +${diff.additions}/-${diff.deletions} lines`);
      core.info(`Commits ahead: ${comparison.ahead_by}, behind: ${comparison.behind_by}`);

      if (sortedFiles.length > 0) {
        const filesSummary = sortedFiles.slice(0, 10).map(f => `  - ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
        core.info(`Changed files (sorted by relevance):\n${filesSummary}${files.length > 10 ? `\n  ... and ${files.length - 10} more files` : ''}`);
      }

      return diff;
    } catch (error) {
      const errorWithStatus = error as { status?: number };
      if (errorWithStatus.status === 404) {
        core.warning(`Branch comparison failed: branch '${branch}' or '${baseBranch}' not found in ${repository || 'current repo'}`);
      } else {
        core.warning(`Failed to fetch branch diff for ${branch}: ${error}`);
      }
      return null;
    }
  }
} 