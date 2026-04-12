# Retool Skill Store Implementation Plan

> **Status:** Blocked on Retool API key + DB connection string  
> **Prerequisites:** Retool admin grants API token creation access and provides PostgreSQL connection URL  
> **Estimated effort:** 1 session (2-4 hours) once credentials are available  
> **Risk level:** Low — git branch fallback preserved throughout migration

---

## Phase 1: Database Setup

### 1.1 Create the triage_skills table

Using the Retool Database UI (or direct SQL via the connection string):

```sql
CREATE TABLE triage_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  repo TEXT NOT NULL,
  spec TEXT NOT NULL,
  test_name TEXT DEFAULT '',
  framework TEXT NOT NULL DEFAULT 'unknown',
  
  -- Error and classification
  error_pattern TEXT NOT NULL,
  root_cause_category TEXT DEFAULT '',
  classification_outcome TEXT DEFAULT 'unknown',
  
  -- Fix details (JSONB for flexibility)
  fix JSONB DEFAULT '{}',
  confidence INTEGER DEFAULT 0,
  iterations INTEGER DEFAULT 0,
  pr_url TEXT DEFAULT '',
  validated_locally BOOLEAN DEFAULT false,
  
  -- Evolution tracking
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  retired BOOLEAN DEFAULT false,
  prior_skill_count INTEGER DEFAULT 0,
  
  -- Enriched context (v1.35.0+)
  investigation_findings TEXT DEFAULT '',
  root_cause_chain TEXT DEFAULT '',
  repo_context TEXT DEFAULT ''
);

-- Performance indexes
CREATE INDEX idx_skills_repo ON triage_skills(repo);
CREATE INDEX idx_skills_repo_spec ON triage_skills(repo, spec);
CREATE INDEX idx_skills_framework ON triage_skills(framework);
CREATE INDEX idx_skills_retired ON triage_skills(retired) WHERE retired = false;
CREATE INDEX idx_skills_last_used ON triage_skills(last_used_at DESC);
```

### 1.2 Verify access

```bash
# From any machine with the connection string
psql $RETOOL_DB_URL -c "SELECT COUNT(*) FROM triage_skills;"
```

---

## Phase 2: Add pg dependency to triage agent

### 2.1 Install

```bash
cd /Users/pmerwin/Projects/Adept/adept-triage-agent
npm install pg
npm install --save-dev @types/pg
```

### 2.2 Add action input

In `action.yml`, add:

```yaml
RETOOL_DB_URL:
  description: 'PostgreSQL connection URL for Retool DB skill store. When set, skills are stored in Retool DB instead of a git branch. Falls back to git branch if not provided.'
  required: false
```

### 2.3 Wire into index.ts

In `getInputs()`:

```typescript
retoolDbUrl: core.getInput('RETOOL_DB_URL') || undefined,
```

In `ActionInputs` type:

```typescript
retoolDbUrl?: string;
```

---

## Phase 3: Create RetoolSkillStore class

### 3.1 New file: `src/services/retool-skill-store.ts`

This class implements the same interface as `SkillStore` but uses PostgreSQL instead of GitHub Contents API.

**Key design decisions:**
- **Load pattern:** Same as current — `load()` fetches all non-retired skills for a repo into memory. Scoring and formatting happen in-memory (keeps the existing Jaccard similarity, findForClassifier, findForRepair logic identical).
- **Write pattern:** Direct INSERT/UPDATE — no 409 conflicts possible. PostgreSQL handles concurrency natively.
- **Connection management:** Single connection per pipeline run. Open on first `load()`, close on `cleanup()`.

