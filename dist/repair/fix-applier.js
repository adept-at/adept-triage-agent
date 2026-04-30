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
const core = __importStar(require("@actions/core"));
const constants_1 = require("../config/constants");
const test_evidence_1 = require("../services/test-evidence");
const text_utils_1 = require("../utils/text-utils");
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
        let branchName = '';
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
            const commitResult = await this.commitChanges(recommendation, branchName);
            if (!commitResult.success) {
                await this.cleanupBranch(branchName, commitResult.error || 'commit failed');
                return commitResult;
            }
            core.info(`Successfully created fix branch: ${branchName}`);
            if (commitResult.commitSha) {
                core.info(`Commit SHA: ${commitResult.commitSha}`);
            }
            return commitResult;
        }
        catch (error) {
            const errorMessage = getErrorMessage(error, 'applying fix');
            core.error(`Failed to apply fix: ${errorMessage}`);
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
        if (params.spec && !params.spec.includes('/')) {
            core.warning(`Spec "${params.spec}" looks like a bare basename. Consumer validate-fix workflows must resolve it against the test root (e.g. \`find ./cypress -type f -name "$BASENAME"\`) or the runner will exit cleanly without running any tests. Prefer passing a repo-relative path in VALIDATION_SPEC.`);
        }
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
                    test_command: params.testCommand || '',
                },
            }), 'triggering validation workflow');
            core.info('Validation workflow triggered successfully');
            const dispatchedAt = new Date();
            const maxPollAttempts = 10;
            const pollInterval = 3000;
            for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
                await sleep(attempt === 1 ? 5000 : pollInterval);
                core.info(`Searching for validation run (attempt ${attempt}/${maxPollAttempts})...`);
                const runs = await withRetry(() => octokit.actions.listWorkflowRuns({
                    owner,
                    repo,
                    workflow_id: workflowFile,
                    per_page: 10,
                }), 'listing workflow runs');
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
            core.warning(`Validation workflow was triggered, but could not find run after ${maxPollAttempts} attempts`);
            return {};
        }
        catch (error) {
            const errorMsg = getErrorMessage(error, 'triggering validation workflow');
            core.error(errorMsg);
            return null;
        }
    }
    async reapplyFix(recommendation, branchName) {
        const { octokit, owner, repo, baseBranch } = this.config;
        try {
            const baseBranchRef = await withRetry(() => octokit.git.getRef({ owner, repo, ref: `heads/${baseBranch}` }), `getting base branch '${baseBranch}'`);
            const baseSha = baseBranchRef.data.object.sha;
            await withRetry(() => octokit.git.updateRef({
                owner,
                repo,
                ref: `heads/${branchName}`,
                sha: baseSha,
                force: true,
            }), `resetting branch ${branchName} to base`);
            core.info(`Reset branch ${branchName} to base SHA ${baseSha.slice(0, 7)}`);
            return await this.commitChanges(recommendation, branchName);
        }
        catch (error) {
            const errorMessage = getErrorMessage(error, 'reapplying fix');
            core.error(`Failed to reapply fix: ${errorMessage}`);
            return { success: false, modifiedFiles: [], error: errorMessage };
        }
    }
    async waitForValidation(runId) {
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
                    const apiPassed = conclusion === 'success';
                    const logs = await this.getValidationFailureLogs(runId);
                    if (apiPassed) {
                        const evidence = (0, test_evidence_1.verifyTestEvidence)(logs);
                        if (!evidence.trustworthy) {
                            const status = deriveFailedValidationStatus('success-without-test-evidence', logs);
                            core.warning(`Validation run ${runId} reported conclusion=success but ${evidence.reason} — treating as failed to avoid poisoning the skill store with a false validation.`);
                            return {
                                passed: false,
                                conclusion: 'success-without-test-evidence',
                                logs,
                                runId,
                                url: html_url,
                                validationResult: buildRemoteValidationResult({
                                    status,
                                    runId,
                                    url: html_url,
                                    conclusion: 'success-without-test-evidence',
                                    logs,
                                    testEvidence: evidence,
                                }),
                            };
                        }
                        core.info(`✅ Test evidence verified: ${evidence.reason}`);
                        return {
                            passed: true,
                            conclusion: conclusion || 'success',
                            logs: undefined,
                            runId,
                            url: html_url,
                            validationResult: buildRemoteValidationResult({
                                status: 'passed',
                                runId,
                                url: html_url,
                                conclusion: conclusion || 'success',
                                logs,
                                testEvidence: evidence,
                            }),
                        };
                    }
                    const status = deriveFailedValidationStatus(conclusion || 'unknown', logs);
                    return {
                        passed: false,
                        conclusion: conclusion || 'unknown',
                        logs,
                        runId,
                        url: html_url,
                        validationResult: buildRemoteValidationResult({
                            status,
                            runId,
                            url: html_url,
                            conclusion: conclusion || 'unknown',
                            logs,
                        }),
                    };
                }
            }
            catch (error) {
                core.warning(`Error polling validation run ${runId}: ${error}`);
            }
            await sleep(POLL_INTERVAL_MS);
        }
        return {
            passed: false,
            conclusion: 'timeout',
            logs: `Validation run ${runId} did not complete within ${POLL_TIMEOUT_MS / 1000}s`,
            runId,
            validationResult: {
                status: 'pending',
                mode: 'remote',
                runId,
                conclusion: 'timeout',
            },
        };
    }
    async getValidationFailureLogs(runId) {
        const { octokit, owner, repo } = this.config;
        try {
            const jobs = await withRetry(() => octokit.actions.listJobsForWorkflowRun({
                owner,
                repo,
                run_id: runId,
                filter: 'latest',
            }), `listing jobs for validation run ${runId}`);
            const jobsToRead = [...jobs.data.jobs].sort((a, b) => {
                if (a.conclusion === 'failure' && b.conclusion !== 'failure')
                    return -1;
                if (b.conclusion === 'failure' && a.conclusion !== 'failure')
                    return 1;
                return 0;
            });
            if (jobsToRead.length === 0)
                return 'No job found in validation run';
            const logChunks = [];
            for (const job of jobsToRead) {
                try {
                    const logsResponse = await withRetry(() => octokit.actions.downloadJobLogsForWorkflowRun({
                        owner,
                        repo,
                        job_id: job.id,
                    }), `downloading logs for validation job ${job.id}`);
                    const rawLogs = typeof logsResponse.data === 'string'
                        ? logsResponse.data
                        : String(logsResponse.data);
                    logChunks.push(`--- job ${job.name || job.id} (${job.conclusion || 'unknown'}) ---\n${rawLogs}`);
                }
                catch (jobLogError) {
                    core.warning(`Failed to fetch logs for validation job ${job.id}: ${jobLogError}`);
                }
            }
            const rawLogs = logChunks.join('\n\n') || 'No validation job logs could be downloaded';
            const maxLen = 20_000;
            if (rawLogs.length > maxLen) {
                return rawLogs.slice(-maxLen);
            }
            return rawLogs;
        }
        catch (error) {
            core.warning(`Failed to fetch validation logs for run ${runId}: ${error}`);
            return `Could not fetch validation logs: ${error}`;
        }
    }
    async commitChanges(recommendation, branchName) {
        const { octokit, owner, repo } = this.config;
        const modifiedFiles = [];
        let lastCommitSha = '';
        const totalChanges = recommendation.proposedChanges.length;
        const fileBuffers = new Map();
        const validationErrors = [];
        let appliedTotal = 0;
        for (const change of recommendation.proposedChanges) {
            const filePath = change.file;
            try {
                let buffer = fileBuffers.get(filePath);
                if (!buffer) {
                    const fileResponse = await withRetry(() => octokit.repos.getContent({
                        owner,
                        repo,
                        path: filePath,
                        ref: branchName,
                    }), `getting file content for ${filePath}`);
                    if (Array.isArray(fileResponse.data) ||
                        fileResponse.data.type !== 'file') {
                        validationErrors.push(`${filePath} is not a file`);
                        continue;
                    }
                    buffer = {
                        content: Buffer.from(fileResponse.data.content, 'base64').toString('utf-8'),
                        fileSha: fileResponse.data.sha,
                        appliedChanges: 0,
                        firstJustification: change.justification,
                    };
                    fileBuffers.set(filePath, buffer);
                }
                if (!change.oldCode || !change.newCode) {
                    continue;
                }
                const currentContent = buffer.content;
                let matchIndex = currentContent.indexOf(change.oldCode);
                let effectiveOldCode = change.oldCode;
                if (matchIndex === -1) {
                    core.info(`Exact match failed for ${filePath}, trying fuzzy strategies...`);
                    const stripped = change.oldCode
                        .split('\n')
                        .map((line) => line.replace(/^\s*\d+:\s?/, ''))
                        .join('\n');
                    if (stripped !== change.oldCode) {
                        matchIndex = currentContent.indexOf(stripped);
                        if (matchIndex !== -1) {
                            effectiveOldCode = stripped;
                            core.info(`  ✅ Matched after stripping line number prefixes`);
                        }
                    }
                    if (matchIndex === -1) {
                        const normalizedOld = change.oldCode
                            .split('\n')
                            .map((l) => l.trimEnd())
                            .join('\n');
                        const normalizedContent = currentContent
                            .split('\n')
                            .map((l) => l.trimEnd())
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
                        validationErrors.push(`Could not find old code to replace in ${filePath}`);
                        continue;
                    }
                }
                const secondMatch = currentContent.indexOf(effectiveOldCode, matchIndex + 1);
                if (secondMatch !== -1) {
                    validationErrors.push(`oldCode matches multiple locations in ${filePath} — ambiguous replacement rejected`);
                    continue;
                }
                buffer.content =
                    currentContent.slice(0, matchIndex) +
                        change.newCode +
                        currentContent.slice(matchIndex + effectiveOldCode.length);
                buffer.appliedChanges += 1;
                appliedTotal += 1;
            }
            catch (fileError) {
                validationErrors.push(getErrorMessage(fileError, `validating ${filePath}`));
            }
        }
        if (appliedTotal === 0) {
            for (const err of validationErrors)
                core.warning(err);
            return {
                success: false,
                modifiedFiles: [],
                error: `No files could be modified. Validation errors: ${validationErrors.join('; ')}`,
            };
        }
        if (totalChanges > 1 && validationErrors.length > 0) {
            core.warning(`${validationErrors.length} of ${totalChanges} changes failed validation — aborting to avoid incomplete fix`);
            for (const err of validationErrors) {
                core.warning(`  - ${err}`);
            }
            return {
                success: false,
                modifiedFiles: [],
                error: `Partial fix rejected: ${validationErrors.length} of ${totalChanges} changes failed validation`,
            };
        }
        try {
            const branchRef = await withRetry(() => octokit.git.getRef({ owner, repo, ref: `heads/${branchName}` }), `getting ref for ${branchName}`);
            const baseSha = branchRef.data.object.sha;
            const treeItems = [];
            for (const [filePath, buffer] of fileBuffers) {
                if (buffer.appliedChanges === 0)
                    continue;
                treeItems.push({
                    path: filePath,
                    mode: '100644',
                    type: 'blob',
                    content: buffer.content,
                });
                modifiedFiles.push(filePath);
            }
            const fileList = modifiedFiles.join(', ');
            const firstFile = modifiedFiles[0];
            const justification = fileBuffers
                .get(firstFile)
                .firstJustification.slice(0, 50);
            const commitMessage = `fix(test): ${justification}

Automated fix generated by adept-triage-agent.

Files: ${fileList}
Confidence: ${recommendation.confidence}%`;
            const tree = await withRetry(() => octokit.git.createTree({
                owner,
                repo,
                base_tree: baseSha,
                tree: treeItems,
            }), 'creating tree for atomic commit');
            const commit = await withRetry(() => octokit.git.createCommit({
                owner,
                repo,
                message: commitMessage,
                tree: tree.data.sha,
                parents: [baseSha],
            }), 'creating commit');
            await withRetry(() => octokit.git.updateRef({
                owner,
                repo,
                ref: `heads/${branchName}`,
                sha: commit.data.sha,
            }), `updating ref heads/${branchName}`);
            lastCommitSha = commit.data.sha;
            for (const f of modifiedFiles)
                core.info(`Modified: ${f}`);
        }
        catch (commitError) {
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
function deriveFailedValidationStatus(conclusion, logs) {
    if (hasConcreteFailureEvidence(logs))
        return 'failed';
    if (conclusion === 'failure')
        return 'failed';
    return 'inconclusive';
}
function hasConcreteFailureEvidence(logs) {
    if (!logs)
        return false;
    return /(?:\b\d+\s+failing\b|AssertionError|CypressError|TimeoutError|Process completed with exit code [1-9])/i.test(logs);
}
function buildRemoteValidationResult(params) {
    const primaryError = extractPrimaryValidationError(params.logs);
    return {
        status: params.status,
        mode: 'remote',
        runId: params.runId,
        url: params.url,
        conclusion: params.conclusion,
        ...(params.testEvidence ? { testEvidence: params.testEvidence } : {}),
        ...(primaryError
            ? {
                failure: {
                    primaryError,
                    failedAssertion: extractFailedAssertion(primaryError),
                    failureStage: 'validation',
                },
            }
            : {}),
    };
}
function extractPrimaryValidationError(logs) {
    if (!logs)
        return undefined;
    const clean = logs.replace(text_utils_1.ANSI_ESCAPE_REGEX, '');
    const patterns = [
        /AssertionError:[^\n]+/i,
        /CypressError:[^\n]+/i,
        /TimeoutError:[^\n]+/i,
        /Error:[^\n]+/i,
    ];
    for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (match)
            return match[0].trim().slice(0, 500);
    }
    return undefined;
}
function extractFailedAssertion(primaryError) {
    const expectedMatch = primaryError.match(/expected\s+(.+)/i);
    if (expectedMatch)
        return expectedMatch[0].slice(0, 300);
    const timedOutMatch = primaryError.match(/Timed out[^:]*:\s*(.+)/i);
    if (timedOutMatch)
        return timedOutMatch[1].slice(0, 300);
    return undefined;
}
function computeLineSimilarity(a, b) {
    const aLines = a.split('\n').map((l) => l.trim()).filter(Boolean);
    const bLines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    if (aLines.length === 0 || bLines.length === 0)
        return 0;
    let matched = 0;
    for (const aLine of aLines) {
        const aTokens = aLine.split(/\s+/).filter((t) => t.length > 2);
        if (aTokens.length === 0) {
            matched++;
            continue;
        }
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
//# sourceMappingURL=fix-applier.js.map