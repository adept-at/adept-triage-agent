# Adept Triage Agent — Usage Guide

> Integration cookbook for adding the agent to a new repo or debugging a live triage run.
> For the architectural overview, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Current version**: v1.52.7

## Table of contents

1. [Workflow architecture](#workflow-architecture)
2. [Secrets checklist](#secrets-checklist)
3. [Test workflow — dispatching on failure](#test-workflow--dispatching-on-failure)
4. [Triage workflow — consuming the dispatch](#triage-workflow--consuming-the-dispatch)
5. [Running the action directly (without the reusable workflow)](#running-the-action-directly)
6. [Matrix jobs](#matrix-jobs)
7. [Validation — local vs remote](#validation--local-vs-remote)
8. [Opt-in: `.adept-triage/context.md`](#opt-in-adept-triagecontextmd)
9. [Debugging a triage run](#debugging-a-triage-run)
10. [Rollback and safety](#rollback-and-safety)

---

## Workflow architecture

⚠️ **Always run triage in a separate workflow from your tests.**

The test workflow fires a `repository_dispatch` event on failure; the triage workflow listens for that event. This gives triage access to:

- Completed workflow context (not mid-run).
- Uploaded artifacts (screenshots, logs).
- Full job logs (not truncated).
- Independent retry characteristics.

```
 Test workflow fails
        │
        │  adept-at/adept-common/.github/actions/triage-dispatch@main
        ▼
 repository_dispatch  { event_type: triage-failed-test, client_payload: {...} }
        │
        ▼
 Triage workflow (in the same repo)
        │
        │  uses: adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main
        ▼
 adept-at/adept-triage-agent@v1
```

Same-workflow invocation works but has less context and is only recommended for quick iteration / local testing.

---

## Secrets checklist

Set these on every consumer repo before the triage workflow will run end-to-end:

| Secret | Scope | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Repo | OpenAI API calls. |
| `CROSS_REPO_PAT` | Repo | GitHub PAT with `repo` + `workflow` scopes. Passed through as `GITHUB_TOKEN` so triage can read logs/artifacts, fetch source files, and create fix branches across repos. Can be scoped to a single GitHub App if you prefer. |
| `SLACK_WEBHOOK_URL` | Repo | For the shared Slack notification action (optional but recommended). |
| `TRIAGE_AGENT_DYNAMO_ACCESS_ROLE_ARN` | **Org-wide** | IAM role ARN trusted by GitHub OIDC. Consumer workflows assume this role to write to the skill-store DynamoDB table. |

CLI setup:

```bash
export OPENAI_API_KEY="sk-..."
export CROSS_REPO_PAT="ghp_..."
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

echo "$OPENAI_API_KEY"       | gh secret set OPENAI_API_KEY       --repo adept-at/YOUR-REPO
echo "$CROSS_REPO_PAT"       | gh secret set CROSS_REPO_PAT       --repo adept-at/YOUR-REPO
echo "$SLACK_WEBHOOK_URL"    | gh secret set SLACK_WEBHOOK_URL    --repo adept-at/YOUR-REPO

# Verify
gh secret list --repo adept-at/YOUR-REPO
```

The org-wide `TRIAGE_AGENT_DYNAMO_ACCESS_ROLE_ARN` secret is typically set by an org admin once and shared across all consumer repos.

---

## Test workflow — dispatching on failure

Add a single step after artifact upload in any job you want triaged:

```yaml
jobs:
  e2e:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Run Cypress
        run: npm run cy:run

      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: cypress-artifacts
          path: |
            cypress/logs/
            cypress/screenshots/

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }}
          pr-number: ${{ github.event.pull_request.number || '' }}
          commit-sha: ${{ github.event.pull_request.head.sha || github.sha }}
          branch: ${{ github.head_ref || github.ref_name }}
          spec: ./cypress/e2e/my-failing-spec.js
          preview-url: ${{ github.event.client_payload.target_url || '' }}
```

### `client_payload` fields the dispatch action emits

| Field | Required | Purpose |
|---|---|---|
| `workflow_run_id` | **Yes** | The failed run id to fetch logs/artifacts from. |
| `job_name` | **Yes** | The failing job. For matrix jobs, encode the matrix variable here. |
| `spec` | Recommended | Test file path — used for skill-store retrieval and validation placeholders. |
| `branch` | Recommended | Branch under test. |
| `commit_sha` | Recommended | Commit for diff lookup when no PR. |
| `repo_url` | Recommended | Passed as `REPOSITORY` in the reusable workflow (test-repo for diffs). |
| `pr_number` | Optional | PR for diff lookup. |
| `preview_url` | Optional | Preview URL for validation placeholders (`{url}`). |

---

## Triage workflow — consuming the dispatch

The simplest setup delegates everything to the reusable workflow in `adept-at/adept-common`. Create `.github/workflows/triage-failed-tests.yml`:

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

permissions:
  contents: write
  actions: read
  id-token: write   # required for OIDC → DynamoDB skill store

jobs:
  triage:
    uses: adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main
    with:
      workflow-run-id: ${{ github.event.client_payload.workflow_run_id }}
      job-name: ${{ github.event.client_payload.job_name }}
      spec: ${{ github.event.client_payload.spec }}
      pr-number: ${{ github.event.client_payload.pr_number }}
      commit-sha: ${{ github.event.client_payload.commit_sha }}
      branch: ${{ github.event.client_payload.branch }}
      repository: ${{ github.event.client_payload.repo_url }}
      preview-url: ${{ github.event.client_payload.preview_url }}
      test-frameworks: cypress    # or: webdriverio
    secrets:
      CROSS_REPO_PAT: ${{ secrets.CROSS_REPO_PAT }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

The reusable workflow handles:

- Polling for workflow-run completion (up to 10 minutes).
- OIDC role assumption via `aws-actions/configure-aws-credentials@v4` for DynamoDB.
- Invoking `adept-at/adept-triage-agent@v1` with the right input mapping.
- Uploading the triage artifact.
- Formatting + posting the Slack notification via `adept-at/adept-common/.github/actions/triage-slack-notify@main`.

### Slack input naming trap

The shared Slack action uses **hyphens**, not underscores, for its inputs:

| Correct | Wrong |
|---|---|
| `slack-webhook-url` | `slack_webhook_url` |
| `job-name` | `job_name` |
| `pr-number` | `pr_number` |
| `preview-url` | `preview_url` |
| `commit-sha` | `commit_sha` |
| `has-fix-recommendation` | `has_fix_recommendation` |
| `fix-confidence` | `fix_confidence` |
| `auto-fix-applied` | `auto_fix_applied` |
| `auto-fix-branch` | `auto_fix_branch` |

The agent's own outputs (`action.yml`) use underscores; the Slack action uses hyphens. Easy to mix up.

---

## Running the action directly

If you don't want the reusable workflow, invoke the action directly. Example triage workflow:

```yaml
name: Triage Failed Tests (direct)

on:
  repository_dispatch:
    types: [triage-failed-test]

permissions:
  contents: write
  actions: read
  id-token: write

jobs:
  triage:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Wait for workflow to complete
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.CROSS_REPO_PAT }}
          script: |
            const runId = '${{ github.event.client_payload.workflow_run_id }}';
            for (let i = 0; i < 60; i++) {
              const { data } = await github.rest.actions.getWorkflowRun({
                owner: context.repo.owner, repo: context.repo.repo, run_id: runId,
              });
              if (data.status === 'completed') return;
              await new Promise(r => setTimeout(r, 10000));
            }
            throw new Error('Run did not complete within 10 minutes');

      - name: Assume OIDC role for DynamoDB
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.TRIAGE_AGENT_DYNAMO_ACCESS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Triage
        id: triage
        uses: adept-at/adept-triage-agent@v1
        with:
          GITHUB_TOKEN:       ${{ secrets.CROSS_REPO_PAT }}
          OPENAI_API_KEY:     ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID:    ${{ github.event.client_payload.workflow_run_id }}
          JOB_NAME:           ${{ github.event.client_payload.job_name }}
          PR_NUMBER:          ${{ github.event.client_payload.pr_number }}
          COMMIT_SHA:         ${{ github.event.client_payload.commit_sha }}
          BRANCH:             ${{ github.event.client_payload.branch }}
          REPOSITORY:         ${{ github.event.client_payload.repo_url }}
          TEST_FRAMEWORKS:    cypress
          ENABLE_AUTO_FIX:    'true'
          ENABLE_VALIDATION:  'true'
          # Optional: turn on the local-validation loop
          # ENABLE_LOCAL_VALIDATION: 'true'
          # VALIDATION_TEST_COMMAND: 'npx cypress run --spec "{spec}" --config baseUrl={url}'
          # VALIDATION_PREVIEW_URL: ${{ github.event.client_payload.preview_url }}
          # VALIDATION_SPEC: ${{ github.event.client_payload.spec }}

      - name: Upload triage artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: triage-result
          path: triage-result.json

      - name: Notify Slack
        if: always()
        uses: adept-at/adept-common/.github/actions/triage-slack-notify@main
        with:
          slack-webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          verdict: ${{ steps.triage.outputs.verdict }}
          confidence: ${{ steps.triage.outputs.confidence }}
          summary: ${{ steps.triage.outputs.summary }}
          job-name: ${{ github.event.client_payload.job_name }}
          workflow-run-id: ${{ github.event.client_payload.workflow_run_id }}
          pr-number: ${{ github.event.client_payload.pr_number }}
          preview-url: ${{ github.event.client_payload.preview_url }}
          commit-sha: ${{ github.event.client_payload.commit_sha }}
          has-fix-recommendation: ${{ steps.triage.outputs.has_fix_recommendation }}
          fix-confidence: ${{ steps.triage.outputs.fix_confidence }}
          auto-fix-applied: ${{ steps.triage.outputs.auto_fix_applied }}
          auto-fix-branch: ${{ steps.triage.outputs.auto_fix_branch }}
```

### Canonical input names (from `action.yml`)

Refer to `adept-triage-agent/action.yml` for the source of truth. Common gotchas:

- `AUTO_FIX_BASE_BRANCH` (not `AUTO_FIX_BRANCH`).
- `PR_NUMBER` and `COMMIT_SHA` are top-level inputs, not `AUTO_FIX_PR_NUMBER`.
- `BRANCH` is separate from `AUTO_FIX_BASE_BRANCH`.
- `AUTO_FIX_TARGET_REPO` defaults to the current repo but should be set explicitly when fixes go to a different repo from where diffs are read (e.g. a canary repo testing against a product repo).

---

## Matrix jobs

When the failing test is part of a matrix, encode the matrix variable into `job-name` and `spec` in the dispatch step:

```yaml
jobs:
  e2e:
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: chrome
            spec: cypress/e2e/login.spec.js
          - name: firefox
            spec: cypress/e2e/login.spec.js
          - name: chrome-mobile
            spec: cypress/e2e/mobile.spec.js

    steps:
      # ... test steps ...

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: '${{ github.job }} (${{ matrix.name }})'
          spec: ${{ matrix.spec }}
          pr-number: ${{ github.event.pull_request.number || '' }}
          commit-sha: ${{ github.event.pull_request.head.sha || github.sha }}
          branch: ${{ github.head_ref || github.ref_name }}
```

Without matrix interpolation, every matrix shard ends up with the same `job-name` and the agent can't distinguish which one actually failed.

---

## Validation — local vs remote

### Local-validation loop (recommended)

Clones the target repo on the triage runner, applies the fix on disk, runs the test command up to 3 times, pushes the branch + opens a PR only on pass.

**All five of these must be true**:

- `ENABLE_AUTO_FIX: 'true'`
- `ENABLE_VALIDATION: 'true'`
- `ENABLE_LOCAL_VALIDATION: 'true'`
- `VALIDATION_TEST_COMMAND` set (template with `{spec}` and `{url}` placeholders)
- `AUTO_FIX_TARGET_REPO` resolves (not empty)

Example:

```yaml
  triage:
    uses: adept-at/adept-triage-agent@v1
    with:
      # ... other inputs ...
      ENABLE_AUTO_FIX:          'true'
      ENABLE_VALIDATION:        'true'
      ENABLE_LOCAL_VALIDATION:  'true'
      VALIDATION_TEST_COMMAND:  'npx cypress run --spec "{spec}" --config baseUrl={url}'
      VALIDATION_PREVIEW_URL:   ${{ github.event.client_payload.preview_url }}
      VALIDATION_SPEC:          ${{ github.event.client_payload.spec }}
      NPM_TOKEN:                ${{ secrets.NPM_TOKEN }}
```

Placeholder substitution:
- `{spec}` ← `VALIDATION_SPEC` (falls back to the spec from the dispatch payload).
- `{url}` ← `VALIDATION_PREVIEW_URL` (falls back to `https://learn.adept.at`).

The loop runs at most `FIX_VALIDATE_LOOP.MAX_ITERATIONS = 3` iterations. Before the first iteration, a **baseline check** runs the test 3 consecutive times without any fix applied. If all 3 pass, the original failure was transient and the run exits with no fix.

### Remote-validation path (legacy)

If you don't want the local loop, the agent creates the fix branch via the GitHub API and dispatches `VALIDATION_WORKFLOW` (default `validate-fix.yml`) on the target repo:

```yaml
  triage:
    uses: adept-at/adept-triage-agent@v1
    with:
      ENABLE_AUTO_FIX:      'true'
      ENABLE_VALIDATION:    'true'
      VALIDATION_WORKFLOW:  'validate-fix.yml'
      # ENABLE_LOCAL_VALIDATION left false
```

The target repo must implement `.github/workflows/validate-fix.yml` — it checks out the fix branch, runs the failing spec, and comments on the PR with the result.

Outputs `validation_run_id` + `validation_url` are set on the remote path.

---

## Opt-in: `.adept-triage/context.md`

Each consumer repo can commit a markdown file describing its testing conventions. The agent fetches it once per run and prepends it to every agent's system prompt.

### File location

`.adept-triage/context.md` at the repo root, on the branch being tested (not always `main` — the agent uses `BRANCH` input, falling back to `AUTO_FIX_BASE_BRANCH`, falling back to `main`).

### What to include

Target ~3000–5500 chars. Every line should change agent behavior. Good section layout:

```markdown
## Framework & runtime
- <framework + version>
- <test runner, browser, grid>
- <baseUrl + env conventions>

## Page objects
- <where they live, naming, which ones are canonical>

## Selectors
- <preferred attributes: data-testid, aria-label, etc.>
- <anti-patterns: what NOT to match against>
- <framework-specific quirks: shadow DOM, ag-Grid, etc.>

## Waits / timing
- <allowed patterns: waitUntil, waitForExist, intercepts>
- <banned patterns: fixed cy.wait(N), global selectors on lazy-mount elements>

## Auth & test setup
- <login flow, cookies, beforeEach patterns>

## Common pitfalls
- <recurring failure modes and their canonical fixes>
```

Anything longer than 6500 chars gets truncated with a `[truncated]` marker. The file goes through `sanitizeForPrompt` before injection (triple backticks escaped, injection keywords filtered) — treat it as untrusted content despite living in your org.

### How it's surfaced

- **Log line on successful fetch**: `📘 Loaded repo context from <owner/repo>/.adept-triage/context.md@<ref> (<N> chars)`.
- **Agent behavior**: prepended to the system prompt of every agent (analysis, investigation, fix-gen, review). There is no weaker repair fallback path; if the agentic pipeline cannot produce an approved fix, the run reports no safe fix.
- **Missing file / 404**: silent. The agent behaves as if the file doesn't exist. Opt-in per repo.

### Bundled alternative (for product repos)

For high-traffic product repos where adding tooling files to every PR is unwelcome, the content can be bundled inside the agent via `src/services/bundled-repo-contexts.ts`. Bundled entries short-circuit the remote fetch entirely.

Currently bundled: `adept-at/learn-webapp`. Trade-off: updating a bundled context requires an agent release. If you need faster iteration, commit the file in-repo instead. See [seeds/DEPLOYED.md](seeds/DEPLOYED.md).

---

## Debugging a triage run

### First, check the grep-stable log lines

```
📝 Loaded N skill(s) from DynamoDB ...   → skill store connected
📘 Loaded repo context ...               → conventions file was found
📝 skill-telemetry role=... ids=...      → which skills reached which agent
🤖 Agentic approach: agentic, ...        → orchestrator ran end-to-end
🔄 Fix-Validate iteration N/3            → local validation iteration
🧪 Running test locally...               → test command kicked off
✅ Baseline check passed — ...           → 3/3 passes, no fix needed
❌ Baseline failed on pass N ...         → real failure confirmed
⏭️ Chronic flakiness: ...                → auto-fix intentionally skipped
📊 skill-telemetry-summary loaded=... surfaced=... saved=...   → end-of-run rollup
```

The per-run summary always fires, even on errors — search for it to confirm the agent actually ran.

### Common issues

**"Cannot find module '@actions/core'"**
`dist/index.js` is not bundled. Consumer is using a tag that predates ncc bundling. Pin to a newer version or `@v1`.

**Action runs but no outputs appear**
The top-level `catch` in `src/index.ts` fires only on unrecoverable errors. Check the action log for `core.setFailed` lines; the agent may have fallen through to `ERROR` with a useful `reasoning` output.

**"No error data found to analyze"**
`handleNoErrorData` branch. Either (a) the referenced `WORKFLOW_RUN_ID` doesn't have a failing job with logs, or (b) the `JOB_NAME` doesn't match any job in that run. For matrix jobs, `JOB_NAME` must include the matrix variable (e.g. `e2e (chrome)`).

**`verdict=PENDING`**
The referenced workflow run is still in progress. The reusable workflow polls for completion; direct invocations may hit this if you don't wait.

**`auto_fix_skipped=true`**
Check `auto_fix_skipped_reason`. Common reasons:
- Chronic flakiness — spec has been auto-fixed 3+ times in the flakiness window.
- Blast-radius gate — fix touches shared code and required confidence was raised.
- No proposed changes — fix-gen couldn't find a valid change.

**No fix despite `TEST_ISSUE` verdict**
Either investigation's `verdictOverride` flipped the decision (`APP_CODE` with higher confidence than analysis), or `!isTestCodeFixable && !verdictOverride`. The run log will show the abort reason in the agent's output.

**Skill not retrieved on a failure that matches a seed**
Check `scripts/check-spec-paths.ts` — compare the raw stored `spec` with what `errorData.fileName` produces for your failure. `normalizeSpec` handles GHA runner prefixes but can't fix arbitrary path variations. The skill's `spec` must produce the same normalized value as your failure's path.

### Useful scripts for live debugging

```bash
# What's actually in the skill store right now?
npx tsx scripts/audit-skills.ts
npx tsx scripts/inspect-skills.ts <id-prefix>

# Verify a seed's spec format will match production
npx tsx scripts/check-spec-paths.ts
```

All require AWS credentials in the env (same ones the action uses).

---

## Rollback and safety

### Pin to a specific version

If a release breaks your workflow:

```yaml
uses: adept-at/adept-triage-agent@v1.52.6   # previous working version
```

### Revert a repo's `.adept-triage/context.md`

If a context file is causing bad fixes, either revert the PR that added it or commit a correction. The fetcher silently returns empty on 404, so deletion is also valid.

### Rollback a bundled context

Bundled contexts ship with the agent — fixing one requires a new agent release. If urgent:

1. Edit `src/services/bundled-repo-contexts.ts` to remove the key (or change the content).
2. `npm run all` to rebuild.
3. PR + merge + release.

### Retire a bad skill

```bash
# Identify it
npx tsx scripts/inspect-skills.ts <id-prefix>

# Retire (keeps history, stops surfacing)
# Via audit flags:
npx tsx scripts/audit-skills.ts --retire-flagged    # if it meets a flag criterion

# Or delete a seed outright:
npx tsx scripts/seed-skill.ts --remove <id-prefix>
```

Retired skills still contribute to `detectFlakiness` counts, which is intentional — a spec whose last N patterns all retired IS chronic flakiness, not healthy state.

### Disable the agent entirely for one repo

Delete `.github/workflows/triage-failed-tests.yml` from the consumer repo. Or flip `ENABLE_AUTO_FIX: 'false'` to stop auto-fix writes while keeping classification/PR-comment output.

---

**See also**

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — deep architecture.
- [docs/agent-workflow-flowchart.md](docs/agent-workflow-flowchart.md) — visual pipeline.
- [README_CROSS_REPO_PR.md](README_CROSS_REPO_PR.md) — cross-repo auth.
- [RELEASE_PROCESS.md](RELEASE_PROCESS.md) — how releases are cut.
- [seeds/DEPLOYED.md](seeds/DEPLOYED.md) — which repos have context deployed.
