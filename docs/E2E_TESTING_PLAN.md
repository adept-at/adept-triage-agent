# End-to-End Testing Plan: Triage Agent Auto-Fix + Validation Chain

This document outlines practical approaches to E2E test the triage agent's dispatch → triage → auto-fix → validate chain across the four browser test repos.

## Chain Overview

```
Test workflow fails
  → triage-dispatch fires repository_dispatch (triage-failed-test)
  → triage-failed-tests.yml receives dispatch, calls adept-triage-agent
  → Agent analyzes failure, generates fix, creates branch, triggers validate-fix.yml
  → validate-fix.yml checks out fix branch, runs failing spec, creates PR if pass
```

**Repos with auto-fix + validation:** lib-cypress-canary, lib-wdio-8-e2e-ts, lib-wdio-8-multi-remote  
**Repos with triage only:** learn-webapp

## Key Challenges

| Challenge | Impact |
|-----------|--------|
| `repository_dispatch` is programmatic-only | Cannot trigger manually via UI; must use `gh` CLI or GitHub API |
| Real test failures required | Agent needs logs, screenshots, artifacts to analyze |
| OpenAI is non-deterministic | Fix quality varies; demo may need retries or synthetic scenarios |
| Validation needs real browser | Must run in CI (Sauce Labs/GHA) or local runner |
| Cross-repo dependencies | adept-common, adept-triage-agent, consumer repos all involved |

---

## Approach 1: Synthetic Failure + Manual Dispatch (Recommended for Demos)

**Idea:** Create a deliberately broken test spec in one repo that the agent can reliably fix. Run the test workflow, let it fail, then use `gh` to dispatch with the resulting `workflow_run_id`, or rely on the existing failure step to fire the dispatch.

### Implementation

1. **Add a synthetic failure spec** to `lib-cypress-canary` (or lib-wdio-8-e2e-ts):
   - File: `cypress/e2e/synthetic-triage-demo.cy.ts` (or similar)
   - Pattern: Use a selector that will definitely fail in a known way, e.g. `cy.get('[data-testid="non-existent-demo"]')` — then add that element to a minimal page, or use a timing issue like `cy.get('button').click()` without `should('be.visible')`
   - **Best pattern:** Wrong selector that has an obvious fix. Example:
     ```ts
     // Deliberately wrong: element uses data-testid="submit" but we use "submit-btn"
     cy.get('[data-testid="submit-btn"]').click();
     ```
   - Ensure the test runs in a workflow that has a preview URL and uploads artifacts.

