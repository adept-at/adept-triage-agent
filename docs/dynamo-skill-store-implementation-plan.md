# DynamoDB Skill Store Implementation Plan

> **Status:** Historical — DynamoDB skill store shipped in v1.37.0. Auth switched from static IAM keys to OIDC in v1.42.0. Memory hardening (atomic counters, pruning, deterministic retrieval) shipped in v1.43.0. The Git `triage-data` branch fallback was removed in v1.44.0; `SkillStore` is now a single unified class with DynamoDB as the sole backend. See `docs/triage-memory-hardening-plan.md` for related work.

---

## What's Done

| Item | Version | Verified |
|------|---------|----------|
| DynamoDB table `triage-skills-v1-live` created (us-east-1, PAY_PER_REQUEST) | v1.37.0 | ✅ Integration test passed |
| IAM user `triage-agent-dynamo-user` scoped to table only | v1.37.0 | ✅ Read/write confirmed |
| `DynamoSkillStore` class (load, save, recordOutcome, recordClassificationOutcome) | v1.37.1 | ✅ All operations tested against real DynamoDB |
| Pipeline wiring: coordinator uses DynamoDB when AWS creds set, falls back to git | v1.37.0 | ✅ Type checks pass |
| action.yml inputs: TRIAGE_AWS_ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, TABLE | v1.37.0 | ✅ |
| Secrets set on: adept-triage-agent, learn-webapp, wdio-9-bidi-mux3, lib-cypress-canary, lib-wdio-8-multi-remote | v1.37.0 | ✅ |
| Investigation memory wired: formatForInvestigation → investigation agent prompt | v1.37.2 | ✅ |
| recordClassificationOutcome double-counting fixed on DynamoDB | v1.37.2 | ✅ |
| Dead formatForRepair removed | v1.37.2 | ✅ |

---

## What's In Progress

| Item | Status | Blocker |
|------|--------|---------|
| adept-common PR #13 — passes AWS secrets through shared workflow | PR open, ready to merge | Needs review/merge |

---

## What's TODO (in order)

### Step 1: Merge adept-common PR #13
```bash
cd /Users/pmerwin/Projects/Adept/adept-common
gh pr merge 13
```
**Verify:** `git show main:.github/workflows/triage-failed-tests.yml` includes `TRIAGE_AWS_ACCESS_KEY_ID` and `TRIAGE_AWS_SECRET_ACCESS_KEY` under secrets and in the triage action `with:` block.

### Step 2: Update consumer triage workflows
Add to each consumer's `triage-failed-tests.yml` secrets block:
```yaml
    secrets:
      # ... existing secrets ...
      TRIAGE_AWS_ACCESS_KEY_ID: ${{ secrets.TRIAGE_AWS_ACCESS_KEY_ID }}
      TRIAGE_AWS_SECRET_ACCESS_KEY: ${{ secrets.TRIAGE_AWS_SECRET_ACCESS_KEY }}
```

Repos to update:
- [ ] `wdio-9-bidi-mux3/.github/workflows/triage-failed-tests.yml`
- [ ] `lib-cypress-canary/.github/workflows/triage-failed-tests.yml`
- [ ] `learn-webapp/.github/workflows/triage-tests.yml` (**Phil will do this one**)
- [ ] `lib-wdio-8-multi-remote/.github/workflows/triage-failed-tests.yml`

**Verify per repo:** Trigger a test failure → triage logs show `Loaded N skill(s) from DynamoDB (triage-skills-v1-live)`.

### Step 3: Migrate existing skills from git branches
Only `wdio-9-bidi-mux3` has a `triage-data` branch with skills.

```bash
# Fetch existing skills
gh api repos/adept-at/wdio-9-bidi-mux3/contents/skills.json?ref=triage-data \
  --jq '.content' | base64 -d > /tmp/existing-skills.json

# Run migration (script to be written)
node scripts/migrate-skills-to-dynamo.js /tmp/existing-skills.json adept-at wdio-9-bidi-mux3
```

**Verify:** `aws dynamodb scan --table-name triage-skills-v1-live --max-items 5` shows migrated items.

### Step 4: Delete triage-data branches
After migration confirmed:
```bash
gh api repos/adept-at/wdio-9-bidi-mux3/git/refs/heads/triage-data -X DELETE
```

### Step 5: End-to-end verification
Trigger a real failure → verify:
1. Skills loaded from DynamoDB
2. Classification uses skill context
3. Investigation sees prior findings
4. Fix generated and validated
5. New skill saved to DynamoDB with investigationFindings
6. Subsequent run for same spec shows the saved skill

---

## Architecture

```
GitHub Action (triage agent v1.37.2+)
  │
  ├─ TRIAGE_AWS_ACCESS_KEY_ID set?
  │   ├─ Yes → DynamoSkillStore (reads/writes DynamoDB directly)
  │   └─ No  → SkillStore (reads/writes git triage-data branch)
  │
  └─ DynamoDB table: triage-skills-v1-live
       pk: REPO#owner/repo
       sk: SKILL#uuid
       gsi1: FRAMEWORK#cypress → for future cross-repo queries
```

## Secrets

| Secret | Set on | Purpose |
|--------|--------|---------|
| `TRIAGE_AWS_ACCESS_KEY_ID` | All consumer repos | DynamoDB access |
| `TRIAGE_AWS_SECRET_ACCESS_KEY` | All consumer repos | DynamoDB access |

IAM user `triage-agent-dynamo-user` has read/write scoped to `triage-skills-v1-live` only.
