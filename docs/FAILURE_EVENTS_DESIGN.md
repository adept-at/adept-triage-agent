# Design: Failure Event Records + Weekly Failure Report

Status: Approved for implementation
Target version: v1.53.0 (minor — additive feature)
Date: 2026-07-03

## 1. Problem

The triage agent has no durable record of which tests failed. Triage result
artifacts expire after ~7 days and GitHub Actions run metadata does not carry
the failed spec/test name, so questions like "which test failed most this
month?" are unanswerable (see `triage-agent-intelligence-report.md`).

## 2. Solution Overview

Write one small, flat "failure event" item to the **existing** DynamoDB skill
table (`triage-skills-v1-live`) on every triage run, then aggregate them with
a weekly report script. **Nothing is deployed on the backend**: no new table,
no IAM changes, no new secrets, no `action.yml` changes.

This works because the table is single-table-designed and the skill loader
queries with `begins_with(sk, 'SKILL#')` (`src/services/skill-store.ts`,
`load()`), so items with a `FAILURE#` sort-key prefix are invisible to all
existing skill logic. The action already has PutItem access via the OIDC role
configured by the consumer workflows (the skill store already does
`PutCommand` against this table).

## 3. Data Model

Key schema (same table, new entity type):

| Attribute | Value |
| --- | --- |
| `pk` | `REPO#<owner>/<repo>` — the repo the test lives in (auto-fix target repo) |
| `sk` | `FAILURE#<failedAt ISO-8601>#<triageRunId>` |

The timestamp-prefixed sort key makes date-range queries trivial
(`sk BETWEEN 'FAILURE#<start>' AND 'FAILURE#<end>'`) and naturally unique
(same-millisecond collisions are disambiguated by the triage run id).

Item attributes (all flat, all known at write time):

```typescript
export interface FailureEvent {
  repo: string;          // 'adept-at/learn-webapp' (test repo, same as pk)
  spec: string;          // normalizeSpec(errorData.fileName) or 'unknown'
  testName: string;      // errorData.testName or 'unknown'
  framework: string;     // errorData.framework or 'unknown'
  verdict: string;       // TEST_ISSUE | PRODUCT_ISSUE | INCONCLUSIVE
  confidence: number;    // classifier confidence 0-100
  failedAt: string;      // ISO timestamp (write time)
  sourceRunId: string;   // inputs.workflowRunId (the failed test workflow run)
  triageRunUrl: string;  // from GITHUB_SERVER_URL/GITHUB_REPOSITORY/GITHUB_RUN_ID env
  branch: string;        // inputs.branch or ''
  prNumber: string;      // inputs.prNumber or ''
}
```

No TTL, no GSI. Volume is ~60–100 events/month — negligible.

## 4. Implementation Tasks

### Task A — Failure event write path

**New file: `src/services/failure-event-store.ts`**

- Export `FailureEvent` (above) and one function:

```typescript
export async function recordFailureEvent(
  region: string,
  tableName: string,
  event: FailureEvent
): Promise<void>
```

- Behavior:
  - Lazy dynamic import of `@aws-sdk/client-dynamodb` /
    `@aws-sdk/lib-dynamodb`, `DynamoDBDocumentClient.from(raw,
    { marshallOptions: { removeUndefinedValues: true } })` — mirror
    `SkillStore.getDocClient()` exactly.
  - Single `PutCommand` with `Item: { pk, sk, ...event }`.
  - `sk` uses `event.failedAt` plus the triage run id
    (`process.env.GITHUB_RUN_ID`); fall back to a short random suffix
    (`crypto.randomUUID().slice(0, 8)`) when the env var is absent
    (local runs).
  - **Never rejects.** Catch everything, `core.warning(...)`, return. Same
    contract as every `SkillStore` write. A Dynamo hiccup must never fail a
    triage run.
  - On success: `core.info('📝 failure-event recorded for <repo> <spec>')` —
    keep this log line grep-stable; the E2E verification greps for
    `failure-event recorded`.
  - Do NOT build a class, cache, or query methods. This module is write-only
    from the action. (Reads happen in the report script, Task B.)

**Hook: `src/pipeline/coordinator.ts`, inside `runClassifyAndRepair()`**

Record the event as soon as a verdict exists — exactly two call sites:

