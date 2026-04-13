/**
 * Skill Auditor — Reviews all skills in DynamoDB and flags issues.
 *
 * Usage:
 *   npx tsx scripts/audit-skills.ts
 *   npx tsx scripts/audit-skills.ts --delete-flagged  (removes flagged skills)
 *
 * Checks each skill for:
 *   - Empty or generic fix summaries
 *   - rootCauseCategory stuck on "OTHER" (should be specific)
 *   - Failed trajectories that should be retired
 *   - Duplicate skills for the same spec+error pattern
 *   - Missing investigation findings
 *   - Classification marked incorrect
 *   - Stale skills (no activity in 30+ days)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TRIAGE_DYNAMO_TABLE || 'triage-skills-v1-live';
const REGION = process.env.AWS_REGION || 'us-east-1';
const DELETE_FLAGGED = process.argv.includes('--delete-flagged');

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
}

interface AuditFlag {
  skillId: string;
  repo: string;
  spec: string;
  severity: 'DELETE' | 'WARN' | 'INFO';
  reason: string;
}

async function main() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const { Items = [] } = await client.send(new ScanCommand({ TableName: TABLE }));
  const skills = Items as Skill[];

  console.log(`\n📊 Skill Audit Report — ${skills.length} skills in ${TABLE}\n`);

  const flags: AuditFlag[] = [];

  for (const s of skills) {
    const specName = s.spec?.split('/').pop() || 'unknown';

    // 1. Failed trajectory that should be retired
    if (!s.validatedLocally && !s.retired) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: `Failed trajectory (validatedLocally=false) not retired. successCount=${s.successCount}, failCount=${s.failCount}`,
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

    // 3. Classification marked incorrect
    if (s.classificationOutcome === 'incorrect') {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'WARN',
        reason: 'Classification was marked incorrect — this skill may be teaching the wrong pattern',
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

    // 7. High fail rate but not retired
    const total = (s.successCount || 0) + (s.failCount || 0);
    if (total >= 3 && s.failCount / total > 0.4 && !s.retired) {
      flags.push({
        skillId: s.id, repo: s.repo, spec: specName,
        severity: 'DELETE',
        reason: `High fail rate (${s.failCount}/${total} = ${Math.round(s.failCount / total * 100)}%) but not retired`,
      });
    }
  }

  // 8. Duplicate skills — same spec + similar error pattern
  const specGroups = new Map<string, Skill[]>();
  for (const s of skills) {
    const key = `${s.repo}::${s.spec}`;
    const group = specGroups.get(key) || [];
    group.push(s);
    specGroups.set(key, group);
  }
  for (const [key, group] of specGroups) {
    if (group.length > 2) {
      const specName = key.split('::').pop()?.split('/').pop() || 'unknown';
      flags.push({
        skillId: group[0].id, repo: group[0].repo, spec: specName,
        severity: 'WARN',
        reason: `${group.length} skills for same spec — may have duplicates. Keep the validated ones, remove failed trajectories.`,
      });
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
    const correct = repoSkills.filter(s => s.classificationOutcome === 'correct');
    const incorrect = repoSkills.filter(s => s.classificationOutcome === 'incorrect');
    console.log(`📦 ${repo}`);
    console.log(`   Total: ${repoSkills.length} | Validated: ${validated.length} | Failed: ${failed.length}`);
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
}

main().catch(e => {
  console.error('Audit failed:', e.message);
  process.exit(1);
});
