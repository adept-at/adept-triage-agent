/**
 * Weekly Failure Report — Aggregates failure events written by the triage agent.
 *
 * Usage:
 *   npx tsx scripts/weekly-failure-report.ts             # last 7 days
 *   npx tsx scripts/weekly-failure-report.ts --days 30   # last 30 days
 *
 * Output is markdown (paste into Slack/GitHub as-is).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TRIAGE_DYNAMO_TABLE || 'triage-skills-v1-live';
const REGION = process.env.AWS_REGION || 'us-east-1';

const daysIdx = process.argv.indexOf('--days');
const DAYS = daysIdx === -1 ? 7 : parseInt(process.argv[daysIdx + 1], 10);
if (!Number.isFinite(DAYS) || DAYS <= 0) {
  console.error('Invalid --days value; expected a positive number.');
  process.exit(1);
}

interface FailureEvent {
  repo: string;
  spec: string;
  testName: string;
  verdict: string;
  failedAt: string;
}

const day = (iso: string) => iso.slice(0, 10);

async function main() {
  const end = new Date();
  const start = new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000);

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const events: FailureEvent[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'begins_with(sk, :f) AND failedAt >= :start',
        ExpressionAttributeValues: { ':f': 'FAILURE#', ':start': start.toISOString() },
        ExclusiveStartKey: lastKey
      })
    );
    events.push(...((page.Items || []) as FailureEvent[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  console.log('# Weekly Failure Report');
  console.log();
  console.log(`Window: ${day(start.toISOString())} – ${day(end.toISOString())} (${DAYS} days) | Total events: ${events.length}`);

  if (events.length === 0) {
    console.log();
    console.log('No failure events recorded in this window.');
    return;
  }

  const repoTotals = new Map<string, number>();
  for (const e of events) {
    repoTotals.set(e.repo, (repoTotals.get(e.repo) || 0) + 1);
  }
  console.log();
  for (const [repo, count] of [...repoTotals].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${repo}: ${count}`);
  }

  interface Group {
    repo: string;
    spec: string;
    testName: string;
    count: number;
    verdicts: Map<string, number>;
    lastFailed: string;
  }
  const groups = new Map<string, Group>();
  for (const e of events) {
    const key = `${e.repo}|${e.spec}|${e.testName}`;
    let g = groups.get(key);
    if (!g) {
      g = { repo: e.repo, spec: e.spec, testName: e.testName, count: 0, verdicts: new Map(), lastFailed: '' };
      groups.set(key, g);
    }
    g.count++;
    g.verdicts.set(e.verdict, (g.verdicts.get(e.verdict) || 0) + 1);
    if (e.failedAt > g.lastFailed) g.lastFailed = e.failedAt;
  }

  const rows = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.lastFailed.localeCompare(a.lastFailed)
  );

  console.log();
  console.log('| Repo | Spec | Test | Failures | Verdicts | Last Failed |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const g of rows) {
    const verdicts = [...g.verdicts]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${v}×${n}`)
      .join(', ');
    console.log(`| ${g.repo} | ${g.spec} | ${g.testName} | ${g.count} | ${verdicts} | ${day(g.lastFailed)} |`);
  }
}

main().catch(e => {
  console.error('Report failed:', e.message);
  process.exit(1);
});
