/**
 * Skill Auditor — Reviews all skills in DynamoDB and flags issues.
 *
 * Usage:
 *   npx tsx scripts/audit-skills.ts
 *   npx tsx scripts/audit-skills.ts --delete-flagged         (removes severity=DELETE skills)
 *   npx tsx scripts/audit-skills.ts --retire-flagged         (sets retired=true on WARN skills)
 *   npx tsx scripts/audit-skills.ts --clear-noisy-incorrect  (resets classification=incorrect → unknown)
 *
 * Checks each skill for:
 *   - Empty or generic fix summaries
 *   - rootCauseCategory stuck on "OTHER" (should be specific)
 *   - Failed trajectories that should be retired
 *   - Duplicate skills for the same spec+error pattern
 *   - Missing investigation findings
 *   - Classification marked incorrect
 *   - Stale skills (no activity in 30+ days)
 *   - High fail-rate skills (this replaces the agent's old auto-retire
 *     mechanism: ratio > 40% with >= 3 attempts now surfaces here as
 *     a WARN with action='retire' for `--retire-flagged` to action)
 *
 * As of the manual-skill-lifecycle refactor, the agent does not
 * auto-prune or auto-retire any skill. This script is the canonical
 * operator path for cleanup: `--retire-flagged` silences a skill
 * without deleting it; `--delete-flagged` removes severity=DELETE
 * skills entirely.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { normalizeSpec } from '../src/services/skill-store.js';

const TABLE = process.env.TRIAGE_DYNAMO_TABLE || 'triage-skills-v1-live';
const REGION = process.env.AWS_REGION || 'us-east-1';
const DELETE_FLAGGED = process.argv.includes('--delete-flagged');
const RETIRE_FLAGGED = process.argv.includes('--retire-flagged');
const CLEAR_NOISY_INCORRECT = process.argv.includes('--clear-noisy-incorrect');

interface Skill {
  pk: string;
  sk: string;
  id: string;
  repo: string;
  spec: string;
  testName: string;
  framework: string;
  errorPattern: string;
  rootCauseCategory: string;
  fix: { file: string; changeType: string; summary: string; pattern: string };
  confidence: number;
  validatedLocally: boolean;
  successCount: number;
  failCount: number;
  classificationOutcome: string;
  investigationFindings: string;
  rootCauseChain: string;
  createdAt: string;
  lastUsedAt: string;
  retired: boolean;
  isSeed?: boolean;
}

interface AuditFlag {
  skillId: string;
  repo: string;
  spec: string;
  severity: 'DELETE' | 'WARN' | 'INFO';
  reason: string;
  /**
   * Action the maintenance flags can take. `retire` sets retired=true
   * (skill stays for flakiness history but stops being surfaced).
   * `clearIncorrect` resets classificationOutcome to 'unknown' — used
   * for skills tagged 'incorrect' by the pre-v1.50.1 noisy writer.
   */
  action?: 'retire' | 'clearIncorrect';
}

