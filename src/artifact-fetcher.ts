import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';
import { Screenshot } from './types';
import AdmZip from 'adm-zip';
import * as path from 'path';

export class ArtifactFetcher {
  constructor(private octokit: Octokit) {}

  async fetchScreenshots(runId: string, jobName?: string): Promise<Screenshot[]> {
    try {
      const { owner, repo } = github.context.repo;
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
          const buffer = Buffer.from(downloadResponse.data as ArrayBuffer);
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

  async fetchLogs(_runId: string, jobId: number): Promise<string[]> {
    try {
      const { owner, repo } = github.context.repo;
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

  async fetchCypressArtifactLogs(runId: string, jobName?: string): Promise<string> {
    try {
      const { owner, repo } = github.context.repo;
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
          return await this.processArtifactForLogs(specificArtifact);
        }
      }

      // Process all matching artifacts
      for (const artifact of logArtifacts) {
        const logs = await this.processArtifactForLogs(artifact);
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

  private async processArtifactForLogs(artifact: any): Promise<string> {
    const { owner, repo } = github.context.repo;
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
      const buffer = Buffer.from(downloadResponse.data as ArrayBuffer);
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
} 