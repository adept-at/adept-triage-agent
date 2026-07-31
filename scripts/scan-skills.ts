import {
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

export async function scanAllSkills<T>(
  client: DynamoDBDocumentClient,
  tableName: string
): Promise<T[]> {
  const items: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':prefix': 'SKILL#' },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    items.push(...((page.Items ?? []) as T[]));
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}