1. Infrastructure fast-path: after `detectInfrastructureFailure` matches
   (verdict `INCONCLUSIVE`, confidence 95), just before
   `setInconclusiveOutput(...)`/`return`.
2. Normal path: immediately after `const classification = await
   this.classify(errorData, skillStore);` and **before** the
   confidence-threshold / non-TEST_ISSUE early returns — every verdict gets
   recorded, not just TEST_ISSUE.

Add a small private helper on the coordinator so both call sites share it:

```typescript
private async recordFailure(
  errorData: ErrorData,
  verdict: string,
  confidence: number,
  autoFixTargetRepo: { owner: string; repo: string } | null
): Promise<void>
```

- Repo resolution: use `autoFixTargetRepo` when non-null (it is already
  computed in `execute()` and defaults to `github.repository` via
  `action.yml`, i.e. the repo the test lives in). When null, parse
  `process.env.GITHUB_REPOSITORY`; if that is also absent, log a warning and
  skip — do not throw.
  - `autoFixTargetRepo` must be passed into `runClassifyAndRepair`'s helper
    (it is already a parameter of `runClassifyAndRepair`).
- Spec: reuse `normalizeSpec(errorData.fileName)` from
  `src/services/skill-store.ts` (already exported). Fall back to `'unknown'`.
- Region/table: `this.inputs.triageAwsRegion || 'us-east-1'` and
  `this.inputs.triageDynamoTable || 'triage-skills-v1-live'` (same fallbacks
  used for the SkillStore construction in `execute()`).
- `await` the call (it never rejects; the ~50 ms PutItem is noise next to LLM
  latency).
- The write must be **unconditional on auto-fix settings** — it fires even
  when `enableAutoFix` is false and no `SkillStore` was constructed.

**The `handleNoErrorData()` path records nothing** (no failure was
identified). The `execute()` catch path (verdict ERROR in `index.ts`) records
nothing. Both are intentional.

### Task B — Weekly report script

**New file: `scripts/weekly-failure-report.ts`**

Model on `scripts/inspect-skills.ts` (env-var config, plain `console.log`,
`npx tsx` execution, no build integration):

- Config: `TRIAGE_DYNAMO_TABLE` (default `triage-skills-v1-live`),
  `AWS_REGION` (default `us-east-1`), optional `--days N` argv (default 7).
- Read path: `ScanCommand` with
  `FilterExpression: 'begins_with(sk, :f) AND failedAt >= :start'`.
  A scan is deliberate — the table is tiny, and scanning avoids maintaining a
  hardcoded repo list (repos onboard/offboard). Paginate with
  `LastEvaluatedKey` (scans return partial pages when filtered).
- Output (markdown to stdout, so it can be pasted into Slack/GitHub as-is):
  1. Header: window covered, total event count, per-repo totals.
  2. Main table sorted by count desc, grouped by `repo + spec + testName`:
     columns `Repo | Spec | Test | Failures | Verdicts | Last Failed`.
     `Verdicts` renders as e.g. `TEST_ISSUE×3, INCONCLUSIVE×1`.
  3. Tie handling: render all rows; no arbitrary cutoff.
- No unit tests for this script — repo convention is that `scripts/` are not
  under jest (verify: no existing `scripts/` tests). Verification is manual
  against the live table (Phase 3 below).

### Task C — Tests

**New file: `__tests__/services/failure-event-store.test.ts`**

Copy the AWS SDK mocking pattern from `__tests__/services/skill-store.test.ts`
(named mock command classes + shared `__send` jest.fn). Cover:

1. Happy path: one `PutCommand`; assert item has
   `pk === 'REPO#adept-at/learn-webapp'`, `sk` matching
   `/^FAILURE#\d{4}-\d{2}-\d{2}T.*#/`, and all `FailureEvent` fields present.
2. `sk` suffix uses `GITHUB_RUN_ID` when set; random suffix when unset.
3. Never-reject contract: `mockSend` rejects → function resolves,
   `core.warning` called, no throw.

**Coordinator hook coverage** — add assertions to the existing pipeline-level
tests rather than new files where possible (`__tests__/helpers/pipeline-harness.ts`
is the harness; see `__tests__/pipeline/` for consumers). Mock
`src/services/failure-event-store` with `jest.mock` and assert:

1. Normal path: `recordFailureEvent` called once with the classifier's
   verdict/confidence, regardless of verdict value (use a PRODUCT_ISSUE or
   INCONCLUSIVE fixture to prove non-TEST_ISSUE verdicts record too).
