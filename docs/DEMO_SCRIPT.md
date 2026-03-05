# Adept Triage Agent — Demo Script

> **Audience**: Engineering team
> **Duration**: ~15 minutes
> **Format**: Screen-share walkthrough

---

## INTRO (1 min)

**What to say:**

> "I'm going to walk you through the Adept Triage Agent — what it is, where it's installed, how it's wired up, and show you a real triage result from production. This is at v1.18.1 running on GPT-5.3 Codex."

**What to show:**
- Open the GitHub repo: `https://github.com/adept-at/adept-triage-agent`
- Point at the description: "AI-powered GitHub Action that automatically triages test failures"

---

## SECTION 1: The Problem We Solve (1 min)

**What to say:**

> "When an E2E test fails in CI, someone has to figure out: is this a real bug, or is the test flaky? That takes time. The triage agent does this automatically — it reads the logs, screenshots, and PR diff, sends it to GPT-5.3 Codex, and comes back with a verdict: TEST_ISSUE or PRODUCT_ISSUE, with a confidence score."

**What to show:**
- Show a Slack notification with a triage result (find one in `#learn-skillbuilder-cypress-tests` or similar)
- Point out: verdict, confidence %, summary, spec name, branch

---

## SECTION 2: Where It's Installed (2 min)

**What to say:**

> "The triage agent is a GitHub Action published on the marketplace. It's currently installed in 4 repositories."