async function main() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const { Items = [] } = await client.send(new ScanCommand({ TableName: TABLE }));
  const skills = Items as Skill[];

  console.log(`\n📊 Skill Audit Report — ${skills.length} skills in ${TABLE}\n`);

  const flags: AuditFlag[] = [];

  for (const s of skills) {
    const specName = s.spec?.split('/').pop() || 'unknown';

    // Seeds are curated, validated-on-insert artifacts. They legitimately
    // start with no runtime track record, may have generic-feeling fix
    // summaries, and should never be retired/cleared/deleted by audit
    // automation. Skip the per-skill checks for them.
    if (s.isSeed) continue;

    // 1. Failed trajectory that should be retired
    if (!s.validatedLocally && !s.retired) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: `Failed trajectory (validatedLocally=false) not retired. successCount=${s.successCount}, failCount=${s.failCount}`,
        action: 'retire',
      });
    }

    // 2. rootCauseCategory is generic "OTHER"
    if (s.rootCauseCategory === 'OTHER') {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'INFO',
        reason: 'rootCauseCategory is "OTHER" — should be specific (SELECTOR_MISMATCH, TIMING_ISSUE, etc.)',
      });
    }

    if (
      s.rootCauseCategory === 'OTHER' &&
      !s.investigationFindings &&
      (!s.fix?.changeType || s.fix.changeType === 'OTHER') &&
      !s.retired
    ) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: 'Generic-only legacy: rootCauseCategory=OTHER, no findings, fix.changeType=OTHER. Consider retiring.',
        action: 'retire',
      });
    }

    // 3. Classification marked incorrect
    //
    // Note: the v1.38.0 writer flipped the most-recent-skill-on-spec to
    // 'incorrect' any time a later autofix failed on that spec, even when
    // the prior skill was a completely valid pattern. That writer was
    // removed in v1.50.0 (deferred pending the multi-pass baseline work
    // that landed in v1.50.1). Skills created before v1.50.1 with
    // classification=incorrect may be false positives; use
    // --clear-noisy-incorrect to reset them to 'unknown' rather than
    // retiring a potentially-valid skill.
    if (s.classificationOutcome === 'incorrect') {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: 'Classification was marked incorrect (may be noisy pre-v1.50.1 signal — consider --clear-noisy-incorrect)',
        action: 'clearIncorrect',
      });
    }

    // 4. Empty investigation findings
    if (!s.investigationFindings) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'INFO',
        reason: 'No investigation findings — agents cannot learn from this skill\'s investigation',
      });
    }

    // 5. Empty or very short fix summary
    if (!s.fix?.summary || s.fix.summary.length < 20) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: `Fix summary too short or empty: "${s.fix?.summary || ''}"`,
      });
    }

    // 6. Stale skills (no activity in 30+ days)
    const lastActivity = new Date(s.lastUsedAt || s.createdAt);
    const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity > 30) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'INFO',
        reason: `Stale — no activity in ${Math.round(daysSinceActivity)} days`,
      });
    }

    // 7. High fail rate retire-candidate.
    //
    // This rule replaces the agent's old auto-retire mechanism
    // (RETIRE_FAIL_RATE = 0.4, RETIRE_MIN_FAILURES = 3) which lived in
    // SkillStore.recordOutcome and was removed in the
    // manual-skill-lifecycle refactor. The thresholds are intentionally
    // identical so the operator-facing surface matches what the agent
    // used to do automatically.
    //
    // Severity is WARN with action='retire' (NOT 'DELETE') because the
    // pre-refactor behavior only flipped `retired = true` — it did not
    // delete the skill. The skill stays in the store as historical
    // flakiness signal (detectFlakiness still counts retired skills);
    // it just stops being surfaced to LLM prompts. An operator who
    // wants to remove the skill entirely can re-flag it manually.
    const total = (s.successCount || 0) + (s.failCount || 0);
    if (total >= 3 && s.failCount / total > 0.4 && !s.retired) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: `High fail rate (${s.failCount}/${total} = ${Math.round(s.failCount / total * 100)}%) — retire candidate.`,
        action: 'retire',
      });
    }
  }

  // 8. Duplicate skills — same normalized spec + same inner test name,
  //    only counting active (non-retired) skills. Different tests within
  //    one spec are NOT duplicates; retired skills don't surface so they
  //    don't need deduping. Grouping by normalized spec + inner test name
  //    catches the real case: multiple back-to-back runs against the same
  //    test that each saved a near-identical skill.
  //
  //    Seeds are also excluded: a seed set can intentionally encode
  //    multiple canonical failure modes for the same spec+test (e.g.
  //    a Lexical spec that can fail as a selector, as a timing, and as
  //    a network-race issue — three seeds with the same testName, not
  //    duplicates). The per-skill `isSeed continue` above covers the
  //    other checks; this block needs its own guard because it runs
  //    over groupings, not per-skill.
  const testGroups = new Map<string, Skill[]>();
  for (const s of skills) {
    if (s.retired || s.isSeed) continue;
    const innerTestName = (s.testName || '').split('.').pop()?.trim() || '';
    const key = `${s.repo}::${normalizeSpec(s.spec)}::${innerTestName}`;
    const group = testGroups.get(key) || [];
    group.push(s);
    testGroups.set(key, group);
  }
  for (const [key, group] of testGroups) {
    if (group.length > 1) {
      const specName = key.split('::')[1]?.split('/').pop() || 'unknown';
      // Keep the most recently used (or most recently created) skill;
      // flag every OLDER one for retirement. `--retire-flagged` will
      // pick these up via `action: 'retire'`.
      const sorted = [...group].sort((a, b) => {
        const ta = Date.parse(a.lastUsedAt || a.createdAt) || 0;
        const tb = Date.parse(b.lastUsedAt || b.createdAt) || 0;
        return tb - ta;
      });
      const [keep, ...older] = sorted;
      for (const dup of older) {
        flags.push({
          skillId: dup.id, repo: dup.repo, spec: specName,
          severity: 'WARN',
          reason: `Duplicate of newer skill ${keep.id.slice(0, 8)} (same spec+test) — retire this older one.`,
          action: 'retire',
        });
      }
    }
  }

  // Report
  const byRepo = new Map<string, Skill[]>();
  for (const s of skills) {
    const list = byRepo.get(s.repo) || [];
    list.push(s);
    byRepo.set(s.repo, list);
  }

  for (const [repo, repoSkills] of byRepo) {
    const validated = repoSkills.filter(s => s.validatedLocally);
    const failed = repoSkills.filter(s => !s.validatedLocally);
    const retired = repoSkills.filter(s => s.retired);
    const correct = repoSkills.filter(s => s.classificationOutcome === 'correct');
    const incorrect = repoSkills.filter(s => s.classificationOutcome === 'incorrect');
    console.log(`📦 ${repo}`);
    console.log(`   Total: ${repoSkills.length} | Validated: ${validated.length} | Failed: ${failed.length} | Retired: ${retired.length}`);
    console.log(`   Classification: ${correct.length} correct, ${incorrect.length} incorrect, ${repoSkills.length - correct.length - incorrect.length} unknown`);
    console.log();
  }

  if (flags.length === 0) {
    console.log('✅ All skills look healthy — no issues found.\n');
    return;
  }

  const deletes = flags.filter(f => f.severity === 'DELETE');
  const warns = flags.filter(f => f.severity === 'WARN');
  const infos = flags.filter(f => f.severity === 'INFO');

  if (deletes.length > 0) {
    console.log(`🔴 DELETE (${deletes.length}):`);
    for (const f of deletes) {
      console.log(`   ${f.skillId.slice(0, 8)} [${f.spec}] — ${f.reason}`);
    }
    console.log();
  }

  if (warns.length > 0) {
    console.log(`🟡 WARN (${warns.length}):`);
    for (const f of warns) {
      console.log(`   ${f.skillId.slice(0, 8)} [${f.spec}] — ${f.reason}`);
    }
    console.log();
  }

  if (infos.length > 0) {
    console.log(`🔵 INFO (${infos.length}):`);
    for (const f of infos) {
      console.log(`   ${f.skillId.slice(0, 8)} [${f.spec}] — ${f.reason}`);
    }
    console.log();
  }

  console.log(`Summary: ${deletes.length} to delete, ${warns.length} warnings, ${infos.length} info\n`);

  if (DELETE_FLAGGED && deletes.length > 0) {
    console.log('🗑️  Deleting flagged skills...');
    for (const f of deletes) {
      const skill = skills.find(s => s.id === f.skillId);
      if (skill) {
        await client.send(new DeleteCommand({
          TableName: TABLE,
          Key: { pk: skill.pk, sk: skill.sk },
        }));
        console.log(`   Deleted: ${f.skillId.slice(0, 8)} [${f.spec}]`);
      }
    }
    console.log('Done.\n');
  }

  if (RETIRE_FLAGGED) {
    // Dedupe by skill ID — a single skill can trip multiple retire flags
    // (e.g. failed trajectory + duplicate spec) and we only need one
    // retire write per skill.
    const retireIds = new Set(
      flags.filter(f => f.action === 'retire').map(f => f.skillId)
    );
    if (retireIds.size > 0) {
      console.log(`🪦 Retiring ${retireIds.size} skill(s)...`);
      for (const id of retireIds) {
        const skill = skills.find(s => s.id === id);
        if (!skill) continue;
        await client.send(new UpdateCommand({
          TableName: TABLE,
          Key: { pk: skill.pk, sk: skill.sk },
          UpdateExpression: 'SET retired = :r',
          ExpressionAttributeValues: { ':r': true },
        }));
        console.log(`   Retired: ${id.slice(0, 8)} [${skill.spec?.split('/').pop()}]`);
      }
      console.log('Done.\n');
    }
  }

  if (CLEAR_NOISY_INCORRECT) {
    const clearIds = new Set(
      flags.filter(f => f.action === 'clearIncorrect').map(f => f.skillId)
    );
    if (clearIds.size > 0) {
      console.log(`🧽 Clearing noisy classificationOutcome on ${clearIds.size} skill(s)...`);
      for (const id of clearIds) {
        const skill = skills.find(s => s.id === id);
        if (!skill) continue;
        await client.send(new UpdateCommand({
          TableName: TABLE,
          Key: { pk: skill.pk, sk: skill.sk },
          UpdateExpression: 'SET classificationOutcome = :co',
          ExpressionAttributeValues: { ':co': 'unknown' },
        }));
        console.log(`   Reset: ${id.slice(0, 8)} [${skill.spec?.split('/').pop()}]`);
      }
      console.log('Done.\n');
    }
  }
}

main().catch(e => {
  console.error('Audit failed:', e.message);
  process.exit(1);
});
