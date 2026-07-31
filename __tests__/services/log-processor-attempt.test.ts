import { processWorkflowLogs } from '../../src/services/log-processor';
import type { ActionInputs } from '../../src/types';
import { mockOctokitPaginate } from '../helpers/mock-paginate';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('@actions/github', () => ({
  context: {
    runId: 999,
    job: 'triage',
    payload: {},
    repo: { owner: 'adept-at', repo: 'learn-webapp' },
  },
}));

describe('processWorkflowLogs source attempt selection', () => {
  it('lists jobs from the dispatched workflow attempt instead of latest', async () => {
    const listJobsForWorkflowRunAttempt = jest.fn().mockResolvedValue({
      data: {
        jobs: [
          {
            id: 123,
            name: 'e2e (login.cy.ts)',
            conclusion: 'failure',
            status: 'completed',
            html_url:
              'https://github.com/adept-at/learn-webapp/actions/runs/30646230879',
            steps: [{ name: 'run cypress', conclusion: 'failure' }],
          },
        ],
      },
    });
    const getWorkflowRunAttempt = jest
      .fn()
      .mockResolvedValue({ data: { status: 'completed' } });
    const octokit = {
      actions: {
        getWorkflowRunAttempt,
        listJobsForWorkflowRunAttempt,
        downloadJobLogsForWorkflowRun: jest
          .fn()
          .mockResolvedValue({ data: 'AssertionError: expected true to be false' }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    mockOctokitPaginate(octokit);

    const artifactFetcher = {
      fetchScreenshots: jest.fn().mockResolvedValue([]),
      fetchTestArtifactLogs: jest.fn().mockResolvedValue(''),
      fetchRecentProductDiff: jest.fn().mockResolvedValue(null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const inputs: ActionInputs = {
      githubToken: 'token',
      openaiApiKey: 'key',
      workflowRunId: '30646230879',
      workflowRunAttempt: 2,
      jobName: 'e2e (login.cy.ts)',
      confidenceThreshold: 70,
      productRepo: 'adept-at/learn-webapp',
    };

    await expect(
      processWorkflowLogs(octokit, artifactFetcher, inputs, {
        owner: 'adept-at',
        repo: 'learn-webapp',
      })
    ).resolves.not.toBeNull();

    expect(getWorkflowRunAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        run_id: 30646230879,
        attempt_number: 2,
      })
    );
    expect(listJobsForWorkflowRunAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        run_id: 30646230879,
        attempt_number: 2,
        per_page: 100,
      })
    );
    expect(artifactFetcher.fetchScreenshots).not.toHaveBeenCalled();
    expect(artifactFetcher.fetchTestArtifactLogs).not.toHaveBeenCalled();
  });
});