**What to show:**
- Open the GitHub Marketplace page: `https://github.com/marketplace/actions/adept-triage-agent`
- Then show the 4 consumer repos (open each repo's Actions tab):

| Repo | What it tests |
|------|---------------|
| `lib-cypress-canary` | Cypress E2E — skills, lexical editor, preview URLs |
| `lib-wdio-8-e2e-ts` | WebDriverIO — labs, bastion, search, enrollments |
| `learn-webapp` | Cypress — SauceLabs preview URL tests |
| `lib-wdio-8-multi-remote` | WebDriverIO — multi-remote browser tests |

---

## SECTION 3: How It's Wired Up (3 min)

**What to say:**

> "There's a two-workflow architecture. The test workflow runs your tests, and if a job fails, it dispatches an event. A separate triage workflow picks that up, waits for the test run to finish, then calls the triage agent."

**What to show — Step by step:**

### 3a. The Dispatch Trigger (test workflow)

- Open any test workflow, e.g. `lib-cypress-canary/.github/workflows/skillbuilder.on.deploy.to.prod.yml`
- Scroll to the `Trigger triage analysis` step (runs `if: failure()`)
- Highlight the `createDispatchEvent` call and the `client_payload`:

```
event_type: 'triage-failed-test'
client_payload: {
  workflow_run_id, job_name, spec,
  repository, repo_url, branch,
  commit_sha, pr_number, preview_url
}
```

### 3b. The Triage Workflow (receives the dispatch)

- Open `lib-cypress-canary/.github/workflows/triage-failed-tests.yml`
- Walk through the steps:
  1. **Validate inputs** — prints the payload, fails fast if `workflow_run_id` missing
  2. **Wait for workflow** — polls `getWorkflowRun` until status = completed
  3. **Run triage analysis** — `uses: adept-at/adept-triage-agent@v1` with all inputs
  4. **Save artifact** — writes `triage.json` for later reference
  5. **Slack notify** — uses `adept-common/triage-slack-notify@main`

### 3c. Secrets Required

- Open repo Settings → Secrets → Actions
- Show the required secrets:
  - `OPENAI_API_KEY` — for the AI analysis
  - `CROSS_REPO_PAT` — only needed when the action must read diffs or write fixes in a different repository

---

## SECTION 4: What Happens Inside the Agent (3 min)

**What to say:**

> "Let me show you the actual pipeline inside the agent."

**What to show:**
- Open `docs/agent-workflow-flowchart.md` in GitHub (renders the Mermaid diagrams)
- Walk through the **Main Triage Pipeline** diagram:

> "First it collects data — workflow logs, screenshots, uploaded test artifacts, and the PR or branch diff if there is one. Then it builds a structured prompt and sends everything to GPT-5.3 Codex via the Responses API. The model returns a JSON verdict."

- Highlight the key decision points:
  - **TEST_ISSUE** → generates a fix recommendation
  - **PRODUCT_ISSUE** → suggests source locations
  - **INCONCLUSIVE** → confidence below threshold

- Briefly show the **Multi-Agent Orchestration Pipeline** diagram:

> "For higher-quality fixes, there's an optional 5-agent pipeline: Analysis, Code Reading, Investigation, Fix Generation, and Review. They iterate up to 3 times. This is opt-in via `ENABLE_AGENTIC_REPAIR`."

---

## SECTION 5: Live Example — Real Triage Result (3 min)

**What to say:**

> "Let me show you a real triage result from production."

**What to show:**
- Open a recent successful triage run in GitHub Actions:
  `https://github.com/adept-at/lib-cypress-canary/actions/runs/22647644752`
- Expand the **Run triage analysis** step log — show:
  - The inputs being passed
  - The analysis running
  - The verdict output (TEST_ISSUE or PRODUCT_ISSUE)
  - Confidence score
  - Summary text
- Then show the **Slack notification** that was sent
- If there's a triage artifact, download it and show the JSON:
  - `verdict`, `confidence`, `reasoning`, `indicators`

---

## SECTION 6: Auto-Fix & Validation (1 min)

**What to say:**

> "When the verdict is TEST_ISSUE and confidence is high enough, the agent can automatically create a fix branch. It reads the test code, generates a patch, and pushes it. If validation is enabled, it triggers a workflow to re-run the specific test against the fix branch. The action itself reports validation as pending or skipped. Any pass/fail handling, cleanup, or PR creation happens in downstream workflow automation."

**What to show:**
- Point to the auto-fix inputs in the triage workflow:
  - `ENABLE_AUTO_FIX: 'true'`
  - `AUTO_FIX_BASE_BRANCH: 'main'`
  - `AUTO_FIX_MIN_CONFIDENCE: '70'`
  - `ENABLE_VALIDATION: 'true'`

---

## SECTION 7: Recent Improvements (1 min)

**What to say:**

> "We recently shipped several improvements:"

- **Model upgrade**: `gpt-5.2-codex` → `gpt-5.3-codex` — ~25% faster responses
- **Dead code cleanup**: removed unused functions, consolidated types, cleaner codebase
- **Summary fix**: fixed a bug where AI summaries were getting truncated on dotted method names like `cy.wait()`
- **Centralized config**: all AI model settings in one place (`src/config/constants.ts`)
- **Shared Slack action**: standardized notifications via `adept-common/triage-slack-notify`
- **Secret management**: bulk update script for rotating PATs across all consumer repos

---

## WRAP-UP (30 sec)

**What to say:**

> "To recap: the triage agent runs automatically whenever a test fails in any of our 4 E2E repos. It analyzes the failure using GPT-5.3 Codex with full context — logs, screenshots, and code diffs — and tells us whether it's a test issue or a product bug. It can even auto-fix test issues and trigger validation. Results are posted after the test workflow completes and the triage workflow runs."

**What to show:**
- The Repository Integration Map diagram from `docs/agent-workflow-flowchart.md`

---

## APPENDIX: Quick Reference

### Key URLs

| Resource | URL |
|----------|-----|
| Triage Agent Repo | `https://github.com/adept-at/adept-triage-agent` |
| GitHub Marketplace | `https://github.com/marketplace/actions/adept-triage-agent` |
| lib-cypress-canary Triage Runs | `https://github.com/adept-at/lib-cypress-canary/actions/workflows/triage-failed-tests.yml` |
| lib-wdio-8-e2e-ts Triage Runs | `https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/workflows/triage-failed-tests.yml` |
| Slack Channel | `#learn-skillbuilder-cypress-tests` |

### Architecture at a Glance

```
Test fails in CI
  → dispatch event (triage-failed-test)
    → triage workflow starts
      → waits for test workflow to complete
        → adept-triage-agent@v1 runs
          → collects: logs + screenshots + PR diff
          → sends to GPT-5.3 Codex
          → returns: verdict + confidence + reasoning
            → Slack notification via adept-common
            → (optional) auto-fix branch + validation
```

### Version History

| Version | Date | Highlights |
|---------|------|------------|
| v1.18.1 | 2026-03-04 | Upgrade to gpt-5.3-codex |
| v1.18.0 | 2026-03-03 | Dead code cleanup, summary truncation fix |
| v1.17.7 | 2026-02-26 | Previous stable release |
