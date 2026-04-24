# Adept Triage Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered GitHub Action that triages test failures, proposes fixes, validates them against the test, and opens a PR when they pass. Learns across runs via a DynamoDB-backed skill store and per-repo conventions files.

**Current version**: v1.52.0

## Documentation

- **[USAGE_GUIDE.md](USAGE_GUIDE.md)** — integration cookbook (consumer workflow setup, secrets, matrix jobs).
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — end-to-end architecture: pipeline, agents, learning loop, invariants.
- **[docs/agent-workflow-flowchart.md](docs/agent-workflow-flowchart.md)** — mermaid diagrams of the full pipeline.
- **[README_CROSS_REPO_PR.md](README_CROSS_REPO_PR.md)** — when you need a PAT vs `GITHUB_TOKEN`.
- **[RELEASE_PROCESS.md](RELEASE_PROCESS.md)** — bundling + tagging + `v1` rolling tag.
- **[seeds/DEPLOYED.md](seeds/DEPLOYED.md)** — record of which repos have `.adept-triage/context.md` deployed and which are bundled.

## What it does

When a test fails in your CI, this action can:

1. **Classify** the failure as `TEST_ISSUE` (flaky test / outdated selector / timing issue) or `PRODUCT_ISSUE` (actual app regression).
2. **Investigate** — five-agent pipeline (analysis → code reading → investigation → fix generation → review) produces a structured fix recommendation with a causal trace.
3. **Validate** — clones your repo, applies the fix on disk, runs the test command up to 3 iterations, only pushes on pass.
4. **Open a PR** with the validated fix for engineer review.
5. **Remember** — persists canonical fix patterns to a DynamoDB skill store. On the next failure in the same spec, prior successful patterns are surfaced into the agent prompts.

## Features

