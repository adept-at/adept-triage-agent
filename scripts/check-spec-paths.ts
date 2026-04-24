/**
 * Quick diagnostic: dump raw `spec`, `testName`, `fix.file` values as
 * persisted in DynamoDB so we can confirm what shape the coordinator's
 * `errorData.fileName` takes on real runs before seeding. `findRelevant`
 * uses strict `===` equality on `spec`, so seed paths must match the
 * format the agent actually writes — basename vs full path matters.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

async function main() {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: 'us-east-1' })
  );
  const { Items = [] } = await client.send(
    new ScanCommand({ TableName: 'triage-skills-v1-live' })
  );

  console.log('\nRaw spec / testName / fix.file values as persisted:\n');
  for (const s of Items as Array<Record<string, unknown>>) {
    console.log(`📦 ${s.repo} (id=${String(s.id).slice(0, 8)}, retired=${s.retired})`);
    console.log(`   spec:      "${s.spec}"`);
    console.log(`   testName:  "${s.testName}"`);
    const fix = s.fix as { file?: string } | undefined;
    console.log(`   fix.file:  "${fix?.file}"`);
    console.log('');
  }
}

main().catch((e) => {
  console.error('check-spec-paths failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
