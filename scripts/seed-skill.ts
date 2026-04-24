/**
 * Seed Skill Inserter — adds curated, hand-picked TriageSkill records
 * to the skill store.
 *
 * Seed skills are the bootstrap layer for the agent's learning loop:
 * canonical "this exact failure shape on this exact spec is fixed by
 * this pattern" exemplars that an operator commits up front so the
 * agent has expert knowledge before it has accumulated any of its own.
 *
 * They are stored alongside auto-saved skills in DynamoDB but flagged
 * `isSeed: true` so:
 *   - `selectSkillsToPrune` will not evict them when the partition
 *     reaches the 100-skill cap
 *   - `audit-skills.ts` skips per-skill maintenance flags for them
 *   - Operators can identify them in `inspect-skills.ts` output
 *
 * Seeds participate in normal retrieval (`findRelevant`,
 * `findForClassifier`) by spec + error similarity, like any other
 * skill. The flag only changes pruning + audit semantics.
 *
 * Usage:
 *   npx tsx scripts/seed-skill.ts <seed-file.json>           # add one
 *   npx tsx scripts/seed-skill.ts <seed-dir>/                # add all in dir
 *   npx tsx scripts/seed-skill.ts --list                     # list seeds
 *   npx tsx scripts/seed-skill.ts --remove <id-prefix>       # delete one seed
 *
 * Each JSON file must conform to the SeedInput shape below.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { normalizeError, normalizeSpec } from '../src/services/skill-store.js';

const TABLE = process.env.TRIAGE_DYNAMO_TABLE || 'triage-skills-v1-live';
const REGION = process.env.AWS_REGION || 'us-east-1';

interface SeedInput {
  /** `owner/name` — partition key derives from this (REPO#owner/name) */
  repo: string;
  /** Spec file path used by retrieval scoring (exact-match +10/+15) */
  spec: string;
  /** Test name (display + dedup) */
  testName: string;
  /** 'cypress' | 'webdriverio' (or 'unknown') — must match the framework filter */
  framework: 'cypress' | 'webdriverio' | 'unknown';
  /**
   * Representative error string. Stored after `normalizeError` (timestamps,
   * line numbers, SHAs stripped) so retrieval matches future failures
   * with the same structural shape.
   */
  errorPattern: string;
  /** One of the analysis-agent enum values (SELECTOR_MISMATCH, TIMING_ISSUE, ...) */
  rootCauseCategory: string;
  fix: {
    file: string;
    changeType: string;
    summary: string;
    pattern: string;
  };
  /** 70-100 typically; matches analysis-agent confidence scale */
  confidence: number;
  /**
   * Optional structured investigation context — surfaced to investigation
   * + fix-gen prompts the same way auto-captured findings are.
   */
  investigationFindings?: string;
  /** Short causal chain string, e.g. "TIMING_ISSUE → wait for mux-player readyState" */
  rootCauseChain?: string;
  /**
   * Free-form repo note shown only on findForInvestigation prompts.
   * Use sparingly — repo-wide knowledge belongs in `.adept-triage/context.md`.
   */
  repoContext?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = args[0];

  if (!arg || arg === '--help' || arg === '-h') {
    console.log(
      'Usage:\n' +
        '  npx tsx scripts/seed-skill.ts <seed-file.json>\n' +
        '  npx tsx scripts/seed-skill.ts <seed-dir>/\n' +
        '  npx tsx scripts/seed-skill.ts --list\n' +
        '  npx tsx scripts/seed-skill.ts --remove <id-prefix>\n'
    );
    process.exit(arg ? 0 : 1);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  if (arg === '--list') {
    await listSeeds(client);
    return;
  }

  if (arg === '--remove') {
    const prefix = args[1];
    if (!prefix) {
      console.error('--remove requires a skill id prefix');
      process.exit(1);
    }
    await removeSeed(client, prefix);
    return;
  }

  await insertFromPath(client, arg);
}

async function insertFromPath(client: DynamoDBDocumentClient, target: string): Promise<void> {
  const stat = fs.statSync(target);
  const files = stat.isDirectory() ? collectJsonFiles(target) : [target];

  if (files.length === 0) {
    console.log(`No .json seed files found at ${target}`);
    return;
  }

  console.log(`Inserting ${files.length} seed skill(s)...`);
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf-8');
    const seed = JSON.parse(raw) as SeedInput;
    validateSeed(seed, f);
    await insertOne(client, seed, f);
  }
  console.log('Done.');
}

/**
 * Walk a directory and return every `*.json` file path beneath it.
 * Used so `seeds/` (organized as `seeds/<repo>/*.json`) can be seeded
 * in one invocation; otherwise the caller would have to loop over
 * each per-repo subdirectory. Skips anything prefixed with `.` to
 * avoid hidden artifacts like `.DS_Store`.
 */
