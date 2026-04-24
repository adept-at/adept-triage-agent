/**
 * Skill Inspector — Dumps full details of every skill so you can decide what to keep.
 *
 * Usage:
 *   npx tsx scripts/inspect-skills.ts               # all skills
 *   npx tsx scripts/inspect-skills.ts <partial-id>  # just skills matching id prefix
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TRIAGE_DYNAMO_TABLE || 'triage-skills-v1-live';
const REGION = process.env.AWS_REGION || 'us-east-1';
const FILTER = process.argv[2];

async function main() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const { Items = [] } = await client.send(new ScanCommand({ TableName: TABLE }));

  const skills = (Items as any[])
    .filter(s => !FILTER || s.id.startsWith(FILTER))
    .sort((a, b) => (a.spec || '').localeCompare(b.spec || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

  console.log(`\nFound ${skills.length} skill(s)${FILTER ? ` matching "${FILTER}"` : ''}\n`);

  for (const s of skills) {
    const specName = s.spec?.split('/').pop() || 'unknown';
    console.log('═'.repeat(80));
    console.log(`ID:               ${s.id}`);
    console.log(`Repo:             ${s.repo}`);
    console.log(`Spec:             ${specName}`);
    console.log(`Test:             ${s.testName || '(none)'}`);
    console.log(`Framework:        ${s.framework || '(none)'}`);
    console.log(`Created:          ${s.createdAt}`);
    console.log(`Last used:        ${s.lastUsedAt || '(never)'}`);
    console.log(`Validated:        ${s.validatedLocally}`);
    console.log(`Retired:          ${s.retired}`);
    console.log(`Success/Fail:     ${s.successCount || 0} / ${s.failCount || 0}`);
    console.log(`Confidence:       ${s.confidence}`);
    console.log(`Classification:   ${s.classificationOutcome || '(unknown)'}`);
    console.log(`Root cause cat:   ${s.rootCauseCategory}`);
    console.log(`Error pattern:    ${s.errorPattern || '(empty)'}`);
    console.log(`Fix file:         ${s.fix?.file || '(empty)'}`);
    console.log(`Fix changeType:   ${s.fix?.changeType || '(empty)'}`);
    console.log(`Fix pattern:      ${s.fix?.pattern || '(empty)'}`);
    console.log(`Fix summary:`);
    console.log(`  ${(s.fix?.summary || '(empty)').split('\n').join('\n  ')}`);
    console.log(`Investigation findings:`);
    console.log(`  ${(s.investigationFindings || '(empty)').split('\n').join('\n  ')}`);
    console.log(`Root cause chain:`);
    console.log(`  ${(s.rootCauseChain || '(empty)').split('\n').join('\n  ')}`);
    console.log();
  }
}

main().catch(e => {
  console.error('Inspect failed:', e.message);
  process.exit(1);
});
