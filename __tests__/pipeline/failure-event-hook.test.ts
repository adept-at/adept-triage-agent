/**
 * Coverage for the failure-event hook in `PipelineCoordinator.runClassifyAndRepair`:
 * one `recordFailureEvent` call per verdict (normal classify path AND the
 * infrastructure fast-path), nothing recorded on the no-error-data path.
 */
import { PipelineCoordinator } from '../../src/pipeline/coordinator';
import { recordFailureEvent } from '../../src/services/failure-event-store';
import { processWorkflowLogs } from '../../src/services/log-processor';
import { analyzeFailure } from '../../src/simplified-analyzer';
import type { ActionInputs, ErrorData } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
}));

jest.mock('../../src/services/failure-event-store');
jest.mock('../../src/services/log-processor');
jest.mock('../../src/simplified-analyzer');

const mockRecordFailureEvent = recordFailureEvent as jest.MockedFunction<
  typeof recordFailureEvent
>;
const mockProcessWorkflowLogs = processWorkflowLogs as jest.MockedFunction<
  typeof processWorkflowLogs
>;
const mockAnalyzeFailure = analyzeFailure as jest.MockedFunction<
  typeof analyzeFailure
>;

const baseErrorData = (overrides: Partial<ErrorData> = {}): ErrorData => ({
  message: 'AssertionError: expected true to be false',
  stackTrace: 'at Context.<anonymous> (login.cy.ts:14:5)',
  testName: 'logs in successfully',
  fileName: 'cypress/e2e/auth/login.cy.ts',
  framework: 'cypress',
  ...overrides,
});

function makeCoordinator(): PipelineCoordinator {
  const inputs: ActionInputs = {
    githubToken: 'test-token',
    openaiApiKey: 'test-key',
    workflowRunId: '555',
    confidenceThreshold: 70,
    productRepo: 'adept-at/learn-webapp',
    branch: 'feature-x',
    prNumber: '17',
  };
  const octokit = {
    actions: {
      getWorkflowRun: jest
        .fn()
        .mockResolvedValue({ data: { status: 'completed' } }),
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
    repoDetails: { owner: 'adept-at', repo: 'lib-wdio-9-e2e-ts' },
  });
}

describe('failure-event hook in runClassifyAndRepair', () => {
  const originalEnv = {
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_REPOSITORY = 'adept-at/learn-webapp';
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    process.env.GITHUB_RUN_ID = '999';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('records once with the classifier verdict/confidence, including non-TEST_ISSUE', async () => {
    mockProcessWorkflowLogs.mockResolvedValue(baseErrorData());
    mockAnalyzeFailure.mockResolvedValue({
      verdict: 'PRODUCT_ISSUE',
      confidence: 90,
      reasoning: 'product regression',
      summary: 'product broke',
    });

    await makeCoordinator().execute();

    expect(mockRecordFailureEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordFailureEvent).toHaveBeenCalledWith(
      'us-east-1',
      'triage-skills-v1-live',
      expect.objectContaining({
        repo: 'adept-at/learn-webapp',
        spec: 'cypress/e2e/auth/login.cy.ts',
        testName: 'logs in successfully',
        framework: 'cypress',
        verdict: 'PRODUCT_ISSUE',
        confidence: 90,
        sourceRunId: '555',
        triageRunUrl: 'https://github.com/adept-at/learn-webapp/actions/runs/999',
        branch: 'feature-x',
        prNumber: '17',
      })
    );
  });

  it('records INCONCLUSIVE/95 on the infrastructure fast-path without calling the classifier', async () => {
    mockProcessWorkflowLogs.mockResolvedValue(
      baseErrorData({
        message: 'WebDriverError: Failed to create a session',
        stackTrace: '',
      })
    );

    await makeCoordinator().execute();

    expect(mockAnalyzeFailure).not.toHaveBeenCalled();
    expect(mockRecordFailureEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordFailureEvent).toHaveBeenCalledWith(
      'us-east-1',
      'triage-skills-v1-live',
      expect.objectContaining({ verdict: 'INCONCLUSIVE', confidence: 95 })
    );
  });

  it('does not record on the no-error-data path', async () => {
    mockProcessWorkflowLogs.mockResolvedValue(null);

    await makeCoordinator().execute();

    expect(mockRecordFailureEvent).not.toHaveBeenCalled();
  });
});