function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function validateSeed(seed: SeedInput, sourcePath: string): void {
  const required: (keyof SeedInput)[] = [
    'repo', 'spec', 'testName', 'framework', 'errorPattern',
    'rootCauseCategory', 'fix', 'confidence',
  ];
  for (const k of required) {
    if (seed[k] === undefined || seed[k] === null || seed[k] === '') {
      throw new Error(`Seed at ${sourcePath} missing required field: ${k}`);
    }
  }
  if (!seed.repo.includes('/')) {
    throw new Error(`Seed at ${sourcePath} has invalid repo (expected "owner/name"): ${seed.repo}`);
  }
  const fixRequired = ['file', 'changeType', 'summary', 'pattern'] as const;
  for (const k of fixRequired) {
    if (!seed.fix[k]) {
      throw new Error(`Seed at ${sourcePath} missing required fix.${k}`);
    }
  }
  if (seed.confidence < 0 || seed.confidence > 100) {
    throw new Error(`Seed at ${sourcePath} confidence out of range: ${seed.confidence}`);
  }
}

async function insertOne(
  client: DynamoDBDocumentClient,
  seed: SeedInput,
  sourcePath: string
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const pk = `REPO#${seed.repo}`;
  const sk = `SKILL#${id}`;

  // Build the persisted item by hand. We avoid `buildSkill()` because
  // it's tied to the runtime fix-result shape (FailureModeTrace, etc.)
  // and seeds are curated artifacts that don't have those upstream
  // products. Field semantics still match TriageSkill exactly so the
  // store's loader (`backfillDefaults`) treats seeds identically to
  // auto-saved skills aside from the `isSeed` flag.
  const item = {
    pk,
    sk,
    id,
    createdAt: now,
    repo: seed.repo,
    // Match the write-time normalization applied by buildSkill() so
    // seeds and runtime-saved skills share one canonical spec format
    // in DynamoDB. Seed authors can paste either relative or absolute
    // paths; retrieval still works because findRelevant also
    // normalizes at read time.
    spec: normalizeSpec(seed.spec),
    testName: seed.testName,
    framework: seed.framework,
    errorPattern: normalizeError(seed.errorPattern),
    rootCauseCategory: seed.rootCauseCategory,
    fix: seed.fix,
    confidence: seed.confidence,
    iterations: 0,
    prUrl: '',
    // Keep seeds eligible for classifier retrieval, but do not give
    // them runtime success counters. Prompt renderers label them as
    // curated guidance so they do not look empirically proven.
    validatedLocally: true,
    priorSkillCount: 0,
    successCount: 0,
    failCount: 0,
    lastUsedAt: now,
    retired: false,
    investigationFindings: seed.investigationFindings ?? '',
    classificationOutcome: 'unknown',
    rootCauseChain: seed.rootCauseChain ?? '',
    repoContext: seed.repoContext ?? '',
    isSeed: true,
  };

  await client.send(new PutCommand({ TableName: TABLE, Item: item }));
  console.log(
    `   ✅ Seed ${id.slice(0, 8)} — ${seed.repo} :: ${seed.spec.split('/').pop()} (from ${path.basename(sourcePath)})`
  );
}

async function listSeeds(client: DynamoDBDocumentClient): Promise<void> {
  const { Items = [] } = await client.send(new ScanCommand({ TableName: TABLE }));
  const seeds = (Items as Array<Record<string, unknown>>)
    .filter((s) => s.isSeed === true)
    .sort((a, b) =>
      String(a.repo).localeCompare(String(b.repo)) ||
      String(a.spec).localeCompare(String(b.spec))
    );

  if (seeds.length === 0) {
    console.log('No seed skills in the store.');
    return;
  }

  console.log(`\n📌 ${seeds.length} seed skill(s) in ${TABLE}:\n`);
  let lastRepo = '';
  for (const s of seeds) {
    const repo = String(s.repo);
    if (repo !== lastRepo) {
      console.log(`📦 ${repo}`);
      lastRepo = repo;
    }
    console.log(
      `   ${String(s.id).slice(0, 8)} [${String(s.spec).split('/').pop()}] — ${String(s.testName).slice(0, 60)}`
    );
  }
  console.log();
}

async function removeSeed(client: DynamoDBDocumentClient, prefix: string): Promise<void> {
  const { Items = [] } = await client.send(new ScanCommand({ TableName: TABLE }));
  const matches = (Items as Array<Record<string, unknown>>).filter(
    (s) => s.isSeed === true && String(s.id).startsWith(prefix)
  );

  if (matches.length === 0) {
    console.log(`No seed skill found with id prefix "${prefix}".`);
    return;
  }
  if (matches.length > 1) {
    console.log(`Ambiguous prefix "${prefix}" matches ${matches.length} seeds:`);
    for (const m of matches) console.log(`   ${m.id}`);
    process.exit(1);
  }

  const m = matches[0];
  await client.send(new DeleteCommand({
    TableName: TABLE,
    Key: { pk: m.pk, sk: m.sk },
  }));
  console.log(`Removed seed ${String(m.id).slice(0, 8)} [${String(m.spec).split('/').pop()}]`);
}

main().catch((e) => {
  console.error('Seed-skill failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
