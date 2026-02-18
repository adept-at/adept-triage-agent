/**
 * Local integration test for WDIO (WebDriverIO) triage path.
 *
 * Proves that when job logs contain WebDriverIO/Mocha failure output,
 * the triage agent correctly:
 * 1. Extracts error data with framework: 'webdriverio'
 * 2. Runs analysis and produces a verdict
 *
 * How the action is consumed:
 * - This repo (adept-triage-agent): workflows can use `uses: ./` to run the
 *   action from the current checkout (local consumption for testing).
 * - Consumer repos (e.g. lib-cypress-canary, lib-wdio-8-multi-remote): use
 *   `uses: adept-at/adept-triage-agent@v1` and set OPENAI_API_KEY (and any
 *   other secrets) in their own repo settings. They do not "pass" the agent
 *   from elsewhere; each repo references the published action and its own secrets.
 *
 * Run: npm run test:integration -- --testPathPattern=wdio-triage
 */

import { Octokit } from '@octokit/rest';
import { processWorkflowLogs } from '../../src/services/log-processor';
import { analyzeFailure } from '../../src/simplified-analyzer';
import { OpenAIClient } from '../../src/openai-client';
import { ArtifactFetcher } from '../../src/artifact-fetcher';
import type { ActionInputs } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

jest.mock('@actions/github', () => ({
  context: {
    runId: 99999,
    job: 'sauceTest',
    repo: { owner: 'adept-at', repo: 'lib-wdio-8-multi-remote' },
    payload: {},
  },
}));

// Real WDIO-style log output (simplified from typical Mocha + WDIO failure)
const WDIO_FAILURE_LOG = `
[0-0] RUNNING in chrome - file:///test/specs/orginvites/invite.org.trainer.ts
[0-0] 
[0-0]  "invite trainer" scenario
[0-0]    ✖ fails when invite button is missing
[0-0] 
[0-0] Error: element ("[data-testid=invite-button]") still not visible after 10000 ms
[0-0]     at Context.<anonymous> (test/specs/orginvites/invite.org.trainer.ts:45:12)
[0-0]     at processTicksAndRejections (node:internal/process/task_queues:95:5)
[0-0] 
[0-0] 1 failing (3.2s)
`;

describe('WDIO Triage Integration', () => {
  let mockOctokit: jest.Mocked<Partial<Octokit>>;
  let mockArtifactFetcher: jest.Mocked<Partial<ArtifactFetcher>>;
  let mockOpenAIClient: jest.Mocked<Partial<OpenAIClient>>;

  const inputs: ActionInputs = {
    githubToken: 'test-token',
    openaiApiKey: 'test-openai-key',
    workflowRunId: '99999',
    jobName: 'sauceTest',
    confidenceThreshold: 70,
    testFrameworks: 'webdriverio',
  };

  const repoDetails = { owner: 'adept-at', repo: 'lib-wdio-8-multi-remote' };

  beforeEach(() => {
    jest.clearAllMocks();

    mockOctokit = {
      actions: {
        getWorkflowRun: jest.fn().mockResolvedValue({ data: { status: 'completed' } }),
        listJobsForWorkflowRun: jest.fn().mockResolvedValue({
          data: {
            jobs: [
              {
                id: 123,
                name: 'sauceTest',
                conclusion: 'failure',
                status: 'completed',
                html_url: 'https://github.com/adept-at/lib-wdio-8-multi-remote/actions/runs/99999',
                steps: [{ name: 'run wdio', conclusion: 'failure' }],
              },
            ],
          },
        }),
        downloadJobLogsForWorkflowRun: jest.fn().mockResolvedValue({ data: WDIO_FAILURE_LOG }),
      },
    } as any;

    mockArtifactFetcher = {
      fetchScreenshots: jest.fn().mockResolvedValue([]),
      fetchTestArtifactLogs: jest.fn().mockResolvedValue(''),
      fetchPRDiff: jest.fn().mockResolvedValue(null),
    };

    mockOpenAIClient = {
      analyze: jest.fn().mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: 'Element visibility timeout indicates test synchronization or selector issue.',
        indicators: ['element not visible', 'timeout'],
      }),
    };
  });

  it('should extract WDIO error from job logs and set framework to webdriverio', async () => {
    const errorData = await processWorkflowLogs(
      mockOctokit as Octokit,
      mockArtifactFetcher as ArtifactFetcher,
      inputs,
      repoDetails
    );

    expect(errorData).not.toBeNull();
    expect(errorData?.framework).toBe('webdriverio');
    expect(errorData?.message).toContain('still not visible');
    expect(errorData?.message).toContain('invite-button');
    expect(mockOctokit.actions?.downloadJobLogsForWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 123 })
    );
  });

  it('should run full triage path: processWorkflowLogs -> analyzeFailure with WDIO logs', async () => {
    const errorData = await processWorkflowLogs(
      mockOctokit as Octokit,
      mockArtifactFetcher as ArtifactFetcher,
      inputs,
      repoDetails
    );

    expect(errorData).not.toBeNull();
    expect(errorData?.framework).toBe('webdriverio');

    const result = await analyzeFailure(
      mockOpenAIClient as OpenAIClient,
      errorData!
    );

    expect(result.verdict).toBe('TEST_ISSUE');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.reasoning).toBeDefined();
    expect(mockOpenAIClient.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        framework: 'webdriverio',
        message: expect.stringContaining('still not visible'),
      }),
      expect.any(Array)
    );
  });
});
