/**
 * Weekly Outcome Funnel — Aggregates terminal repair outcomes written by the triage agent.
 *
 * Usage:
 *   npx tsx scripts/weekly-outcome-funnel.ts
 *   npx tsx scripts/weekly-outcome-funnel.ts --days 30
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TRIAGE_DYNAMO_TABLE || 'triage-skills-v1-live';
const REGION = process.env.AWS_REGION || 'us-east-1';

const REPOS = (
  process.env.TRIAGE_REPOS ||
  [
    'adept-at/learn-webapp',
    'adept-at/lib-cypress-canary',
    'adept-at/lib-wdio-9-e2e',
    'adept-at/lib-wdio-9-multi-remote',
    'adept-at/wdio-9-bidi-mux3',
    'adept-at/adept-triage-agent',
  ].join(',')
)
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const daysIdx = process.argv.indexOf('--days');
const DAYS = daysIdx === -1 ? 30 : parseInt(process.argv[daysIdx + 1], 10);

interface OutcomeRow {
  repo: string;
  deploymentTier: string;
  verdict: string;
  s1_testIssue: boolean;
  s2_fixGenerated: boolean;
  s3_reviewApproved: boolean;
  s4_baselineReproduced: boolean;
  s5_patchApplied: boolean;
  s6_validationPassed: boolean;
  s7_published: boolean;
  repairStatus: string;
  validationStatus: string;
  failureKey: string;
  completedAt: string;
}

interface FailureRow {
  repo: string;
  spec: string;
  testName: string;
  failedAt: string;
}

function pct(n: number, d: number): string {
  if (d === 0) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

async function main() {
  const end = new Date();
  const start = new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const outcomes: OutcomeRow[] = [];
  const failures: FailureRow[] = [];

  for (const repo of REPOS) {
    let lastKey: Record<string, unknown> | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':pk': `REPO#${repo}`,
            ':start': `OUTCOME#${start.toISOString()}`,
            ':end': `OUTCOME#${end.toISOString()}\uffff`,
          },
          ExclusiveStartKey: lastKey,
        })
      );
      outcomes.push(...((page.Items || []) as OutcomeRow[]));
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    lastKey = undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':pk': `REPO#${repo}`,
            ':start': `FAILURE#${start.toISOString()}`,
            ':end': `FAILURE#${end.toISOString()}\uffff`,
          },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of page.Items || []) {
        failures.push({
          repo,
          spec: String(item.spec || ''),
          testName: String(item.testName || ''),
          failedAt: String(item.failedAt || ''),
        });
      }
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);
  }

  console.log('# Weekly Outcome Funnel');
  console.log();
  console.log(`Window: ${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)} (${DAYS} days)`);

  for (const tier of ['production', 'canary'] as const) {
    const rows = outcomes.filter((o) => o.deploymentTier === tier);
    if (rows.length === 0) {
      console.log();
      console.log(`## ${tier[0].toUpperCase()}${tier.slice(1)} funnel`);
      console.log();
      console.log('No outcome events in this window.');
      continue;
    }

    const count = (fn: (r: OutcomeRow) => boolean) => rows.filter(fn).length;
    const s1 = count((r) => r.s1_testIssue);
    const s2 = count((r) => r.s2_fixGenerated);
    const s3 = count((r) => r.s3_reviewApproved);
    const s4 = count((r) => r.s4_baselineReproduced);
    const s5 = count((r) => r.s5_patchApplied);
    const s6 = count((r) => r.s6_validationPassed);
    const s7 = count((r) => r.s7_published);

    console.log();
    console.log(`## ${tier[0].toUpperCase()}${tier.slice(1)} funnel`);
    console.log();
    console.log(`Total outcomes: ${rows.length}`);
    console.log();
    console.log('| Stage | Count | Conversion |');
    console.log('| --- | --- | --- |');
    console.log(`| S1 TEST_ISSUE | ${s1} | — |`);
    console.log(`| S2 fix generated | ${s2} | ${pct(s2, s1)} of S1 |`);
    console.log(`| S3 review approved | ${s3} | ${pct(s3, s2)} of S2 |`);
    console.log(`| S4 baseline reproduced | ${s4} | ${pct(s4, s3)} of S3 |`);
    console.log(`| S5 patch applied | ${s5} | ${pct(s5, s4)} of S4 |`);
    console.log(`| S6 validation passed | ${s6} | ${pct(s6, s5)} of S5 |`);
    console.log(`| S7 published | ${s7} | ${pct(s7, s6)} of S6 |`);
    console.log();
    console.log(`Full success rate (S7/S1): ${pct(s7, s1)}`);

    const published = rows.filter((r) => r.s7_published);
    let recurred7 = 0;
    let recurred30 = 0;
    for (const row of published) {
      const key = row.failureKey;
      const completedMs = Date.parse(row.completedAt);
      const later = failures.filter(
        (f) =>
          `${f.spec}|${f.testName}` === key &&
          Date.parse(f.failedAt) > completedMs
      );
      if (later.some((f) => Date.parse(f.failedAt) - completedMs <= 7 * 86400000)) {
        recurred7++;
      }
      if (later.some((f) => Date.parse(f.failedAt) - completedMs <= 30 * 86400000)) {
        recurred30++;
      }
    }
    if (published.length > 0) {
      console.log();
      console.log(`Recurrence within 7d of publish: ${recurred7}/${published.length}`);
      console.log(`Recurrence within 30d of publish: ${recurred30}/${published.length}`);
    }
  }
}

main().catch((e) => {
  console.error('Report failed:', e.message);
  process.exit(1);
});