```typescript
import { Pool } from 'pg';
import * as core from '@actions/core';

export class RetoolSkillStore extends SkillStore {
  private pool: Pool;

  constructor(connectionUrl: string, owner: string, repo: string) {
    super(/* no octokit needed */);
    this.pool = new Pool({ connectionString: connectionUrl, ssl: { rejectUnauthorized: false } });
    this.owner = owner;
    this.repo = repo;
  }

  async load(): Promise<TriageSkill[]> {
    if (this.loaded) return this.skills;
    const { rows } = await this.pool.query(
      'SELECT * FROM triage_skills WHERE repo = $1 AND retired = false ORDER BY last_used_at DESC LIMIT 100',
      [`${this.owner}/${this.repo}`]
    );
    this.skills = rows.map(rowToTriageSkill);
    this.loaded = true;
    return this.skills;
  }

  async save(skill: TriageSkill): Promise<void> {
    await this.pool.query(
      `INSERT INTO triage_skills (id, repo, spec, test_name, framework, error_pattern, root_cause_category,
       fix, confidence, iterations, pr_url, validated_locally, prior_skill_count, success_count, fail_count,
       last_used_at, retired, investigation_findings, classification_outcome, root_cause_chain, repo_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [skill.id, skill.repo, skill.spec, skill.testName, skill.framework, skill.errorPattern,
       skill.rootCauseCategory, JSON.stringify(skill.fix), skill.confidence, skill.iterations,
       skill.prUrl, skill.validatedLocally, skill.priorSkillCount, skill.successCount, skill.failCount,
       skill.lastUsedAt, skill.retired, skill.investigationFindings, skill.classificationOutcome,
       skill.rootCauseChain, skill.repoContext]
    );
    this.skills.push(skill);
    core.info(`📝 Saved skill ${skill.id} to Retool DB`);
  }

  async recordOutcome(skillId: string, success: boolean): Promise<void> {
    const field = success ? 'success_count' : 'fail_count';
    await this.pool.query(
      `UPDATE triage_skills SET ${field} = ${field} + 1, last_used_at = NOW() WHERE id = $1`,
      [skillId]
    );
    // Check retirement
    const { rows } = await this.pool.query(
      'SELECT success_count, fail_count FROM triage_skills WHERE id = $1', [skillId]
    );
    if (rows[0]) {
      const total = rows[0].success_count + rows[0].fail_count;
      const failRate = total > 0 ? rows[0].fail_count / total : 0;
      if (failRate > 0.4 && rows[0].fail_count >= 3) {
        await this.pool.query('UPDATE triage_skills SET retired = true WHERE id = $1', [skillId]);
        core.warning(`⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate`);
      }
    }
  }

  async recordClassificationOutcome(skillId: string, outcome: 'correct' | 'incorrect'): Promise<void> {
    await this.pool.query(
      'UPDATE triage_skills SET classification_outcome = $1 WHERE id = $2',
      [outcome, skillId]
    );
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
  }
}
```

### 3.2 Preserve ALL existing methods

These methods stay in the base `SkillStore` class and work identically on the in-memory `this.skills` array:
- `findRelevant()`
- `findForClassifier()`
- `findForRepair()`
- `formatForClassifier()`
- `formatForRepair()`
- `formatForInvestigation()`
- `formatSkillsForPrompt()`
- `detectFlakiness()`
- `countForSpec()`
- `errorSimilarity()` (module-level function)

The only methods that change are `load()`, `save()`, `recordOutcome()`, `recordClassificationOutcome()` — the persistence layer.

---

## Phase 4: Wire into pipeline coordinator

### 4.1 Factory function

In `src/pipeline/coordinator.ts`, create the appropriate skill store based on inputs:

```typescript
let skillStore: SkillStore | undefined;
if (autoFixTargetRepo) {
  if (this.inputs.retoolDbUrl) {
    const store = new RetoolSkillStore(
      this.inputs.retoolDbUrl,
      autoFixTargetRepo.owner,
      autoFixTargetRepo.repo
    );
    skillStore = store;
  } else {
    skillStore = new SkillStore(this.octokit, autoFixTargetRepo.owner, autoFixTargetRepo.repo);
  }
  await skillStore.load().catch((err) => {
    core.warning(`Skill store load failed (non-fatal): ${err}`);
  });
}
```

### 4.2 Graceful fallback

If `RETOOL_DB_URL` is not set, the git branch skill store works exactly as today. Zero breaking changes for any consumer.

---

## Phase 5: Cross-repo skill sharing

### 5.1 Update load() for cross-repo queries

The Retool store can query across repos. Add a `loadCrossRepo()` method:

```typescript
async loadCrossRepo(relatedRepos: string[]): Promise<TriageSkill[]> {
  const { rows } = await this.pool.query(
    `SELECT * FROM triage_skills 
     WHERE repo = ANY($1) AND retired = false
     ORDER BY repo = $2 DESC, last_used_at DESC 
     LIMIT 100`,
    [[`${this.owner}/${this.repo}`, ...relatedRepos], `${this.owner}/${this.repo}`]
  );
  this.skills = rows.map(rowToTriageSkill);
  this.loaded = true;
  return this.skills;
}
```

### 5.2 Related repos config

All test repos target the same product. The related repos list can be derived from the `PRODUCT_REPO` input — all repos that share the same product repo are related. For now, hardcode or pass as input:

```yaml
RELATED_REPOS:
  description: 'Comma-separated list of related test repos for cross-repo skill sharing'
  required: false
  default: ''
```

---

## Phase 6: Migration script

### 6.1 One-time migration

Script to read `skills.json` from each repo's `triage-data` branch and INSERT into Postgres:

```typescript
// scripts/migrate-skills-to-retool.ts
const repos = [
  'adept-at/wdio-9-bidi-mux3',
  'adept-at/lib-cypress-canary',
  'adept-at/learn-webapp',
  'adept-at/lib-wdio-8-multi-remote-work',
];

