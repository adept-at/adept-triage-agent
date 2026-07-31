/**
 * Quick diagnostic: dump raw `spec`, `testName`, `fix.file` values as
 * persisted in DynamoDB so we can confirm what shape the coordinator's
 * `errorData.fileName` takes on real runs before seeding. `findRelevant`
 * uses strict `===` equality on `spec`, so seed paths must match the
 * format the agent actually writes — basename vs full path matters.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { scanAllSkills } from './scan-skills.js';

async function main() {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: 'us-east-1' })
  );
  const items = await scanAllSkills<Record<string, unknown>>(
    client,
    'triage-skills-v1-live'
  );

  console.log('\nRaw spec / testName / fix.file values as persisted:\n');
  for (const s of items) {
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
