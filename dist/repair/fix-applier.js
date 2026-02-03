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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubFixApplier = void 0;
exports.createFixApplier = createFixApplier;
exports.generateFixBranchName = generateFixBranchName;
exports.generateFixCommitMessage = generateFixCommitMessage;
const core = __importStar(require("@actions/core"));
const constants_1 = require("../config/constants");
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRateLimitError(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        return error.status === 429;
    }
    return false;
}
function isNotFoundError(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        return error.status === 404;
    }
    return false;
}
function isPermissionError(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = error.status;
        return status === 401 || status === 403;
    }
    return false;
}
async function withRetry(fn, context) {
    let lastError;
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (isRateLimitError(error) && attempt < RETRY_CONFIG.maxRetries - 1) {
                const delay = Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt), RETRY_CONFIG.maxDelayMs);
                core.warning(`Rate limited during ${context}, retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}
function getErrorMessage(error, context) {
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
class GitHubFixApplier {
    config;
    constructor(config) {
        this.config = config;
    }
    canApply(recommendation) {
        if (recommendation.confidence < this.config.minConfidence) {
            core.info(`Fix confidence (${recommendation.confidence}%) is below threshold (${this.config.minConfidence}%)`);
            return false;
        }
        if (!recommendation.proposedChanges ||
            recommendation.proposedChanges.length === 0) {
            core.info('No proposed changes in fix recommendation');
            return false;
        }
        return true;
    }
    async applyFix(recommendation) {
        const modifiedFiles = [];
        let branchName = '';
        let lastCommitSha = '';
        const { octokit, owner, repo, baseBranch } = this.config;
        core.info(`Target repository: ${owner}/${repo}`);
        core.info(`Base branch: ${baseBranch}`);
        try {
            if (!recommendation.proposedChanges ||
                recommendation.proposedChanges.length === 0) {
                return {
                    success: false,
                    modifiedFiles: [],
                    error: 'No proposed changes to apply',
                };
            }
            const testFile = recommendation.proposedChanges[0].file;
            branchName = generateFixBranchName(testFile);
            core.info(`Creating fix branch: ${branchName}`);
            let baseSha;
            try {
                const baseBranchRef = await withRetry(() => octokit.git.getRef({
                    owner,
                    repo,
                    ref: `heads/${baseBranch}`,
                }), `getting base branch '${baseBranch}'`);
                baseSha = baseBranchRef.data.object.sha;
                core.debug(`Base branch ${baseBranch} SHA: ${baseSha}`);
            }
            catch (error) {
                const errorMsg = getErrorMessage(error, `Base branch '${baseBranch}' in ${owner}/${repo}`);
                core.error(errorMsg);
                return {
                    success: false,
                    modifiedFiles: [],
                    error: errorMsg,
                };
            }
            try {
                await withRetry(() => octokit.git.createRef({
                    owner,
                    repo,
                    ref: `refs/heads/${branchName}`,
                    sha: baseSha,
                }), 'creating fix branch');
                core.info(`Created branch: ${branchName}`);
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes('Reference already exists')) {
                    branchName = generateFixBranchName(testFile, new Date(), true);
                    core.info(`Branch exists, trying with unique name: ${branchName}`);
                    await withRetry(() => octokit.git.createRef({
                        owner,
                        repo,
                        ref: `refs/heads/${branchName}`,
                        sha: baseSha,
                    }), 'creating fix branch (retry with unique name)');
                    core.info(`Created branch: ${branchName}`);
                }
                else {
                    throw error;
                }
            }
            for (const change of recommendation.proposedChanges) {
                const filePath = change.file;
                try {
                    const fileResponse = await withRetry(() => octokit.repos.getContent({
                        owner,
                        repo,
                        path: filePath,
                        ref: branchName,
                    }), `getting file content for ${filePath}`);
                    if (Array.isArray(fileResponse.data) ||
                        fileResponse.data.type !== 'file') {
                        core.warning(`${filePath} is not a file, skipping`);
                        continue;
                    }
                    const currentContent = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
                    const fileSha = fileResponse.data.sha;
                    if (change.oldCode && change.newCode) {
                        const newContent = currentContent.replace(change.oldCode, change.newCode);
                        if (newContent === currentContent) {
                            core.warning(`Could not find old code to replace in ${filePath}`);
                            continue;
                        }
                        const commitMessage = `fix(test): ${change.justification.slice(0, 50)}

Automated fix generated by adept-triage-agent.

File: ${filePath}
Confidence: ${recommendation.confidence}%`;
                        const updateResponse = await withRetry(() => octokit.repos.createOrUpdateFileContents({
                            owner,
                            repo,
                            path: filePath,
                            message: commitMessage,
                            content: Buffer.from(newContent).toString('base64'),
                            sha: fileSha,
                            branch: branchName,
                        }), `committing changes to ${filePath}`);
                        const commitSha = updateResponse.data?.commit?.sha;
                        if (commitSha) {
                            lastCommitSha = commitSha;
                        }
                        else {
                            core.warning(`No commit SHA returned for ${filePath}, using previous value`);
                        }
                        modifiedFiles.push(filePath);
                        core.info(`Modified: ${filePath}`);
                    }
                }
                catch (fileError) {
                    const errorMsg = getErrorMessage(fileError, `modifying ${filePath}`);
                    core.warning(errorMsg);
                }
            }
            if (modifiedFiles.length === 0) {
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
        }
        catch (error) {
            const errorMessage = getErrorMessage(error, 'applying fix');
            core.error(`Failed to apply fix: ${errorMessage}`);
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
    async cleanupBranch(branchName, reason) {
        try {
            await this.config.octokit.git.deleteRef({
                owner: this.config.owner,
                repo: this.config.repo,
                ref: `heads/${branchName}`,
            });
            core.debug(`Cleaned up branch ${branchName} (${reason})`);
        }
        catch (cleanupError) {
            const errorMsg = cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError);
            core.debug(`Failed to clean up branch ${branchName}: ${errorMsg}`);
        }
    }
    async triggerValidation(params) {
        const { octokit, owner, repo, validationWorkflow, enableValidation } = this.config;
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
            await withRetry(() => octokit.actions.createWorkflowDispatch({
                owner,
                repo,
                workflow_id: workflowFile,
                ref: 'main',
                inputs: {
                    branch: params.branch,
                    spec: params.spec,
                    preview_url: params.previewUrl,
                    triage_run_id: params.triageRunId || '',
                    fix_branch_name: params.branch,
                },
            }), 'triggering validation workflow');
            core.info('Validation workflow triggered successfully');
            await sleep(2000);
            const runs = await withRetry(() => octokit.actions.listWorkflowRuns({
                owner,
                repo,
                workflow_id: workflowFile,
                branch: 'main',
                per_page: 5,
                status: 'queued',
            }), 'listing workflow runs');
            if (runs.data.workflow_runs.length > 0) {
                const latestRun = runs.data.workflow_runs[0];
                core.info(`Validation workflow run ID: ${latestRun.id}`);
                core.info(`Validation workflow URL: ${latestRun.html_url}`);
                return { runId: latestRun.id };
            }
            const inProgressRuns = await withRetry(() => octokit.actions.listWorkflowRuns({
                owner,
                repo,
                workflow_id: workflowFile,
                branch: 'main',
                per_page: 5,
                status: 'in_progress',
            }), 'listing in_progress workflow runs');
            if (inProgressRuns.data.workflow_runs.length > 0) {
                const latestRun = inProgressRuns.data.workflow_runs[0];
                core.info(`Validation workflow run ID: ${latestRun.id}`);
                core.info(`Validation workflow URL: ${latestRun.html_url}`);
                return { runId: latestRun.id };
            }
            core.warning('Could not find validation workflow run ID');
            return null;
        }
        catch (error) {
            const errorMsg = getErrorMessage(error, 'triggering validation workflow');
            core.error(errorMsg);
            return null;
        }
    }
}
exports.GitHubFixApplier = GitHubFixApplier;
function createFixApplier(config) {
    return new GitHubFixApplier(config);
}
function generateFixBranchName(testFile, timestamp = new Date(), forceUnique = false) {
    const sanitizedFile = testFile
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    const uniqueSuffix = forceUnique
        ? `-${timestamp.getTime().toString(36)}`
        : `-${timestamp.getMilliseconds().toString().padStart(3, '0')}`;
    return `${constants_1.AUTO_FIX.BRANCH_PREFIX}${sanitizedFile}-${dateStr}${uniqueSuffix}`;
}
function generateFixCommitMessage(recommendation) {
    const files = recommendation.proposedChanges.map((c) => c.file).join(', ');
    const summary = recommendation.summary.slice(0, 50);
    return `fix(test): ${summary}

Automated fix generated by adept-triage-agent.

Files modified: ${files}
Confidence: ${recommendation.confidence}%

${recommendation.reasoning}`;
}
//# sourceMappingURL=fix-applier.js.map