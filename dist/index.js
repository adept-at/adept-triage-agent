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
exports.run = run;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const rest_1 = require("@octokit/rest");
const simplified_analyzer_1 = require("./simplified-analyzer");
const openai_client_1 = require("./openai-client");
const artifact_fetcher_1 = require("./artifact-fetcher");
const repair_context_1 = require("./repair-context");
const simplified_repair_agent_1 = require("./repair/simplified-repair-agent");
async function run() {
    try {
        const inputs = getInputs();
        const octokit = new rest_1.Octokit({ auth: inputs.githubToken });
        const openaiClient = new openai_client_1.OpenAIClient(inputs.openaiApiKey);
        const artifactFetcher = new artifact_fetcher_1.ArtifactFetcher(octokit);
        const errorData = await getErrorData(octokit, artifactFetcher, inputs);
        if (!errorData) {
            const context = github.context;
            const { owner, repo } = context.repo;
            const runId = inputs.workflowRunId || context.runId.toString();
            try {
                const workflowRun = await octokit.actions.getWorkflowRun({
                    owner,
                    repo,
                    run_id: parseInt(runId, 10)
                });
                if (workflowRun.data.status !== 'completed') {
                    core.warning(`Workflow run ${runId} is still in progress (status: ${workflowRun.data.status})`);
                    const pendingTriageJson = {
                        verdict: 'PENDING',
                        confidence: 0,
                        reasoning: 'Workflow is still running. Please wait for it to complete before running triage analysis.',
                        summary: 'Analysis pending - workflow not completed',
                        indicators: [],
                        metadata: {
                            analyzedAt: new Date().toISOString(),
                            workflowStatus: workflowRun.data.status
                        }
                    };
                    core.setOutput('verdict', 'PENDING');
                    core.setOutput('confidence', '0');
                    core.setOutput('reasoning', 'Workflow is still running. Please wait for it to complete before running triage analysis.');
                    core.setOutput('summary', 'Analysis pending - workflow not completed');
                    core.setOutput('triage_json', JSON.stringify(pendingTriageJson));
                    return;
                }
            }
            catch (error) {
                core.debug(`Error checking workflow status: ${error}`);
            }
            core.setFailed('No error data found to analyze');
            return;
        }
        const result = await (0, simplified_analyzer_1.analyzeFailure)(openaiClient, errorData);
        let fixRecommendation = null;
        if (result.verdict === 'TEST_ISSUE') {
            try {
                core.info('\n🔧 Attempting to generate fix recommendation...');
                const repairContext = (0, repair_context_1.buildRepairContext)({
                    testFile: errorData.fileName || 'unknown',
                    testName: errorData.testName || 'unknown',
                    errorMessage: errorData.message,
                    workflowRunId: inputs.workflowRunId || github.context.runId.toString(),
                    jobName: inputs.jobName || 'unknown',
                    commitSha: inputs.commitSha || github.context.sha,
                    branch: github.context.ref.replace('refs/heads/', ''),
                    repository: inputs.repository || `${github.context.repo.owner}/${github.context.repo.repo}`,
                    prNumber: inputs.prNumber,
                    targetAppPrNumber: inputs.prNumber
                });
                const repairAgent = new simplified_repair_agent_1.SimplifiedRepairAgent(inputs.openaiApiKey);
                fixRecommendation = await repairAgent.generateFixRecommendation(repairContext, errorData);
                if (fixRecommendation) {
                    core.info(`✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`);
                    result.fixRecommendation = fixRecommendation;
                }
                else {
                    core.info('❌ Could not generate fix recommendation');
                }
            }
            catch (error) {
                core.warning(`Failed to generate fix recommendation: ${error}`);
            }
        }
        if (result.confidence < inputs.confidenceThreshold) {
            core.warning(`Confidence ${result.confidence}% is below threshold ${inputs.confidenceThreshold}%`);
            const inconclusiveTriageJson = {
                verdict: 'INCONCLUSIVE',
                confidence: result.confidence,
                reasoning: `Low confidence: ${result.reasoning}`,
                summary: 'Analysis inconclusive due to low confidence',
                indicators: result.indicators || [],
                metadata: {
                    analyzedAt: new Date().toISOString(),
                    confidenceThreshold: inputs.confidenceThreshold,
                    hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
                    logSize: errorData.logs?.join('').length || 0
                }
            };
            core.setOutput('verdict', 'INCONCLUSIVE');
            core.setOutput('confidence', result.confidence.toString());
            core.setOutput('reasoning', `Low confidence: ${result.reasoning}`);
            core.setOutput('summary', 'Analysis inconclusive due to low confidence');
            core.setOutput('triage_json', JSON.stringify(inconclusiveTriageJson));
            return;
        }
        const triageJson = {
            verdict: result.verdict,
            confidence: result.confidence,
            reasoning: result.reasoning,
            summary: result.summary,
            indicators: result.indicators || [],
            ...(result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations ? { suggestedSourceLocations: result.suggestedSourceLocations } : {}),
            ...(result.verdict === 'TEST_ISSUE' && result.fixRecommendation ? { fixRecommendation: result.fixRecommendation } : {}),
            metadata: {
                analyzedAt: new Date().toISOString(),
                hasScreenshots: (errorData.screenshots && errorData.screenshots.length > 0) || false,
                logSize: errorData.logs?.join('').length || 0,
                hasFixRecommendation: !!result.fixRecommendation
            }
        };
        core.setOutput('verdict', result.verdict);
        core.setOutput('confidence', result.confidence.toString());
        core.setOutput('reasoning', result.reasoning);
        core.setOutput('summary', result.summary);
        core.setOutput('triage_json', JSON.stringify(triageJson));
        if (result.fixRecommendation) {
            core.setOutput('has_fix_recommendation', 'true');
            core.setOutput('fix_recommendation', JSON.stringify(result.fixRecommendation));
            core.setOutput('fix_summary', result.fixRecommendation.summary);
            core.setOutput('fix_confidence', result.fixRecommendation.confidence.toString());
        }
        else {
            core.setOutput('has_fix_recommendation', 'false');
        }
        core.info(`Verdict: ${result.verdict}`);
        core.info(`Confidence: ${result.confidence}%`);
        core.info(`Summary: ${result.summary}`);
        if (result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations && result.suggestedSourceLocations.length > 0) {
            core.info('\n🎯 Suggested Source Locations to Investigate:');
            result.suggestedSourceLocations.forEach((location, index) => {
                core.info(`  ${index + 1}. ${location.file} (lines ${location.lines})`);
                core.info(`     Reason: ${location.reason}`);
            });
        }
        if (result.verdict === 'TEST_ISSUE' && result.fixRecommendation) {
            core.info('\n🔧 Fix Recommendation Generated:');
            core.info(`  Confidence: ${result.fixRecommendation.confidence}%`);
            core.info(`  Changes: ${result.fixRecommendation.proposedChanges.length} file(s)`);
            core.info(`  Evidence: ${result.fixRecommendation.evidence.length} item(s)`);
            core.info('\n📝 Fix Summary:');
            core.info(result.fixRecommendation.summary);
        }
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Action failed: ${error.message}`);
        }
        else {
            core.setFailed('An unknown error occurred');
        }
    }
}
function getInputs() {
    return {
        githubToken: core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN || '',
        openaiApiKey: core.getInput('OPENAI_API_KEY', { required: true }),
        errorMessage: core.getInput('ERROR_MESSAGE'),
        workflowRunId: core.getInput('WORKFLOW_RUN_ID'),
        jobName: core.getInput('JOB_NAME'),
        confidenceThreshold: parseInt(core.getInput('CONFIDENCE_THRESHOLD') || '70', 10),
        prNumber: core.getInput('PR_NUMBER'),
        commitSha: core.getInput('COMMIT_SHA'),
        repository: core.getInput('REPOSITORY'),
        testFrameworks: core.getInput('TEST_FRAMEWORKS')
    };
}
async function getErrorData(octokit, artifactFetcher, inputs) {
    const context = github.context;
    const { owner, repo } = context.repo;
    if (inputs.errorMessage) {
        const errorData = {
            message: inputs.errorMessage,
            framework: 'unknown',
            context: 'Error message provided directly via input'
        };
        return errorData;
    }
    let runId = inputs.workflowRunId;
    if (!runId && context.payload.workflow_run) {
        runId = context.payload.workflow_run.id.toString();
    }
    if (!runId) {
        runId = context.runId.toString();
    }
    const isCurrentJob = inputs.jobName && (inputs.jobName === context.job || inputs.jobName.includes(context.job));
    if (!isCurrentJob && (inputs.workflowRunId || context.payload.workflow_run)) {
        const workflowRun = await octokit.actions.getWorkflowRun({
            owner,
            repo,
            run_id: parseInt(runId, 10)
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
        filter: 'latest'
    });
    let targetJob;
    if (inputs.jobName) {
        targetJob = jobs.data.jobs.find(job => job.name === inputs.jobName);
        if (!targetJob) {
            core.warning(`Job '${inputs.jobName}' not found`);
            return null;
        }
        if (isCurrentJob && targetJob.status === 'in_progress') {
            core.info('Current job is still in progress, analyzing available logs...');
        }
        else if (targetJob.conclusion !== 'failure' && targetJob.status === 'completed') {
            core.warning(`Job '${inputs.jobName}' did not fail (conclusion: ${targetJob.conclusion})`);
            return null;
        }
    }
    else {
        targetJob = jobs.data.jobs.find(job => job.conclusion === 'failure');
        if (!targetJob) {
            core.warning('No failed jobs found');
            return null;
        }
    }
    const failedJob = targetJob;
    core.info(`Analyzing job: ${failedJob.name} (status: ${failedJob.status}, conclusion: ${failedJob.conclusion || 'none'})`);
    let fullLogs = '';
    let extractedError = null;
    try {
        const logsResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
            owner,
            repo,
            job_id: failedJob.id
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
    let artifactLogs = '';
    let screenshots = [];
    try {
        screenshots = await artifactFetcher.fetchScreenshots(runId, failedJob.name);
        core.info(`Found ${screenshots.length} screenshots`);
    }
    catch (error) {
        core.warning(`Failed to fetch screenshots: ${error}`);
    }
    try {
        artifactLogs = await artifactFetcher.fetchCypressArtifactLogs(runId, failedJob.name);
        if (artifactLogs) {
            core.info(`Found Cypress artifact logs (${artifactLogs.length} characters)`);
        }
    }
    catch (error) {
        core.warning(`Failed to fetch Cypress artifact logs: ${error}`);
    }
    let prDiff = null;
    if (inputs.prNumber) {
        try {
            prDiff = await artifactFetcher.fetchPRDiff(inputs.prNumber, inputs.repository);
            if (prDiff) {
                core.info(`Successfully fetched PR diff with ${prDiff.totalChanges} changed files`);
            }
        }
        catch (error) {
            core.warning(`Failed to fetch PR diff: ${error}`);
        }
    }
    const contextParts = [
        `=== JOB INFORMATION ===`,
        `Job Name: ${failedJob.name}`,
        `Job URL: ${failedJob.html_url}`,
        `Failed Step: ${failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown'}`,
        ``
    ];
    if (extractedError && extractedError.message) {
        contextParts.push(`=== EXTRACTED ERROR CONTEXT ===`, extractedError.message, ``);
    }
    if (artifactLogs) {
        contextParts.push(`=== CYPRESS ARTIFACT LOGS ===`, artifactLogs, ``);
    }
    if (!inputs.prNumber || !extractedError) {
        const maxLogSize = 50000;
        const truncatedLogs = fullLogs.length > maxLogSize
            ? `${fullLogs.substring(fullLogs.length - maxLogSize)}\n\n[Logs truncated to last ${maxLogSize} characters]`
            : fullLogs;
        contextParts.push(`=== GITHUB ACTIONS LOGS (TRUNCATED) ===`, truncatedLogs, ``);
    }
    contextParts.push(`=== END OF LOGS ===`);
    const combinedContext = contextParts.join('\n');
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
            context: `Job: ${failedJob.name}. ${extractedError.context || 'Complete failure context including all logs and artifacts'}`,
            testName: extractedError.testName || failedJob.name,
            fileName: extractedError.fileName || failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
            screenshots: screenshots,
            logs: [combinedContext],
            cypressArtifactLogs: artifactLogs,
            prDiff: prDiff || undefined
        };
        return errorData;
    }
    const fallbackError = {
        message: 'Test failure - see full context for details',
        framework: 'cypress',
        failureType: 'test-failure',
        context: `Job: ${failedJob.name}. Complete failure context including all logs and artifacts`,
        testName: failedJob.name,
        fileName: failedJob.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
        screenshots: screenshots,
        logs: [combinedContext],
        cypressArtifactLogs: artifactLogs,
        prDiff: prDiff || undefined
    };
    return fallbackError;
}
if (require.main === module) {
    run();
}
//# sourceMappingURL=index.js.map