for (const repo of repos) {
  const [owner, name] = repo.split('/');
  const skills = await loadFromGitBranch(octokit, owner, name);
  for (const skill of skills) {
    await insertIntoRetool(pool, skill);
  }
  console.log(`Migrated ${skills.length} skills from ${repo}`);
}
```

### 6.2 Transition period

Run both backends in parallel for 1-2 weeks:
- Write to both git branch AND Retool DB
- Read from Retool DB (primary), fall back to git branch if Retool fails
- After confidence period, remove git branch writes

---

## Phase 7: Retool Dashboard

### 7.1 Create via MCP

Once the API key is available:

```typescript
// Via MCP
retool_create_app({ name: "Triage Agent Skills Dashboard" })
```

### 7.2 Dashboard components

Build in Retool's visual editor:

| Component | Query | Purpose |
|-----------|-------|---------|
| Skills table | `SELECT * FROM triage_skills ORDER BY last_used_at DESC` | Browse all skills with filtering |
| Accuracy chart | `SELECT classification_outcome, COUNT(*) FROM triage_skills GROUP BY 1` | Classification accuracy |
| Repo breakdown | `SELECT repo, COUNT(*), AVG(confidence) FROM triage_skills GROUP BY 1` | Per-repo stats |
| Retirement log | `SELECT * FROM triage_skills WHERE retired = true` | What patterns stopped working |
| Error heatmap | `SELECT root_cause_category, framework, COUNT(*) FROM triage_skills GROUP BY 1,2` | Common failure patterns |
| Manual controls | Buttons for retire/unretire/delete | Admin operations |

---

## Phase 8: Consumer workflow changes

### 8.1 Add RETOOL_DB_URL secret

Each consuming repo's triage workflow needs the secret:

```yaml
# In triage-failed-tests.yml or triage-tests.yml
secrets:
  RETOOL_DB_URL: ${{ secrets.RETOOL_DB_URL }}
```

Or set as an org-wide secret:

```bash
echo "$RETOOL_DB_URL" | gh secret set RETOOL_DB_URL --org adept-at --visibility all
```

### 8.2 Pass to the shared workflow

The shared workflow in `adept-common/triage-failed-tests.yml` needs a new secret input:

```yaml
secrets:
  RETOOL_DB_URL:
    required: false
```

And pass to the triage agent:

```yaml
RETOOL_DB_URL: ${{ secrets.RETOOL_DB_URL }}
```

---

## Execution Order

| Step | What | Blocked on | Parallel? |
|------|------|-----------|-----------|
| 1 | Get Retool API key + DB connection string | Admin access | — |
| 2 | Create `triage_skills` table in Retool DB | Step 1 | — |
| 3 | Add `pg` dependency + `RetoolSkillStore` class | Nothing (can start now) | Yes |
| 4 | Wire into coordinator with fallback | Step 3 | — |
| 5 | Run migration script | Steps 2 + 4 | — |
| 6 | Add `RETOOL_DB_URL` to consumer workflows | Step 2 | Yes with 5 |
| 7 | Build dashboard in Retool | Step 2 | Yes with 3-6 |
| 8 | Cross-repo skill sharing | Step 5 | — |
| 9 | Remove git branch writes after confidence period | All above | — |

### What we can start NOW (before API key):
- Step 3: Build the `RetoolSkillStore` class and wire it into the coordinator with fallback logic
- Write the migration script
- Design the dashboard layout

### What requires the API key:
- Steps 1, 2, 5, 6, 7

---

## Secrets Summary

| Secret | Where | Purpose |
|--------|-------|---------|
| `RETOOL_DB_URL` | Org-wide GitHub secret | Agent writes skills to Retool DB |
| `RETOOL_API_KEY` | Cursor MCP config (local) | We create dashboard + admin tasks |

---

## Rollback Plan

If Retool DB has issues after migration:
1. Remove `RETOOL_DB_URL` from consumer workflows (falls back to git branch automatically)
2. The git branch skill store continues to work — it was never removed, just deprioritized
3. No data loss — Retool DB and git branch have independent copies

---

## Success Criteria

- [ ] Skills saved to Retool DB during triage runs
- [ ] Cross-repo skill queries working (wdio skills visible to cypress and vice versa)
- [ ] Dashboard showing accuracy rates and skill patterns
- [ ] No performance regression (load + save within 500ms)
- [ ] Graceful fallback when RETOOL_DB_URL is not set
- [ ] Migration of existing skills from all 5 repos
