import * as core from '@actions/core';
import * as crypto from 'crypto';
import { OutcomeEvent } from '../types';

/**
 * One durable terminal record per triage run under `OUTCOME#` sort-key
 * prefix (invisible to skill queries). Write-only from the action.
 */
export async function recordOutcomeEvent(
  region: string,
  tableName: string,
  event: OutcomeEvent
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
          sk: `OUTCOME#${event.completedAt}#${runId}`,
          entityType: 'outcome',
          ...event,
        },
      })
    );
    core.info(`📝 outcome-event recorded for ${event.repo} ${event.spec}`);
  } catch (err) {
    core.warning(`Failed to record outcome event for ${event.repo}: ${err}`);
  }
}
