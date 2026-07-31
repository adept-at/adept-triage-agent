export type SourceRunGateResult =
  | { status: 'admitted'; attemptCount: number }
  | { status: 'limited' }
  | { status: 'unavailable'; reason: string };

interface SourceRunGateParams {
  region: string;
  tableName: string;
  repository: string;
  sourceRunId: string;
  sourceRunAttempt: number;
  maxAttempts: number;
  now?: Date;
}

const GATE_TTL_DAYS = 30;

/**
 * Atomically claims one triage slot for a source workflow attempt.
 *
 * This gate intentionally fails closed: if DynamoDB cannot verify the
 * admission budget, the caller must not continue into artifact or AI work.
 */
export async function claimSourceRunSlot(
  params: SourceRunGateParams
): Promise<SourceRunGateResult> {
  try {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, UpdateCommand } = await import(
      '@aws-sdk/lib-dynamodb'
    );
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: params.region, maxAttempts: 1 }),
      { marshallOptions: { removeUndefinedValues: true } }
    );
    const now = params.now ?? new Date();
    const expiresAt =
      Math.floor(now.getTime() / 1000) + GATE_TTL_DAYS * 24 * 60 * 60;

    const result = await client.send(
      new UpdateCommand({
        TableName: params.tableName,
        Key: {
          pk: `REPO#${params.repository}`,
          sk: `TRIAGE_GATE#${params.sourceRunId}#ATTEMPT#${params.sourceRunAttempt}`,
        },
        ConditionExpression:
          'attribute_not_exists(attemptCount) OR attemptCount < :maxAttempts',
        UpdateExpression:
          'SET entityType = :entityType, sourceRunId = :sourceRunId, ' +
          'sourceRunAttempt = :sourceRunAttempt, maxAttempts = :maxAttempts, ' +
          'updatedAt = :updatedAt, exp = if_not_exists(exp, :expiresAt) ' +
          'ADD attemptCount :one',
        ExpressionAttributeValues: {
          ':entityType': 'triage-run-gate',
          ':sourceRunId': params.sourceRunId,
          ':sourceRunAttempt': params.sourceRunAttempt,
          ':maxAttempts': params.maxAttempts,
          ':updatedAt': now.toISOString(),
          ':expiresAt': expiresAt,
          ':one': 1,
        },
        ReturnValues: 'ALL_NEW',
      })
    );

    return {
      status: 'admitted',
      attemptCount: Number(result.Attributes?.attemptCount ?? 1),
    };
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      return { status: 'limited' };
    }

    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
