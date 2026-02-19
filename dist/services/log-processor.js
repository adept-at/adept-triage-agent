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
exports.processWorkflowLogs = processWorkflowLogs;
exports.fetchDiffWithFallback = fetchDiffWithFallback;
exports.capArtifactLogs = capArtifactLogs;
exports.buildStructuredSummary = buildStructuredSummary;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const simplified_analyzer_1 = require("../simplified-analyzer");
const constants_1 = require("../config/constants");
async function processWorkflowLogs(octokit, artifactFetcher, inputs, _repoDetails) {
    const context = github.context;
    const { owner, repo } = context.repo;
    if (inputs.errorMessage) {
        return {
            message: inputs.errorMessage,
            framework: 'unknown',
            context: 'Error message provided directly via input',
        };
    }
    let runId = inputs.workflowRunId;
    if (!runId && context.payload.workflow_run) {
        runId = context.payload.workflow_run.id.toString();
    }
    if (!runId) {
        runId = context.runId.toString();
    }
    const isCurrentJob = !!(inputs.jobName &&
        (inputs.jobName === context.job || inputs.jobName.includes(context.job)));
    if (!isCurrentJob && (inputs.workflowRunId || context.payload.workflow_run)) {
        const workflowRun = await octokit.actions.getWorkflowRun({
            owner,
            repo,
            run_id: parseInt(runId, 10),
        });
        if (workflowRun.data.status !== 'completed') {
            core.warning('Workflow run is not completed yet');
            return null;
        }
    }
    else if (isCurrentJob) {
        core.info(`Analyzing current job: ${inputs.jobName} (workflow still in progress)`);
    }
    const jobs = await octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: parseInt(runId, 10),
        filter: 'latest',
    });
    const targetJob = findTargetJob(jobs.data.jobs, inputs, isCurrentJob ?? false);
    if (!targetJob) {
        return null;
    }
    const failedJob = targetJob;
    core.info(`Analyzing job: ${failedJob.name} (status: ${failedJob.status}, conclusion: ${failedJob.conclusion || 'none'})`);
    let fullLogs = '';
    let extractedError = null;
    try {
        const logsResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
            owner,
            repo,
            job_id: failedJob.id,
        });
        fullLogs = logsResponse.data;
        core.info(`Downloaded ${fullLogs.length} characters of logs for error extraction`);
        extractedError = (0, simplified_analyzer_1.extractErrorFromLogs)(fullLogs);
        if (inputs.prNumber && extractedError) {
            core.info('PR diff available - using extracted error context only');
        }
    }
    catch (error) {
        core.warning(`Failed to download job logs: ${error}`);
    }
    const [screenshots, artifactLogs, prDiff] = await fetchArtifactsParallel(artifactFetcher, runId, failedJob.name, context.repo, inputs);
    const cappedArtifactLogs = capArtifactLogs(artifactLogs);
    const combinedContext = buildErrorContext(failedJob, extractedError, cappedArtifactLogs, fullLogs, inputs);
    const hasLogs = !!(fullLogs && fullLogs.length > 0);
    const hasScreenshots = !!(screenshots && screenshots.length > 0);
    const hasArtifactLogs = !!(artifactLogs && artifactLogs.length > 0);
    const hasPRDiff = !!(prDiff && prDiff.files && prDiff.files.length > 0);
    if (!hasLogs && !hasScreenshots && !hasArtifactLogs && !hasPRDiff) {
        core.warning('No meaningful data collected for analysis (no logs, screenshots, artifacts, or PR diff)');
        core.info('Attempting analysis with minimal context...');
    }
    else {
        core.info(`Data collected for analysis: logs=${hasLogs}, screenshots=${hasScreenshots}, artifactLogs=${hasArtifactLogs}, prDiff=${hasPRDiff}`);
    }
    if (extractedError) {
        const errorData = {
            ...extractedError,
            context: `Job: ${failedJob.name}. ${extractedError.context ||
                'Complete failure context including all logs and artifacts'}`,
            testName: extractedError.testName || failedJob.name,
            fileName: extractedError.fileName ||
                failedJob.steps?.find((s) => s.conclusion === 'failure')?.name ||
                'Unknown',
            screenshots: screenshots,
            logs: [combinedContext],
            testArtifactLogs: capArtifactLogs(artifactLogs),
            prDiff: prDiff || undefined,
        };
        errorData.structuredSummary = buildStructuredSummary(errorData);
        return errorData;
    }
    const fallbackError = {
        message: 'Test failure - see full context for details',
        framework: inputs.testFrameworks || 'unknown',
        failureType: 'test-failure',
        context: `Job: ${failedJob.name}. Complete failure context including all logs and artifacts`,
        testName: failedJob.name,
        fileName: failedJob.steps?.find((s) => s.conclusion === 'failure')?.name ||
            'Unknown',
        screenshots: screenshots,
        logs: [combinedContext],
        testArtifactLogs: capArtifactLogs(artifactLogs),
        prDiff: prDiff || undefined,
    };
    fallbackError.structuredSummary = buildStructuredSummary(fallbackError);
    return fallbackError;
}
function findTargetJob(jobs, inputs, isCurrentJob) {
    if (inputs.jobName) {
        const targetJob = jobs.find((job) => job.name === inputs.jobName);
        if (!targetJob) {
            core.warning(`Job '${inputs.jobName}' not found`);
            return null;
        }
        if (isCurrentJob && targetJob.status === 'in_progress') {
            core.info('Current job is still in progress, analyzing available logs...');
        }
        else if (targetJob.conclusion !== 'failure' &&
            targetJob.status === 'completed') {
            core.warning(`Job '${inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion})`);
            return null;
        }
        return targetJob;
    }
    const failedJob = jobs.find((job) => job.conclusion === 'failure');
    if (!failedJob) {
        core.warning('No failed jobs found');
        return null;
    }
    return failedJob;
}
function logDiffResult(diff, source) {
    if (diff) {
        core.info(`✅ Successfully fetched ${source}:`);
        core.info(`   - Total files changed: ${diff.totalChanges}`);
        core.info(`   - Lines added: +${diff.additions}`);
        core.info(`   - Lines deleted: -${diff.deletions}`);
        if (diff.files.length > 0) {
            core.info(`   - Top files:`);
            diff.files.slice(0, 5).forEach((f) => {
                core.info(`     • ${f.filename} (+${f.additions}/-${f.deletions})`);
            });
            if (diff.files.length > 5) {
                core.info(`     ... and ${diff.files.length - 5} more files`);
            }
        }
    }
}
async function fetchDiffWithFallback(artifactFetcher, inputs) {
    const mainBranches = ['main', 'master'];
    if (inputs.prNumber) {
        const prNum = inputs.prNumber;
        core.info(`📋 Fetching PR diff for PR #${prNum} from ${inputs.repository || 'current repo'}...`);
        try {
            const diff = await artifactFetcher.fetchPRDiff(prNum, inputs.repository);
            logDiffResult(diff, 'PR diff');
            if (diff)
                return diff;
            core.warning(`⚠️ PR diff fetch returned null for PR #${prNum}`);
        }
        catch (error) {
            core.warning(`❌ Failed to fetch PR diff for PR #${prNum}: ${error}`);
        }
    }
    if (inputs.branch && !mainBranches.includes(inputs.branch.toLowerCase())) {
        core.info(`📋 Fetching branch diff: main...${inputs.branch} (preview URL mode)...`);
        try {
            const diff = await artifactFetcher.fetchBranchDiff(inputs.branch, 'main', inputs.repository);
            logDiffResult(diff, 'branch diff');
            if (diff)
                return diff;
            core.warning(`⚠️ Branch diff fetch returned null for ${inputs.branch}`);
        }
        catch (error) {
            core.warning(`❌ Failed to fetch branch diff for ${inputs.branch}: ${error}`);
        }
    }
    if (inputs.commitSha) {
        const isMainBranch = !inputs.branch || mainBranches.includes(inputs.branch.toLowerCase());
        if (isMainBranch) {
            core.info(`📋 Fetching commit diff for ${inputs.commitSha.substring(0, 7)} (production deploy mode)...`);
            try {
                const diff = await artifactFetcher.fetchCommitDiff(inputs.commitSha, inputs.repository);
                logDiffResult(diff, 'commit diff');
                if (diff)
                    return diff;
                core.warning(`⚠️ Commit diff fetch returned null for ${inputs.commitSha.substring(0, 7)}`);
            }
            catch (error) {
                core.warning(`❌ Failed to fetch commit diff: ${error}`);
            }
        }
    }
    if (!inputs.prNumber && !inputs.branch && !inputs.commitSha) {
        core.info(`ℹ️ No PR_NUMBER, BRANCH, or COMMIT_SHA provided, skipping diff fetch`);
    }
    else {
        core.info(`ℹ️ All diff fetch strategies exhausted, proceeding without diff`);
    }
    return null;
}
async function fetchArtifactsParallel(artifactFetcher, runId, jobName, repoDetails, inputs) {
    const screenshotsPromise = artifactFetcher
        .fetchScreenshots(runId, jobName, repoDetails)
        .then((screenshots) => {
        core.info(`Found ${screenshots.length} screenshots`);
        return screenshots;
    })
        .catch((error) => {
        core.warning(`Failed to fetch screenshots: ${error}`);
        return [];
    });
    const artifactLogsPromise = artifactFetcher
        .fetchTestArtifactLogs(runId, jobName, repoDetails)
        .then((logs) => {
        if (logs) {
            core.info(`Found test artifact logs (${logs.length} characters)`);
        }
        return logs;
    })
        .catch((error) => {
        core.warning(`Failed to fetch test artifact logs: ${error}`);
        return '';
    });
    const prDiffPromise = fetchDiffWithFallback(artifactFetcher, inputs);
    return Promise.all([screenshotsPromise, artifactLogsPromise, prDiffPromise]);
}
function buildErrorContext(failedJob, extractedError, artifactLogs, fullLogs, inputs) {
    const contextParts = [
        `=== JOB INFORMATION ===`,
        `Job Name: ${failedJob.name}`,
        `Job URL: ${failedJob.html_url}`,
        `Failed Step: ${failedJob.steps?.find((s) => s.conclusion === 'failure')?.name ||
            'Unknown'}`,
        ``,
    ];
    if (extractedError && extractedError.message) {
        contextParts.push(`=== EXTRACTED ERROR CONTEXT ===`, extractedError.message, ``);
    }
    if (artifactLogs) {
        contextParts.push(`=== TEST ARTIFACT LOGS ===`, artifactLogs, ``);
    }
    if (!inputs.prNumber || !extractedError) {
        const maxLogSize = constants_1.LOG_LIMITS.GITHUB_MAX_SIZE;
        const truncatedLogs = fullLogs.length > maxLogSize
            ? `${fullLogs.substring(fullLogs.length - maxLogSize)}\n\n[Logs truncated to last ${maxLogSize} characters]`
            : fullLogs;
        contextParts.push(`=== GITHUB ACTIONS LOGS (TRUNCATED) ===`, truncatedLogs, ``);
    }
    contextParts.push(`=== END OF LOGS ===`);
    return contextParts.join('\n');
}
function capArtifactLogs(raw) {
    if (!raw)
        return '';
    const MAX = constants_1.LOG_LIMITS.ARTIFACT_SOFT_CAP;
    const esc = String.fromCharCode(27);
    const ansiPattern = new RegExp(`${esc}\\[[0-9;]*m`, 'g');
    const clean = raw.replace(ansiPattern, '');
    if (clean.length <= MAX)
        return clean;
    const lines = clean.split('\n');
    const errorRegex = /(error|failed|failure|exception|assertion|expected|timeout|cypress error|stale element|not interactable|no such element|still not (?:visible|displayed|clickable))/i;
    const focused = [];
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
    const head = clean.substring(0, Math.floor(MAX / 2));
    const tail = clean.substring(clean.length - Math.floor(MAX / 2));
    return `${head}\n\n[...truncated...]\n\n${tail}`;
}
function buildStructuredSummary(err) {
    const hasTimeout = /\btimeout|timed out\b/i.test(err.message || '');
    const hasAssertion = /assertion|expected\s+.*to/i.test(err.message || '');
    const hasDom = /element|selector|not found|visible|covered|detached/i.test(err.message || '');
    const hasNetwork = /network|fetch|graphql|api|500|404|502|503/i.test(err.message || '');
    const hasNullPtr = /cannot read (properties|property) of null|undefined/i.test(err.message || '');
    return {
        primaryError: {
            type: err.failureType || 'Error',
            message: (err.message || '').slice(0, 500),
        },
        testContext: {
            testName: err.testName || 'unknown',
            testFile: err.fileName || 'unknown',
            framework: err.framework || 'unknown',
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
            hasViewportContext: false,
        },
        keyMetrics: {
            hasScreenshots: !!(err.screenshots && err.screenshots.length > 0),
            logSize: err.logs?.join('').length || 0,
        },
    };
}
//# sourceMappingURL=log-processor.js.map