2. `handleNoErrorData` path: not called.
3. A rejecting/warning store never fails the run (covered by unit test 3 plus
   the never-reject contract; no extra pipeline test needed).

**Tests to remove: none.** This feature is purely additive. Subagents must
NOT delete or weaken existing tests. If an existing coordinator test breaks
because of the new call, update the test's mocks to accommodate it (add the
`jest.mock` for the new module) — that is an update, not a removal.

## 5. Phased Plan (with subagent assignments)

Constraints (house rules):
- Subagents implement and report back; they must not spawn further subagents.
- Parent agent reviews all diffs before build/release and performs the
  release itself.
- No commits until the release phase.

### Phase 1 — Implement (parallel subagents)

| Subagent | Scope | Deliverable |
| --- | --- | --- |
| A | Task A + Task C unit tests for the store | `src/services/failure-event-store.ts`, coordinator hook, `__tests__/services/failure-event-store.test.ts` |
| B | Task B | `scripts/weekly-failure-report.ts` |
| C | Task C pipeline-harness assertions (after A lands, or same subagent as A) | updated pipeline tests |

Each subagent's acceptance criteria:
- `npm run lint` clean on touched files.
- `npm test` green (full suite — pre-existing failures must be reported, not
  "fixed" by weakening tests).
- No changes to `action.yml`, `dist/`, or unrelated files.
- Follow `simplicity-first.mdc`: no config layers, no mapping tables, no
  speculative options.

### Phase 2 — Parent review + local verification

1. Parent reviews all diffs directly (read every changed file).
2. `npm run lint && npm test`.
3. `npm run all` (build + ncc package) — dist changes expected, not yet
   committed.
4. Optional local smoke: `scripts/test-local-triage.ts` against a recent real
   failed run with live AWS creds; confirm the `failure-event recorded` log
   line and a `FAILURE#` item in the table:

```bash
aws dynamodb query --table-name triage-skills-v1-live \
  --key-condition-expression 'pk = :p AND begins_with(sk, :s)' \
  --expression-attribute-values '{":p":{"S":"REPO#adept-at/<repo>"},":s":{"S":"FAILURE#"}}'
```

5. Run the report script against the live table (read-only):
   `npx tsx scripts/weekly-failure-report.ts --days 30`.

### Phase 3 — Release (parent, per RELEASE_PROCESS.md)

1. `./scripts/verify-release-readiness.sh`
2. `npm version minor` → 1.53.0
3. `npm run all && git add dist/ && git commit` (dist bundle for release)
4. Push main, `gh release create v1.53.0 --target main`
5. `.github/workflows/release.yml` verifies the bundle and rolls the `v1`
   tag — all consumer repos pick up the new agent automatically (they call
   `adept-at/adept-triage-agent@v1` via the shared `adept-common` workflow).

### Phase 4 — E2E verification (testing methodology)

Per `docs/E2E_TESTING_PLAN.md` Approach 3 (extended smoke script):

1. **Pre-flight:** verify `CROSS_REPO_PAT` is valid in the consumer repos
   (`gh secret list`). Verified 2026-07-03: the PAT was rotated 2026-06-03
   across all five consumer repos and triage runs have succeeded since
   (e.g. `learn-webapp` runs on 2026-06-25 and 2026-07-02) — not a blocker.
2. Update `scripts/smoke-test-dispatch.sh` run IDs with fresh real failed
   workflow runs (artifacts must not be expired), then run it.
3. Verify per repo:
   - Triage run log contains `failure-event recorded`.
   - The DynamoDB query above returns the new `FAILURE#` items.
   - `npx tsx scripts/weekly-failure-report.ts --days 1` shows the events.
4. Confirm no regression in normal triage output (verdict/confidence/summary
   non-empty in Slack).

## 6. Explicit Non-Goals

- No scheduled automation of the report yet (run manually or via a Cursor
  automation later; a scheduled workflow needs an AWS role secret in this
  repo — separate decision).
- No TTL/expiry on failure events.
- No new action inputs, outputs, or secrets.
- No changes to skill store logic, `adept-common`, or consumer workflows.
- No `failureFingerprint`/duration fields from the intelligence report's
  full data model — this is the minimal viable slice; extend later if the
  weekly report proves insufficient.
