"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactFetcher = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const path = __importStar(require("path"));
class ArtifactFetcher {
    octokit;
    constructor(octokit) {
        this.octokit = octokit;
    }
    async fetchScreenshots(runId, jobName) {
        try {
            const { owner, repo } = github.context.repo;
            const screenshots = [];
            const artifactsResponse = await this.octokit.actions.listWorkflowRunArtifacts({
                owner,
                repo,
                run_id: parseInt(runId, 10)
            });
            core.info(`Found ${artifactsResponse.data.total_count} artifacts`);
            let screenshotArtifacts = artifactsResponse.data.artifacts.filter(artifact => {
                const name = artifact.name.toLowerCase();
                return name.includes('screenshot') ||
                    name.includes('cypress') ||
                    (name.includes('cy-') && (name.includes('logs') || name.includes('artifacts')));
            });
            if (jobName) {
                const matrixMatch = jobName.match(/\((.*?)\)/);
                const searchName = matrixMatch ? matrixMatch[1] : jobName;
                const jobSpecificArtifacts = screenshotArtifacts.filter(artifact => artifact.name.toLowerCase().includes(searchName.toLowerCase()));
                if (jobSpecificArtifacts.length > 0) {
                    core.info(`Found ${jobSpecificArtifacts.length} artifact(s) specific to job: ${jobName} (searching for: ${searchName})`);
                    screenshotArtifacts = jobSpecificArtifacts;
                }
                else {
                    core.info(`No artifacts found specific to job: ${jobName} (searched for: ${searchName})`);
                    return screenshots;
                }
            }
            if (screenshotArtifacts.length === 0) {
                core.info('No screenshot artifacts found');
                return screenshots;
            }
            for (const artifact of screenshotArtifacts) {
                core.info(`Processing artifact: ${artifact.name}`);
                try {
                    const downloadResponse = await this.octokit.actions.downloadArtifact({
                        owner,
                        repo,
                        artifact_id: artifact.id,
                        archive_format: 'zip'
                    });
                    const buffer = Buffer.from(downloadResponse.data);
                    const zip = new adm_zip_1.default(buffer);
                    const entries = zip.getEntries();
                    for (const entry of entries) {
                        const entryName = entry.entryName;
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
                }
                catch (error) {
                    core.warning(`Failed to process artifact ${artifact.name}: ${error}`);
                }
            }
            core.info(`Total screenshots found: ${screenshots.length}`);
            return screenshots;
        }
        catch (error) {
            core.error(`Failed to fetch screenshots: ${error}`);
            return [];
        }
    }
    isScreenshotFile(fileName) {
        const lowerName = fileName.toLowerCase();
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        return imageExtensions.some(ext => lowerName.endsWith(ext)) &&
            (lowerName.includes('screenshot') ||
                lowerName.includes('failure') ||
                lowerName.includes('error') ||
                /\(failed\)/.test(lowerName) ||
                lowerName.includes('cypress/screenshots/'));
    }
    async fetchLogs(_runId, jobId) {
        try {
            const { owner, repo } = github.context.repo;
            const logs = [];
            const logsResponse = await this.octokit.actions.downloadJobLogsForWorkflowRun({
                owner,
                repo,
                job_id: jobId
            });
            const logContent = logsResponse.data;
            const lines = logContent.split('\n');
            const errorContext = this.extractErrorContext(lines);
            if (errorContext.length > 0) {
                logs.push(...errorContext);
            }
            return logs;
        }
        catch (error) {
            core.warning(`Failed to fetch additional logs: ${error}`);
            return [];
        }
    }
    async fetchCypressArtifactLogs(runId, jobName) {
        try {
            const { owner, repo } = github.context.repo;
            let cypressLogs = '';
            const artifactsResponse = await this.octokit.actions.listWorkflowRunArtifacts({
                owner,
                repo,
                run_id: parseInt(runId, 10)
            });
            core.info(`Found ${artifactsResponse.data.total_count} artifacts for Cypress logs`);
            const logArtifacts = artifactsResponse.data.artifacts.filter(artifact => {
                const name = artifact.name.toLowerCase();
                return name.includes('cy-logs') || name.includes('cypress-logs') ||
                    (name.includes('cypress') && (name.includes('log') || name.includes('artifacts')));
            });
            if (logArtifacts.length === 0) {
                core.info('No Cypress log artifacts found');
                return cypressLogs;
            }
            if (jobName) {
                const matrixMatch = jobName.match(/\((.*?)\)/);
                const searchName = matrixMatch ? matrixMatch[1] : jobName;
                const specificArtifact = logArtifacts.find(artifact => artifact.name.toLowerCase().includes(searchName.toLowerCase()));
                if (specificArtifact) {
                    core.info(`Found specific artifact for job ${jobName}: ${specificArtifact.name}`);
                    return await this.processArtifactForLogs(specificArtifact);
                }
            }
            for (const artifact of logArtifacts) {
                const logs = await this.processArtifactForLogs(artifact);
                if (logs) {
                    cypressLogs += logs + '\n\n';
                }
            }
            return cypressLogs;
        }
        catch (error) {
            core.warning(`Failed to fetch Cypress artifact logs: ${error}`);
            return '';
        }
    }
    async processArtifactForLogs(artifact) {
        const { owner, repo } = github.context.repo;
        let logs = '';
        try {
            core.info(`Processing artifact: ${artifact.name}`);
            const downloadResponse = await this.octokit.actions.downloadArtifact({
                owner,
                repo,
                artifact_id: artifact.id,
                archive_format: 'zip'
            });
            const buffer = Buffer.from(downloadResponse.data);
            const zip = new adm_zip_1.default(buffer);
            const zipEntries = zip.getEntries();
            core.info(`Artifact contains ${zipEntries.length} entries`);
            const contents = {
                screenshots: [],
                videos: [],
                textFiles: [],
                otherFiles: []
            };
            for (const entry of zipEntries) {
                if (entry.isDirectory)
                    continue;
                const entryName = entry.entryName.toLowerCase();
                const fullName = entry.entryName;
                if (entryName.endsWith('.png') || entryName.endsWith('.jpg') || entryName.endsWith('.jpeg')) {
                    contents.screenshots.push(fullName);
                }
                else if (entryName.endsWith('.mp4') || entryName.endsWith('.avi') || entryName.endsWith('.mov')) {
                    contents.videos.push(fullName);
                }
                else if (entryName.endsWith('.txt') || entryName.endsWith('.log') ||
                    entryName.includes('output') || entryName.includes('.json')) {
                    try {
                        const content = zip.readAsText(entry);
                        if (content && content.trim().length > 0) {
                            contents.textFiles.push({ name: fullName, content });
                        }
                    }
                    catch (err) {
                        core.warning(`Could not read text file ${fullName}: ${err}`);
                    }
                }
                else {
                    contents.otherFiles.push(fullName);
                }
            }
            logs += `=== Artifact: ${artifact.name} ===\n`;
            logs += `Found: ${contents.screenshots.length} screenshots, ${contents.videos.length} videos, ${contents.textFiles.length} text files\n\n`;
            if (contents.textFiles.length > 0) {
                logs += `Text Files:\n`;
                for (const textFile of contents.textFiles) {
                    logs += `\n--- ${textFile.name} ---\n`;
                    logs += textFile.content;
                    logs += '\n';
                }
            }
            if (contents.screenshots.length > 0) {
                logs += `\nScreenshots in artifact:\n`;
                contents.screenshots.forEach(s => logs += `- ${s}\n`);
            }
            if (contents.videos.length > 0) {
                logs += `\nVideos in artifact:\n`;
                contents.videos.forEach(v => logs += `- ${v}\n`);
            }
            return logs;
        }
        catch (err) {
            core.warning(`Failed to process artifact ${artifact.name}: ${err}`);
            return '';
        }
    }
    extractErrorContext(lines, contextLines = 10) {
        const errorContext = [];
        const errorKeywords = [
            'error:', 'failed:', 'failure:', 'exception:',
            'assertion', 'expected', 'timeout', 'cypress error',
            '✖', '×', '✗', 'fail'
        ];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            if (errorKeywords.some(keyword => line.includes(keyword))) {
                const start = Math.max(0, i - contextLines);
                const end = Math.min(lines.length, i + contextLines + 1);
                const context = lines.slice(start, end);
                errorContext.push(...context.filter(l => l.trim().length > 0));
            }
        }
        return [...new Set(errorContext)];
    }
    async fetchPRDiff(prNumber, repository) {
        try {
            const { owner, repo } = repository
                ? { owner: repository.split('/')[0], repo: repository.split('/')[1] }
                : github.context.repo;
            core.info(`Fetching PR diff for PR #${prNumber} in ${owner}/${repo}`);
            const prResponse = await this.octokit.pulls.get({
                owner,
                repo,
                pull_number: parseInt(prNumber, 10)
            });
            const filesResponse = await this.octokit.pulls.listFiles({
                owner,
                repo,
                pull_number: parseInt(prNumber, 10),
                per_page: 100
            });
            const files = filesResponse.data.map(file => ({
                filename: file.filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
                patch: file.patch
            }));
            const sortedFiles = this.sortFilesByRelevance(files);
            const prDiff = {
                files: sortedFiles,
                totalChanges: prResponse.data.changed_files,
                additions: prResponse.data.additions,
                deletions: prResponse.data.deletions
            };
            core.info(`PR #${prNumber} has ${prDiff.totalChanges} changed files with +${prDiff.additions}/-${prDiff.deletions} lines`);
            const filesSummary = sortedFiles.slice(0, 10).map(f => `  - ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
            core.info(`Changed files (sorted by relevance):\n${filesSummary}${files.length > 10 ? `\n  ... and ${files.length - 10} more files` : ''}`);
            return prDiff;
        }
        catch (error) {
            const errorWithStatus = error;
            if (errorWithStatus.status === 404 || errorWithStatus.status === 403) {
                const isCurrentRepo = !repository || repository === `${github.context.repo.owner}/${github.context.repo.repo}`;
                if (!isCurrentRepo) {
                    core.warning(`Failed to fetch PR diff: ${error}`);
                    core.warning(`This appears to be a cross-repository access issue. The GitHub Actions token may not have permission to access ${repository}.`);
                    core.warning(`To fix this, use a Personal Access Token (PAT) with 'repo' scope instead of the default GITHUB_TOKEN.`);
                    core.warning(`See https://github.com/adept-at/adept-triage-agent/blob/main/README_CROSS_REPO_PR.md for detailed instructions.`);
                }
                else {
                    core.warning(`Failed to fetch PR diff: ${error}`);
                    core.warning(`PR #${prNumber} may not exist or the token lacks permissions to access it.`);
                }
            }
            else {
                core.warning(`Failed to fetch PR diff: ${error}`);
            }
            return null;
        }
    }
    sortFilesByRelevance(files) {
        return files.sort((a, b) => {
            const aIsTest = this.isTestFile(a.filename);
            const bIsTest = this.isTestFile(b.filename);
            if (aIsTest && !bIsTest)
                return -1;
            if (!aIsTest && bIsTest)
                return 1;
            const aIsSource = this.isSourceFile(a.filename);
            const bIsSource = this.isSourceFile(b.filename);
            if (aIsSource && !bIsSource)
                return -1;
            if (!aIsSource && bIsSource)
                return 1;
            const aChanges = a.additions + a.deletions;
            const bChanges = b.additions + b.deletions;
            if (aChanges !== bChanges) {
                return bChanges - aChanges;
            }
            const aIsConfig = this.isConfigFile(a.filename);
            const bIsConfig = this.isConfigFile(b.filename);
            if (aIsConfig && !bIsConfig)
                return -1;
            if (!aIsConfig && bIsConfig)
                return 1;
            return a.filename.localeCompare(b.filename);
        });
    }
    isTestFile(filename) {
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
    isSourceFile(filename) {
        const sourcePatterns = [
            /\.[jt]sx?$/,
            /\.vue$/,
            /\.py$/,
            /\.go$/,
            /\.java$/,
            /\.cs$/
        ];
        return sourcePatterns.some(pattern => pattern.test(filename)) && !this.isTestFile(filename);
    }
    isConfigFile(filename) {
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
exports.ArtifactFetcher = ArtifactFetcher;
//# sourceMappingURL=artifact-fetcher.js.map