import * as core from '@actions/core';
import * as github from '@actions/github';
import { PipelineCoordinator } from '../../src/pipeline/coordinator';
import { processWorkflowLogs } from '../../src/services/log-processor';
import { claimSourceRunSlot } from '../../src/services/source-run-gate';
import type { ActionInputs } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
}));
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'adept-at', repo: 'learn-webapp' },
    runId: 999,
    payload: {},
  },
}));
jest.mock('../../src/services/log-processor');
jest.mock('../../src/services/source-run-gate');

const mockProcessWorkflowLogs = processWorkflowLogs as jest.MockedFunction<
  typeof processWorkflowLogs
>;
const mockClaimSourceRunSlot = claimSourceRunSlot as jest.MockedFunction<
  typeof claimSourceRunSlot
>;
const mockCore = core as jest.Mocked<typeof core>;

function makeCoordinator(
  overrides: Partial<ActionInputs> = {}
): PipelineCoordinator {
  const inputs: ActionInputs = {
    githubToken: 'test-token',
    openaiApiKey: 'test-key',
    workflowRunId: '30646230879',
    workflowRunAttempt: 2,
    confidenceThreshold: 70,
    productRepo: 'adept-at/learn-webapp',
    persistResults: true,
    ...overrides,
  };
  const octokit = {
    actions: {
      getWorkflowRun: jest
        .fn()
        .mockResolvedValue({ data: { status: 'completed' } }),
      get getWorkflowRunAttempt() {
        return this.getWorkflowRun;
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return new PipelineCoordinator({
    octokit,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openaiClient: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artifactFetcher: {} as any,
    inputs,
    repoDetails: { owner: 'adept-at', repo: 'learn-webapp' },
  });
}

describe('PipelineCoordinator source-run gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns limit outputs before logs or artifacts are processed', async () => {
    mockClaimSourceRunSlot.mockResolvedValue({ status: 'limited' });

    await makeCoordinator().execute();

    expect(mockClaimSourceRunSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'adept-at/learn-webapp',
        sourceRunId: '30646230879',
        sourceRunAttempt: 2,
        maxAttempts: 2,
      })
    );
    expect(mockProcessWorkflowLogs).not.toHaveBeenCalled();
    expect(mockCore.setOutput).toHaveBeenCalledWith(
      'verdict',
      'TRIAGE_LIMIT_REACHED'
    );
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it('fails closed before processing evidence when DynamoDB is unavailable', async () => {
    mockClaimSourceRunSlot.mockResolvedValue({
      status: 'unavailable',
      reason: 'dynamo unavailable',
    });

    await makeCoordinator().execute();

    expect(mockProcessWorkflowLogs).not.toHaveBeenCalled();
    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('admission budget could not be verified')
    );
  });

  it('gates a workflow_run payload when no explicit workflow run ID is supplied', async () => {
    mockClaimSourceRunSlot.mockResolvedValue({ status: 'limited' });
    (github.context as any).payload = { workflow_run: { id: 123456 } };

    try {
      await makeCoordinator({ workflowRunId: undefined }).execute();
    } finally {
      (github.context as any).payload = {};
    }

    expect(mockClaimSourceRunSlot).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRunId: '123456', sourceRunAttempt: 2 })
    );
    expect(mockProcessWorkflowLogs).not.toHaveBeenCalled();
  });

  it('continues for a legacy caller when admission credentials are unavailable', async () => {
    mockClaimSourceRunSlot.mockResolvedValue({
      status: 'unavailable',
      reason: 'no AWS credentials',
    });
    mockProcessWorkflowLogs.mockResolvedValue(null);

    await makeCoordinator({ sourceRunGateRequired: false }).execute();

    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('continuing without enforcement')
    );
    expect(mockProcessWorkflowLogs).toHaveBeenCalledTimes(1);
  });

  it('bypasses the persistent gate when persistence is disabled', async () => {
    mockProcessWorkflowLogs.mockResolvedValue(null);

    await makeCoordinator({ persistResults: false }).execute();

    expect(mockClaimSourceRunSlot).not.toHaveBeenCalled();
    expect(mockProcessWorkflowLogs).toHaveBeenCalledTimes(1);
  });
});
