/**
 * Reusable pipeline test harness.
 * Mocks Octokit and ArtifactFetcher, runs processWorkflowLogs -> analyzeFailure -> generateFixRecommendation.
 * Used by cypress-full-pipeline and wdio-full-pipeline integration tests.
 */

import { Octokit } from '@octokit/rest';
import { processWorkflowLogs } from '../../src/services/log-processor';
import { analyzeFailure } from '../../src/simplified-analyzer';
import { ArtifactFetcher } from '../../src/artifact-fetcher';
import { SimplifiedRepairAgent } from '../../src/repair/simplified-repair-agent';
import { buildRepairContext } from '../../src/repair-context';
import type { ActionInputs, ErrorData, AnalysisResult, FixRecommendation } from '../../src/types';

export interface PipelineHarnessParams {
  rawLogText: string;
  jobName: string;
  runId: string;
  repoDetails: { owner: string; repo: string };
  /** Minimal action inputs; defaults filled for pipeline to run */
  inputs?: Partial<ActionInputs>;
  /** Screenshots to return from artifact fetcher (default []) */
  mockScreenshots?: { name: string; path: string; base64Data?: string }[];
  /** Test artifact logs string (default '') */
  mockArtifactLogs?: string;
}

export interface PipelineResult {
  errorData: ErrorData | null;
  analysisResult: AnalysisResult | null;
  fixRecommendation: FixRecommendation | null;
}

/**
 * Creates a mock Octokit that returns the given raw log for the job and run.
 * Optionally include repos.getContent for agentic path (CodeReadingAgent file fetch).
 */
export function createMockOctokit(
  rawLogText: string,
  jobName: string,
  runId: string,
  options?: { fileContent?: string; filePath?: string }
): jest.Mocked<Partial<Octokit>> {
  const jobId = 12345;
  const base = {
    actions: {
      getWorkflowRun: jest.fn().mockResolvedValue({
        data: { status: 'completed' },
      }),
      listJobsForWorkflowRun: jest.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              id: jobId,
              name: jobName,
              conclusion: 'failure',
              status: 'completed',
              html_url: `https://github.com/run/${runId}`,
              steps: [{ name: 'run tests', conclusion: 'failure' }],
            },
          ],
        },
      }),
      downloadJobLogsForWorkflowRun: jest.fn().mockResolvedValue({
        data: rawLogText as unknown as string,
      }),
    },
  };
  if (options?.fileContent !== undefined) {
    const content = Buffer.from(options.fileContent, 'utf-8').toString('base64');
    const expectedPath = options.filePath;
    (base as Record<string, unknown>).repos = {
      getContent: jest.fn().mockImplementation(({ path }: { path: string }) => {
        if (expectedPath && path !== expectedPath) {
          return Promise.reject(new Error(`File not found: ${path}`));
        }
        return Promise.resolve({
          data: { content, encoding: 'base64' },
        });
      }),
    };
  }
  return base as unknown as jest.Mocked<Partial<Octokit>>;
}

/**
 * Creates a mock ArtifactFetcher that returns the given screenshots and artifact logs.
 * Other methods (fetchPRDiff, etc.) return null/empty so fetchDiffWithFallback does not fail.
 */
export function createMockArtifactFetcher(
  options: {
    screenshots?: { name: string; path: string; base64Data?: string }[];
    artifactLogs?: string;
  } = {}
): jest.Mocked<Partial<ArtifactFetcher>> {
  const screenshots = options.screenshots ?? [];
  const artifactLogs = options.artifactLogs ?? '';
  return {
    fetchScreenshots: jest.fn().mockResolvedValue(screenshots),
    fetchTestArtifactLogs: jest.fn().mockResolvedValue(artifactLogs),
    fetchPRDiff: jest.fn().mockResolvedValue(null),
    fetchBranchDiff: jest.fn().mockResolvedValue(null),
    fetchCommitDiff: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<Partial<ArtifactFetcher>>;
}

/**
 * Runs the pipeline: processWorkflowLogs -> analyzeFailure -> generateFixRecommendation.
 * Caller must mock openaiClient.analyze (for analyzeFailure) and
 * openaiClient.generateWithCustomPrompt (for SimplifiedRepairAgent single-shot).
 */
export async function runPipeline(
  octokit: Octokit,
  artifactFetcher: ArtifactFetcher,
  openaiClient: import('../../src/openai-client').OpenAIClient,
  params: PipelineHarnessParams
): Promise<PipelineResult> {
  const { rawLogText, jobName, runId, repoDetails } = params;
  const inputs: ActionInputs = {
    githubToken: 'test-token',
    openaiApiKey: 'test-key',
    workflowRunId: runId,
    jobName,
    confidenceThreshold: 70,
    testFrameworks: params.inputs?.testFrameworks ?? 'cypress',
    enableAutoFix: false,
    autoFixBaseBranch: 'main',
    autoFixMinConfidence: 70,
    enableAgenticRepair: false,
    ...params.inputs,
  };

  const errorData = await processWorkflowLogs(
    octokit as Octokit,
    artifactFetcher as ArtifactFetcher,
    inputs,
    repoDetails
  );

  if (!errorData) {
    return {
      errorData: null,
      analysisResult: null,
      fixRecommendation: null,
    };
  }

  const analysisResult = await analyzeFailure(openaiClient, errorData);

  let fixRecommendation: FixRecommendation | null = null;
  if (analysisResult.verdict === 'TEST_ISSUE') {
    const repairContext = buildRepairContext({
      testFile: errorData.fileName || 'unknown',
      testName: errorData.testName || 'unknown',
      errorMessage: errorData.message,
      workflowRunId: inputs.workflowRunId || runId,
      jobName: inputs.jobName || jobName,
      commitSha: inputs.commitSha || 'abc123',
      branch: inputs.branch || 'main',
      repository: `${repoDetails.owner}/${repoDetails.repo}`,
      prNumber: inputs.prNumber,
      targetAppPrNumber: inputs.prNumber,
    });
    const repairAgent = new SimplifiedRepairAgent(
      openaiClient,
      {
        octokit: octokit as Octokit,
        owner: repoDetails.owner,
        repo: repoDetails.repo,
        branch: inputs.autoFixBaseBranch || 'main',
      },
      { enableAgenticRepair: inputs.enableAgenticRepair ?? false }
    );
    fixRecommendation = await repairAgent.generateFixRecommendation(
      repairContext,
      errorData
    );
  }

  return {
    errorData,
    analysisResult,
    fixRecommendation,
  };
}
