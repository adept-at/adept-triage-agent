import * as core from '@actions/core';
import {
  recordFailureEvent,
  FailureEvent,
} from '../../src/services/failure-event-store';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

// Mock the AWS SDK modules so the dynamic imports resolve to lightweight
// fakes. The command class is named so `constructor.name` works for assertion.
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class DynamoDBClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_cfg: any) {}
  },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const sharedSend = jest.fn();
  return {
    __send: sharedSend,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PutCommand: class PutCommand { constructor(public input: any) {} },
    DynamoDBDocumentClient: {
      from: () => ({ send: sharedSend }),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockSend = require('@aws-sdk/lib-dynamodb').__send as jest.Mock;

function makeEvent(overrides: Partial<FailureEvent> = {}): FailureEvent {
  return {
    repo: 'adept-at/learn-webapp',
    spec: 'cypress/e2e/auth/login.cy.ts',
    testName: 'should login successfully',
    framework: 'cypress',
    verdict: 'TEST_ISSUE',
    confidence: 88,
    failedAt: '2026-07-03T10:00:00.000Z',
    sourceRunId: '12345678',
    triageRunUrl: 'https://github.com/adept-at/learn-webapp/actions/runs/999',
    branch: 'main',
    prNumber: '42',
    ...overrides,
  };
}

describe('recordFailureEvent', () => {
  const originalRunId = process.env.GITHUB_RUN_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
    delete process.env.GITHUB_RUN_ID;
  });

  afterAll(() => {
    if (originalRunId === undefined) {
      delete process.env.GITHUB_RUN_ID;
    } else {
      process.env.GITHUB_RUN_ID = originalRunId;
    }
  });

  it('writes one PutCommand with pk/sk and all FailureEvent fields', async () => {
    const event = makeEvent();
    await recordFailureEvent('us-east-1', 'triage-skills-v1-live', event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.constructor.name).toBe('PutCommand');
    expect(command.input.TableName).toBe('triage-skills-v1-live');

    const item = command.input.Item;
    expect(item.pk).toBe('REPO#adept-at/learn-webapp');
    expect(item.sk).toMatch(/^FAILURE#\d{4}-\d{2}-\d{2}T[^#]+#/);
    expect(item).toMatchObject(event);

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('failure-event recorded')
    );
  });

  it('uses GITHUB_RUN_ID as the sk suffix when set', async () => {
    process.env.GITHUB_RUN_ID = '424242';
    await recordFailureEvent('us-east-1', 'table', makeEvent());

    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.sk).toBe('FAILURE#2026-07-03T10:00:00.000Z#424242');
  });

  it('falls back to a non-empty random suffix when GITHUB_RUN_ID is unset', async () => {
    await recordFailureEvent('us-east-1', 'table', makeEvent());

    const item = mockSend.mock.calls[0][0].input.Item;
    const suffix = item.sk.split('#')[2];
    expect(suffix).toHaveLength(8);
  });

  it('never rejects: resolves and warns when the PutCommand fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('dynamo down'));

    await expect(
      recordFailureEvent('us-east-1', 'table', makeEvent())
    ).resolves.toBeUndefined();

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('dynamo down')
    );
    expect(core.info).not.toHaveBeenCalledWith(
      expect.stringContaining('failure-event recorded')
    );
  });
});
