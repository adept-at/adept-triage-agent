import { claimSourceRunSlot } from '../../src/services/source-run-gate';

jest.mock('@aws-sdk/client-dynamodb', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientConfigs: any[] = [];
  return {
    __clientConfigs: clientConfigs,
    DynamoDBClient: class DynamoDBClient {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(cfg: any) {
        clientConfigs.push(cfg);
      }
    },
  };
});

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const sharedSend = jest.fn();
  return {
    __send: sharedSend,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    UpdateCommand: class UpdateCommand {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public input: any) {}
    },
    DynamoDBDocumentClient: {
      from: () => ({ send: sharedSend }),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockSend = require('@aws-sdk/lib-dynamodb').__send as jest.Mock;
const clientConfigs = require('@aws-sdk/client-dynamodb')
  .__clientConfigs as Array<Record<string, unknown>>;

const baseParams = {
  region: 'us-east-1',
  tableName: 'triage-skills-v1-live',
  repository: 'adept-at/learn-webapp',
  sourceRunId: '30646230879',
  sourceRunAttempt: 1,
  maxAttempts: 2,
  now: new Date('2026-07-31T17:00:00.000Z'),
};

describe('claimSourceRunSlot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clientConfigs.length = 0;
  });

  it('uses one atomic conditional update with a 30-day TTL', async () => {
    mockSend.mockResolvedValueOnce({ Attributes: { attemptCount: 1 } });

    await expect(claimSourceRunSlot(baseParams)).resolves.toEqual({
      status: 'admitted',
      attemptCount: 1,
    });

    const command = mockSend.mock.calls[0][0];
    expect(command.constructor.name).toBe('UpdateCommand');
    expect(command.input).toMatchObject({
      TableName: 'triage-skills-v1-live',
      Key: {
        pk: 'REPO#adept-at/learn-webapp',
        sk: 'TRIAGE_GATE#30646230879#ATTEMPT#1',
      },
      ConditionExpression:
        'attribute_not_exists(attemptCount) OR attemptCount < :maxAttempts',
      ReturnValues: 'ALL_NEW',
    });
    expect(command.input.UpdateExpression).toContain('ADD attemptCount :one');
    expect(clientConfigs).toEqual([{ region: 'us-east-1', maxAttempts: 1 }]);
    expect(command.input.ExpressionAttributeValues[':expiresAt']).toBe(
      Math.floor(baseParams.now.getTime() / 1000) + 30 * 24 * 60 * 60
    );
  });

  it('admits exactly two of nine concurrent claims', async () => {
    let count = 0;
    mockSend.mockImplementation((command) => {
      const max = command.input.ExpressionAttributeValues[':maxAttempts'];
      if (count >= max) {
        return Promise.reject(
          Object.assign(new Error('limit reached'), {
            name: 'ConditionalCheckFailedException',
          })
        );
      }
      count++;
      return Promise.resolve({ Attributes: { attemptCount: count } });
    });

    const results = await Promise.all(
      Array.from({ length: 9 }, () => claimSourceRunSlot(baseParams))
    );

    expect(results.filter((result) => result.status === 'admitted')).toHaveLength(
      2
    );
    expect(results.filter((result) => result.status === 'limited')).toHaveLength(
      7
    );
  });

  it('gives a rerun attempt a separate two-slot budget', async () => {
    const counts = new Map<string, number>();
    mockSend.mockImplementation((command) => {
      const key = command.input.Key.sk;
      const current = counts.get(key) ?? 0;
      const max = command.input.ExpressionAttributeValues[':maxAttempts'];
      if (current >= max) {
        return Promise.reject(
          Object.assign(new Error('limit reached'), {
            name: 'ConditionalCheckFailedException',
          })
        );
      }
      const next = current + 1;
      counts.set(key, next);
      return Promise.resolve({ Attributes: { attemptCount: next } });
    });

    const firstAttempt = await Promise.all(
      Array.from({ length: 3 }, () => claimSourceRunSlot(baseParams))
    );
    const secondAttempt = await Promise.all(
      Array.from({ length: 3 }, () =>
        claimSourceRunSlot({ ...baseParams, sourceRunAttempt: 2 })
      )
    );

    expect(firstAttempt.map((result) => result.status)).toEqual([
      'admitted',
      'admitted',
      'limited',
    ]);
    expect(secondAttempt.map((result) => result.status)).toEqual([
      'admitted',
      'admitted',
      'limited',
    ]);
  });

  it('fails closed when DynamoDB is unavailable', async () => {
    mockSend.mockRejectedValueOnce(new Error('dynamo unavailable'));

    await expect(claimSourceRunSlot(baseParams)).resolves.toEqual({
      status: 'unavailable',
      reason: 'dynamo unavailable',
    });
  });
});