- **Multi-agent repair pipeline** — five specialized agents with an internal fix/review loop. Single-shot fallback when the orchestrator fails or times out.
- **Models**: `gpt-5.3-codex` for analysis/investigation/code-reading; `gpt-5.4` with `xhigh` reasoning for fix-gen + review (since v1.51.0).
- **Multimodal context** — screenshots, job logs, test-repo PR/commit diffs, and recent commits in the product repo (`adept-at/learn-webapp` by default).
- **Skill memory** — per-repo DynamoDB partition of canonical fix patterns. Retrieved by spec-match and error-similarity scoring. Auto-retired when success rate falls below 40%.
- **Seed skills** (v1.52.0) — hand-curated canonical fix exemplars, protected from pruning via `isSeed`. Bootstrap the learning loop before it's seen real failures.
- **Repo conventions** (v1.52.0) — opt-in `.adept-triage/context.md` file in the consumer repo (or bundled in the agent for high-traffic repos) that describes selector strategy, wait rules, auth flow. Prepended to every agent's system prompt.
- **Causal trace** (v1.48.1+) — fix-gen must emit a 4-field `failureModeTrace` (`originalState`, `rootMechanism`, `newStateAfterFix`, `whyAssertionPassesNow`). Review audits it as a quality CRITICAL.
- **Blast-radius confidence scaling** (v1.48.1+) — changes to shared code (`pageobjects/`, `helpers/`) automatically require higher confidence before auto-fix.
- **Chronic flakiness gate** — specs auto-fixed 3+ times in the flakiness window are flagged and auto-fix is skipped (human follow-up needed).
- **Local validation loop** — clones the target repo, runs the test command in-container, pushes only after a validated pass. Baseline check requires 3 consecutive passes to conclude "no fix needed."
- **Observability** — grep-stable log lines (`skill-telemetry role=...`, `Loaded repo context from ...`, `Agentic approach: ...`). See [ARCHITECTURE.md → Observability](docs/ARCHITECTURE.md#observability) for the full catalog.

## Quick start

### 1. Secrets required on the consumer repo

| Secret | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM calls. |
| `CROSS_REPO_PAT` | GitHub API when `REPOSITORY` or `AUTO_FIX_TARGET_REPO` differs from the triage repo. `repo` + `workflow` scopes. |
| `SLACK_WEBHOOK_URL` | If using the shared Slack notification action. |
| `TRIAGE_AGENT_DYNAMO_ACCESS_ROLE_ARN` (org-wide) | IAM role ARN trusted by GitHub OIDC for DynamoDB skill-store access. |

### 2. Test workflow — dispatch on failure

Add this step after artifact upload, before any cleanup:

```yaml
      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }}
          pr-number: ${{ github.event.pull_request.number || '' }}
          commit-sha: ${{ github.event.pull_request.head.sha || github.sha }}
          branch: ${{ github.head_ref || github.ref_name }}
          spec: ./path/to/failing-spec.ts
          preview-url: ${{ github.event.client_payload.target_url || '' }}
```

For matrix jobs, interpolate the matrix variable into `job-name` and `spec`.

### 3. Triage workflow — consume the dispatch event

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

permissions:
  contents: write
  actions: read
  id-token: write   # required for OIDC → DynamoDB

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
      test-frameworks: cypress
    secrets:
      CROSS_REPO_PAT: ${{ secrets.CROSS_REPO_PAT }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

This calls the reusable workflow in [`adept-at/adept-common`](https://github.com/adept-at/adept-common) which handles OIDC role assumption (`aws-actions/configure-aws-credentials@v4`), the triage-agent invocation, and Slack notification.

See [USAGE_GUIDE.md](USAGE_GUIDE.md) for direct-invocation examples (without the reusable workflow), matrix job handling, custom validation commands, and troubleshooting.

## Inputs

Full input table (all `inputs.*` from `action.yml`):

### Classification

| Input | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key. |
| `GITHUB_TOKEN` | No | `${{ github.token }}` | GitHub API token; use PAT when cross-repo. |
| `ERROR_MESSAGE` | No | — | Direct error text when workflow artifacts aren't available. |
| `WORKFLOW_RUN_ID` | No | — | The failed run to fetch logs/artifacts from. |
| `JOB_NAME` | No | — | The failing job to narrow analysis to. |
| `CONFIDENCE_THRESHOLD` | No | `70` | Minimum confidence (0-100) for a non-`INCONCLUSIVE` verdict. |
| `TEST_FRAMEWORKS` | No | `cypress` | `cypress` or `webdriverio`. |

### Diff context

| Input | Required | Default | Purpose |
|---|---|---|---|
| `REPOSITORY` | No | `${{ github.repository }}` | Test/app repo for PR/branch/commit diff lookup. |
| `PR_NUMBER` | No | — | PR on `REPOSITORY` for diff. |
| `COMMIT_SHA` | No | — | Commit for diff (when no PR). |
| `BRANCH` | No | — | Branch for diff (when no PR). |
| `PRODUCT_REPO` | No | `adept-at/learn-webapp` | Product repo whose recent commits are included in classification context. |
| `PRODUCT_DIFF_COMMITS` | No | `5` | How many recent product-repo commits to include. |

### Auto-fix

| Input | Required | Default | Purpose |
|---|---|---|---|
| `ENABLE_AUTO_FIX` | No | `false` | Opt-in to branch creation + PR. |
| `ENABLE_AGENTIC_REPAIR` | No | `true` | Use multi-agent orchestrator (vs single-shot only). |
| `AUTO_FIX_BASE_BRANCH` | No | `main` | Base branch for the fix branch. |
| `AUTO_FIX_MIN_CONFIDENCE` | No | `70` | Minimum fix confidence before auto-fix (raised by blast-radius scaling in v1.48.1+). |
| `AUTO_FIX_TARGET_REPO` | No | `${{ github.repository }}` | Repo where fixes are written. |
| `MODEL_OVERRIDE_FIX_GEN` | No | — | Override the fix-gen model (rollback lever). |
| `MODEL_OVERRIDE_REVIEW` | No | — | Override the review model (rollback lever). |

### Validation

| Input | Required | Default | Purpose |
|---|---|---|---|
| `ENABLE_VALIDATION` | No | `false` | Turn on validation after fix application. |
| `ENABLE_LOCAL_VALIDATION` | No | `false` | **Required `true`** with `VALIDATION_TEST_COMMAND` to use the in-container local loop. Else falls back to remote `validate-fix.yml` dispatch. |
| `VALIDATION_WORKFLOW` | No | `validate-fix.yml` | Remote validation workflow file (legacy path). |
| `VALIDATION_TEST_COMMAND` | No | — | Command template with `{spec}` and `{url}` placeholders. |
| `VALIDATION_SPEC` | No | — | Substitutes `{spec}` in the command. |
| `VALIDATION_PREVIEW_URL` | No | — | Substitutes `{url}` in the command. |
| `NPM_TOKEN` | No | — | Private npm token for `npm ci` during local validation. |

### Learning loop

| Input | Required | Default | Purpose |
|---|---|---|---|
| `TRIAGE_AWS_REGION` | No | `us-east-1` | DynamoDB region for the skill store. |
| `TRIAGE_DYNAMO_TABLE` | No | `triage-skills-v1-live` | DynamoDB table name. |

## Outputs

All outputs are strings (GitHub Actions convention). JSON blobs are stringified.

### Classification outputs (always set)

| Output | Values |
|---|---|
| `verdict` | `TEST_ISSUE` \| `PRODUCT_ISSUE` \| `INCONCLUSIVE` \| `PENDING` \| `ERROR` \| `NO_FAILURE` |
| `confidence` | `0`–`100` |
| `reasoning` | Detailed explanation. |
| `summary` | Short summary (use for PR comments / Slack). |
| `triage_json` | Full structured payload as stringified JSON. |

### Fix-recommendation outputs (when `TEST_ISSUE` + fix)

| Output | Values |
|---|---|
| `has_fix_recommendation` | `true` / `false` |
| `fix_recommendation` | Stringified JSON. |
| `fix_summary` | Human summary. |
| `fix_confidence` | `0`–`100` |

### Auto-fix outputs (when applied)

| Output | Values |
|---|---|
| `auto_fix_applied` | `true` / `false` |
| `auto_fix_branch` | Branch name. |
| `auto_fix_commit` | Commit SHA. (Note: `auto_fix_commit`, NOT `auto_fix_commit_sha`.) |
| `auto_fix_files` | Stringified JSON array of paths. |
| `auto_fix_skipped` | `true` when a policy gate (chronic flakiness, blast-radius) withheld a fix. |
| `auto_fix_skipped_reason` | Human-readable reason. |

### Validation outputs (remote path only)

| Output | Values |
|---|---|
| `validation_run_id` | Validation workflow run id. |
| `validation_status` | `passed` \| `pending` \| `skipped` |
| `validation_url` | URL to the validation run. |

## Three repository contexts

The agent operates across up to three GitHub repo contexts. Getting auth right depends on understanding which is which:

| Context | What it is | Always read from |
|---|---|---|
| `github.context.repo` | Repo where the triage workflow runs. | Workflow runs, job logs, screenshots, artifacts. |
| `REPOSITORY` | Test/app repo for diff lookup. | PR / branch / commit diffs. |
| `AUTO_FIX_TARGET_REPO` | Repo where fixes are written. | Source files + branches + PRs. |

A PAT is needed whenever `REPOSITORY` or `AUTO_FIX_TARGET_REPO` differs from `github.context.repo`. See [README_CROSS_REPO_PR.md](README_CROSS_REPO_PR.md).

## Repo conventions (`.adept-triage/context.md`)

Each consumer repo can commit a `.adept-triage/context.md` file (up to 6500 chars) describing:

- Framework + version, test runner, browser/grid.
- Page-object conventions.
- Preferred selectors and anti-patterns.
- Wait/timing rules (allowed and banned patterns).
- Auth / test setup quirks.
- Common pitfalls unique to the repo.

The agent fetches this file once per run via `octokit.repos.getContent`, sanitizes it, and prepends it to every agent's system prompt. Opt-in — repos without the file behave exactly as before.

**Bundled alternative**: for high-traffic product repos where tooling files are unwelcome (like `learn-webapp`), the content can be bundled inside the agent itself via `src/services/bundled-repo-contexts.ts`. Bundled entries short-circuit the remote fetch entirely. Trade-off: updating a bundled context requires an agent release. See [seeds/DEPLOYED.md](seeds/DEPLOYED.md) for the current arrangement.

## Version compatibility

Pin to the rolling major tag for automatic updates:

```yaml
uses: adept-at/adept-triage-agent@v1   # recommended — backward-compatible updates
```

Or pin to a specific version for full reproducibility:

```yaml
uses: adept-at/adept-triage-agent@v1.52.0
```

The `v1` tag is automatically moved to each new `v1.x.y` release by `.github/workflows/release.yml`.

## Development

```bash
npm install
npm test                       # full jest suite (660 tests as of v1.52.0)
npm run lint                   # eslint
npm run build                  # tsc
npm run package                # ncc bundle into dist/index.js
npm run all                    # build + package
./scripts/verify-release-readiness.sh   # full pre-release check
```

### Skill-store tooling

```bash
npx tsx scripts/audit-skills.ts              # audit the DynamoDB skill store
npx tsx scripts/audit-skills.ts --retire-flagged        # retire failed / duplicate skills
npx tsx scripts/audit-skills.ts --clear-noisy-incorrect # reset pre-v1.50.1 'incorrect' noise
npx tsx scripts/audit-skills.ts --delete-flagged        # delete high-fail-rate skills

npx tsx scripts/inspect-skills.ts            # dump all skills (or filter by id prefix)
npx tsx scripts/inspect-skills.ts 76c6c542   # single skill

npx tsx scripts/seed-skill.ts <file.json>    # insert one curated seed
npx tsx scripts/seed-skill.ts seeds/         # insert all seeds under a dir
npx tsx scripts/seed-skill.ts --list         # list existing seeds
npx tsx scripts/seed-skill.ts --remove <id>  # remove a seed

npx tsx scripts/check-spec-paths.ts          # diagnostic: print raw stored spec/testName
```

See [docs/ARCHITECTURE.md → Learning loop](docs/ARCHITECTURE.md#learning-loop--skill-store--repo-context--seeds) for the full semantics.

## License

MIT.
