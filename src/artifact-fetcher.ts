import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';
import { Screenshot } from './types';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { PRDiff, PRDiffFile } from './types';

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

      // Look for screenshot artifacts - these often have 'cypress' or 'cy-logs' in their names
      let screenshotArtifacts = artifactsResponse.data.artifacts.filter(artifact => {
        const name = artifact.name.toLowerCase();
        // Match various screenshot artifact patterns
        return name.includes('screenshot') || 
               name.includes('cypress') || 
               (name.includes('cy-') && (name.includes('logs') || name.includes('artifacts')));
      });

      // If jobName is provided, filter to only artifacts for that specific job
      if (jobName) {
        // Extract matrix name from job name format: "previewUrlTest (matrix-name.js)"
        const matrixMatch = jobName.match(/\((.*?)\)/);
        const searchName = matrixMatch ? matrixMatch[1] : jobName;
        
        const jobSpecificArtifacts = screenshotArtifacts.filter(artifact => 
          artifact.name.toLowerCase().includes(searchName.toLowerCase())
        );
        
        if (jobSpecificArtifacts.length > 0) {
          core.info(`Found ${jobSpecificArtifacts.length} artifact(s) specific to job: ${jobName} (searching for: ${searchName})`);
          screenshotArtifacts = jobSpecificArtifacts;
        } else {
          core.info(`No artifacts found specific to job: ${jobName} (searched for: ${searchName})`);
          return screenshots;
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
            
            // Check if this is a screenshot file
            if (this.isScreenshotFile(entryName)) {
              const fileName = path.basename(entryName);
              const fileData = entry.getData();
              
                          screenshots.push({
              name: fileName,
              path: entryName,
              base64Data: fileData.toString('base64'),
              timestamp: artifact.created_at || undefined
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

  private isScreenshotFile(fileName: string): boolean {
    const lowerName = fileName.toLowerCase();
    // Common screenshot file extensions
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    
    // Check if it's an image file and likely a screenshot
    return imageExtensions.some(ext => lowerName.endsWith(ext)) &&
           (lowerName.includes('screenshot') || 
            lowerName.includes('failure') ||
            lowerName.includes('error') ||
            // Cypress default naming pattern
            /\(failed\)/.test(lowerName) ||
            // Common in cypress/screenshots folder
            lowerName.includes('cypress/screenshots/'));
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

      const logContent = logsResponse.data as unknown as string;
      
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

  async fetchCypressArtifactLogs(runId: string, jobName?: string, repoDetails?: RepoDetails): Promise<string> {
    try {
      const { owner, repo } = repoDetails ?? github.context.repo;
      let cypressLogs = '';

      // List artifacts for the workflow run
      const artifactsResponse = await this.octokit.actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: parseInt(runId, 10)
      });

      core.info(`Found ${artifactsResponse.data.total_count} artifacts for Cypress logs`);

      // Look for Cypress log artifacts
      const logArtifacts = artifactsResponse.data.artifacts.filter(artifact => {
        const name = artifact.name.toLowerCase();
        // Match Cypress log artifact patterns - these contain screenshots/videos
        return name.includes('cy-logs') || name.includes('cypress-logs') || 
               (name.includes('cypress') && (name.includes('log') || name.includes('artifacts')));
      });

      if (logArtifacts.length === 0) {
        core.info('No Cypress log artifacts found');
        return cypressLogs;
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
          cypressLogs += logs + '\n\n';
        }
      }

      return cypressLogs;
    } catch (error) {
      core.warning(`Failed to fetch Cypress artifact logs: ${error}`);
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
      const { owner, repo } = repository 
        ? { owner: repository.split('/')[0], repo: repository.split('/')[1] }
        : github.context.repo;

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
} 