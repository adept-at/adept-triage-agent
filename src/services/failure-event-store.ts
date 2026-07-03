import * as core from '@actions/core';
import * as crypto from 'crypto';

/**
 * One durable record per triage run, written to the existing skill table
 * under a `FAILURE#` sort-key prefix (invisible to skill queries, which
 * filter on `SKILL#`). Write-only from the action — reads happen in the
 * weekly report script.
 */
export interface FailureEvent {
  repo: string;
  spec: string;
  testName: string;
  framework: string;
  verdict: string;
  confidence: number;
  failedAt: string;
  sourceRunId: string;
  triageRunUrl: string;
  branch: string;
  prNumber: string;
}

/**
 * Never rejects — a DynamoDB hiccup must never fail a triage run.
 */
export async function recordFailureEvent(
  region: string,
  tableName: string,
  event: FailureEvent
): Promise<void> {
  try {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
    const raw = new DynamoDBClient({ region });
    const client = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });

    const runId = process.env.GITHUB_RUN_ID || crypto.randomUUID().slice(0, 8);
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: `REPO#${event.repo}`,
          sk: `FAILURE#${event.failedAt}#${runId}`,
          ...event,
        },
      })
    );
    core.info(`📝 failure-event recorded for ${event.repo} ${event.spec}`);
  } catch (err) {
    core.warning(`Failed to record failure event for ${event.repo}: ${err}`);
  }
}