2. **Create a demo workflow** `e2e-triage-demo.yml` that:
   - Triggers on `workflow_dispatch` with input `demo_mode: true`
   - Runs only the synthetic spec against a known preview URL
   - On failure: uses triage-dispatch (already in place) OR a manual step that fires `repository_dispatch` with the current `workflow_run_id`
   - The shared triage workflow must have `ENABLE_AUTO_FIX: 'true'` and `ENABLE_VALIDATION: 'true'` in the adept-common workflow (or the consumer's triage config)

3. **Verify the shared workflow** in `adept-at/adept-common` passes:
   - `ENABLE_AUTO_FIX: 'true'`
   - `ENABLE_VALIDATION: 'true'`
   - `VALIDATION_PREVIEW_URL` from `client_payload.preview_url`
   - `VALIDATION_SPEC` from `client_payload.spec`

4. **Demo steps:**
   - Run the demo workflow (or push a branch that runs the synthetic spec)
   - Wait for test to fail
   - Dispatch fires automatically, or run: `./scripts/smoke-test-dispatch.sh` (adapted with the new run_id)
   - Monitor triage run → fix branch created → validate-fix triggered → spec passes

### Pros

- Exercises the full chain: real failure → real artifacts → real AI → real fix → real validation
- Reproducible for demos (same synthetic scenario)
- Can be run on any PR or branch with a preview URL

### Cons

- AI fix is not guaranteed (non-deterministic); may need 1–2 retries
- Requires a real preview URL (Vercel/Sauce) — adds setup
- Synthetic spec lives in prod test suite unless gated by `workflow_dispatch` only

### Chain Coverage

| Step | Covered |
|------|---------|
| Test failure | ✅ |
| repository_dispatch | ✅ (via triage-dispatch or manual) |
| Triage workflow | ✅ |
| Agent analysis + fix | ✅ |
| Branch creation | ✅ |
| workflow_dispatch (validate-fix) | ✅ |
| Validation run + pass | ✅ |

### Effort

- **Setup:** 2–4 hours (synthetic spec, demo workflow, verify adept-common config)
- **Repos:** lib-cypress-canary (or lib-wdio-8-e2e-ts), adept-common

---

## Approach 2: Orchestrated Integration Workflow

**Idea:** A single GitHub Actions workflow that runs a failing test, captures `workflow_run_id`, fires `repository_dispatch`, then polls for the fix branch and validation result.

### Implementation

1. **Create `e2e-triage-chain.yml`** in adept-triage-agent (or a consumer repo):

   ```yaml
   name: E2E Triage Chain Test

   on:
     workflow_dispatch:

   jobs:
     run-failing-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         # ... run synthetic failing spec (or use a consumer repo)
         # On failure, this job fails — we need the run ID

     # PROBLEM: repository_dispatch must be fired from a step. Use a separate job
     # that watches the first job fail, or run the test in a way we can capture run_id.

     fire-dispatch:
       needs: run-failing-test
       if: failure()
       # This job runs after run-failing-test fails
       steps:
         - name: Dispatch triage
           run: |
             gh api repos/${{ github.repository }}/dispatches -f event_type=triage-failed-test \
               -f "client_payload[workflow_run_id]=${{ needs.run-failing-test.outputs.run_id }}"
             # Note: needs.outputs requires run-failing-test to set outputs before failing
   ```

   **Simpler variant:** Use a consumer repo (e.g. lib-cypress-canary) with a `workflow_dispatch` job that:
   1. Checks out a branch with the synthetic broken spec
   2. Runs the spec (expecting failure)
   3. The existing `if: failure()` triage-dispatch step fires automatically
   4. A follow-up job uses `gh` to poll for the triage workflow run, then the fix branch, then the validation run
   5. Fails the workflow if any step doesn't complete within a timeout

2. **Polling logic** (in a separate job):
   - Poll for `triage-failed-tests` workflow run (event: repository_dispatch)
   - Poll for branch matching `fix/triage-agent/*`
   - Poll for `validate-fix` workflow run
   - Assert validation conclusion is `success`

### Pros

- Single workflow to “prove” the chain
- Can run as a scheduled or manual sanity check
- Good for CI/CD gates

### Cons

- Complex: needs `needs`, `if: failure()`, outputs from failing jobs
- Run ID from a failing job is tricky (job may not set outputs if it fails early)
- **Alternative:** Run the test in a reusable workflow, pass the parent run_id into the dispatch

### Chain Coverage

- Same as Approach 1, with the addition of automated orchestration

### Effort

- **Setup:** 4–8 hours (workflow design, polling, edge cases)
- **Repos:** adept-triage-agent or lib-cypress-canary, adept-common

---

## Approach 3: Extended Smoke Test Script + Real Failure

**Idea:** Extend `scripts/smoke-test-dispatch.sh` to support a “full chain” mode: dispatch with a recent real failure that has a preview URL, then verify triage → fix → validation.

### Implementation

1. **Update `smoke-test-dispatch.sh`:**
   - Add optional `FULL_CHAIN=1` mode
   - When enabled, use a known `workflow_run_id` that has:
     - Failed test with preview URL
     - Spec path and branch info
   - After triage completes, use `gh` to check for `auto_fix_applied` (from artifact or run logs) and for a `fix/triage-agent/*` branch
   - If validation is enabled, poll for `validate-fix` run and check conclusion

2. **Maintain a “golden” failure run:**
   - Periodically run a synthetic failure (Approach 1) and record the run_id
   - Store in the script or a small config file
   - Or: add a `--run-id` flag to pass any recent failure

3. **Verification steps:**
   ```bash
   # After triage completes
   gh api repos/adept-at/lib-cypress-canary/branches --jq '.[] | select(.name | startswith("fix/triage-agent")) | .name'
   gh run list --repo adept-at/lib-cypress-canary -w validate-fix.yml -L 5
   ```

### Pros

- Reuses existing smoke script
- Can be run from local machine with `gh` CLI
- No new workflows; works with current consumer setup

### Cons

- Golden run_id goes stale (artifacts may expire)
- Requires manual run or cron to keep “golden” failure fresh
- Does not create the failure; assumes one already exists

### Chain Coverage

- Dispatch → triage → (optionally) fix → validation
- Does not create the initial failure; relies on pre-existing run

### Effort

- **Setup:** 2–3 hours
- **Repos:** adept-triage-agent (script only), consumer repos unchanged

---

## Approach 4: `act` for Local Workflow Testing

**Idea:** Use [act](https://github.com/nektos/act) to run GitHub Actions locally and simulate `repository_dispatch`.

### Implementation

1. **Install act:** `brew install act` or from [releases](https://github.com/nektos/act/releases)

2. **Create an event file** for `repository_dispatch`:
   ```json
   {
     "action": null,
     "installation": { "id": 0 },
     "repository": { "full_name": "adept-at/lib-cypress-canary" },
     "client_payload": {
       "workflow_run_id": "12345678",
       "job_name": "cypress (demo.cy.ts)",
       "spec": "demo.cy.ts",
       "branch": "main",
       "commit_sha": "abc123",
       "repo_url": "adept-at/lib-cypress-canary",
       "preview_url": "https://preview.example.com"
     }
   }
   ```

3. **Run:**
   ```bash
   act repository_dispatch -e event.json -s CROSS_REPO_PAT -s OPENAI_API_KEY
   ```

4. **Limitations:**
   - Reusable workflows (`adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main`) are pulled from GitHub; act runs them in Docker
   - `adept-triage-agent` action runs in a container; needs Node, `node_modules`, etc.
   - Artifacts and logs for `workflow_run_id: 12345678` must exist in GitHub — act does not create them
   - Cross-repo actions (triage-dispatch, triage-slack-notify) require those repos to be accessible
   - Validation workflow would run locally in Docker; Sauce Labs/chrome in CI would not

### Pros

- Fast local iteration on workflow YAML
- No pushes required
- Useful for debugging workflow structure

### Cons

- Does not run the full chain: no real artifacts, no real fix applied to GitHub, validation runs in a local Docker env
- Reusable workflows and composite actions from other repos can be flaky with act
- Best for unit-level workflow testing, not full E2E

### Chain Coverage

| Step | Covered |
|------|---------|
| Test failure | ❌ |
| repository_dispatch | ⚠️ Simulated |
| Triage workflow | ⚠️ Partial (in Docker) |
| Agent analysis | ⚠️ If real run_id + secrets |
| Branch creation | ❌ (would hit real API) |
| Validation | ⚠️ Local Docker only |

### Effort

- **Setup:** 2–4 hours (event files, secrets, debugging act)
- **Repos:** Any consumer repo with workflows

---

## Approach 5: Dry-Run / Mocked Unit Tests

**Idea:** Expand `__tests__/integration/auto-repair-chain.integration.test.ts` to cover more of the chain with mocks. No real GitHub or OpenAI.

### Implementation

- Already covered: `FixApplier.applyFix`, `triggerValidation` (workflow_dispatch), confidence thresholds
- Add: Mock log processor returning canned `ErrorData`; mock analyzer returning `TEST_ISSUE` + fix recommendation; assert full `run()` flow up to `attemptAutoFix`
- Use `jest.mock` for Octokit, OpenAI, artifact fetcher

### Pros

- Fast, deterministic, no secrets
- Good for regression and refactors

### Cons

- Does not test real integration; mocks can hide real bugs
- No validation that the real chain works in production

### Chain Coverage

- Internal logic only; no real dispatch, no real validation

---

## Recommended Approaches (Ordered by Practicality)

### 1. Synthetic Failure + Manual Dispatch (Best for team demos)

- **Use for:** Live demos, proving the chain works end-to-end
- **Effort:** 2–4 hours
- **Repos:** lib-cypress-canary, adept-common
- **Steps:**
  1. Add `cypress/e2e/triage-demo.cy.ts` with a deliberate selector mismatch
  2. Ensure the workflow that runs it has triage-dispatch, ENABLE_AUTO_FIX, ENABLE_VALIDATION
  3. Verify adept-common triage workflow passes preview_url and spec to the agent
  4. Run the test (via PR or workflow_dispatch), let it fail
  5. Confirm dispatch fires (automatic or via script) and watch triage → fix → validate

### 2. Extended Smoke Script (Best for ongoing verification)

- **Use for:** Nightly or weekly sanity checks
- **Effort:** 2–3 hours
- **Repos:** adept-triage-agent
- **Steps:**
  1. Add `--full-chain` and `--run-id` to smoke-test-dispatch.sh
  2. After triage, check for fix branch and validate-fix run
  3. Optionally maintain a “golden” run_id from a recent synthetic failure

### 3. Orchestrated Integration Workflow (Best for CI gates)

- **Use for:** Automated “does the chain work?” checks
- **Effort:** 4–8 hours
- **Repos:** lib-cypress-canary or adept-triage-agent
- **Steps:**
  1. Add `e2e-triage-chain.yml` that runs synthetic spec, fires dispatch, polls for fix + validation
  2. Handle failing-job outputs carefully (e.g. run_id in artifact before failure)
  3. Run on schedule or manual

---

## Quick Reference: What Each Repo Needs for Full Chain

| Repo | Triage | Auto-fix | Validation |
|------|--------|----------|------------|
| lib-cypress-canary | ✅ | ✅ | ✅ (needs validate-fix.yml, preview_url) |
| lib-wdio-8-e2e-ts | ✅ | ✅ | ✅ |
| lib-wdio-8-multi-remote | ✅ | ✅ | ✅ |
| learn-webapp | ✅ | ❌ | N/A |

Validation requires: `validate-fix.yml` workflow (workflow_dispatch), `preview_url` in dispatch payload, `spec` in payload.
