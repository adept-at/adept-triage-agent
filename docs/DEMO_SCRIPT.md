# Adept Triage Agent — Demo Script

> **Audience**: Engineering team
> **Duration**: ~20 minutes
> **Format**: Screen-share walkthrough with live code navigation
> **Version**: v1.21.0

---

## INTRO (1 min)

**What to say:**

> "I'm going to walk you through the Adept Triage Agent — what it does, how the multi-agent orchestration works under the hood, where to find everything in the code, and show you a real improvement we just shipped that catches a class of reasoning bugs. This is v1.21.0 running on GPT-5.3 Codex."

**What to show:**
- Open the GitHub repo: `https://github.com/adept-at/adept-triage-agent`

---

## SECTION 1: The Problem We Solve (2 min)

**What to say:**

> "When an E2E test fails in CI, someone has to figure out: is this a real product bug, a flaky test, or an infrastructure hiccup? That takes time and context-switching. The triage agent does this automatically. It reads the CI logs, failure screenshots, uploaded test artifacts, and the PR diff — sends it all to GPT-5.3 Codex — and comes back with a structured verdict."

**What to show:**
- Show a Slack notification with a triage result
- Point out: verdict emoji, confidence %, summary line, test name, branch name
- Highlight the three possible verdicts:
  - **TEST_ISSUE** — problem in test code (flaky selector, timing, environment)
  - **PRODUCT_ISSUE** — real bug in the app (500 error, null reference, broken rendering)
  - **INCONCLUSIVE** — infrastructure failure (browser crash, session timeout)

---

## SECTION 2: Where It's Installed (1 min)

**What to say:**

> "The triage agent is a GitHub Action. It's currently installed in 4 repositories across two test frameworks."

**What to show:**

| Repo | Framework | What it tests |
|------|-----------|---------------|
| `lib-cypress-canary` | Cypress | Skills, lexical editor, preview URLs |
| `lib-wdio-8-e2e-ts` | WebDriverIO | Labs, bastion, search, enrollments |
| `learn-webapp` | Cypress | SauceLabs preview URL tests |
| `lib-wdio-8-multi-remote` | WebDriverIO | Multi-remote browser tests |

---

## SECTION 3: How It's Wired Up (3 min)

**What to say:**

> "There's a two-workflow architecture. The test workflow runs your tests. If a job fails, it dispatches an event. A separate triage workflow receives that event, waits for the test run to finish, then runs the triage agent."

**What to show — walk through the code:**

### 3a. The Dispatch Trigger (test workflow)

- Open any consumer repo test workflow (e.g., `lib-cypress-canary`)
- Find the `Trigger triage analysis` step (runs `if: failure()`)
- Show that we now standardize on the shared dispatch action:
  ```
  uses: adept-at/adept-common/.github/actions/triage-dispatch@main
  ```
- Show the dispatch payload it sends:
  ```
  event_type: 'triage-failed-test'
  client_payload: { workflow_run_id, job_name, spec, repository, branch, commit_sha, pr_number }
  ```
- All four repos now use the shared dispatch action and shared reusable triage workflow. `learn-webapp` passes `GITHUB_TOKEN` as `CROSS_REPO_PAT` since tests and source live in the same repo; the other three use a PAT for cross-repo access.

### 3b. The Triage Workflow (receives the dispatch)

Walk through the steps:
1. **Validate inputs** — prints payload, fails fast if `workflow_run_id` missing
2. **Wait for workflow** — polls `getWorkflowRun` until `status: completed`
3. **Run triage analysis** — `uses: adept-at/adept-triage-agent@v1`
4. **Save artifact** — writes `triage.json` for later reference
5. **Slack notify** — uses `adept-at/adept-common/.github/actions/triage-slack-notify@main`

All four consumer repos now use the shared reusable triage workflow: `adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main`.

### 3c. Secrets Required

- `OPENAI_API_KEY` — for the AI analysis
- `CROSS_REPO_PAT` — only needed for cross-repo diff or fix writes

---

## SECTION 4: The Entry Point — Walking Through the Code (3 min)

**What to say:**

> "Let me show you what actually happens when the action runs. Everything starts in `src/index.ts`."

**What to show — open each file as you talk:**

### Entry: `src/index.ts` → `run()`

> "The `run()` function is the main orchestrator. It parses inputs, initializes three clients — Octokit for GitHub, OpenAIClient for GPT, and ArtifactFetcher for screenshots/logs — then kicks off the pipeline."

Key flow:
```
run()
  → getInputs()
  → processWorkflowLogs() → ErrorData | null
  → analyzeFailure() → AnalysisResult (verdict + confidence + reasoning)
  → [if TEST_ISSUE] generateFixRecommendation()
  → [if auto-fix enabled] attemptAutoFix()
  → setSuccessOutput()
```

### Data Collection: `src/services/log-processor.ts` → `processWorkflowLogs()`

> "This is where we gather all the evidence. It downloads the CI job logs, extracts the error, then fetches everything in parallel — screenshots, uploaded test artifacts, and the PR diff."

Show:
- `fetchArtifactsParallel()` — three concurrent fetches
- `fetchDiffWithFallback()` — tries PR diff → branch diff → commit diff
- The resulting `ErrorData` object (show the type in `src/types.ts`)

### Analysis: `src/simplified-analyzer.ts` → `analyzeFailure()`

> "The analyzer first checks for infrastructure failures — browser crashes, session timeouts — those short-circuit to INCONCLUSIVE without calling the model. Otherwise, it builds a prompt with all the evidence and sends it to GPT-5.3 Codex."

Show:
- `detectInfrastructureFailure()` — the regex patterns
- `FEW_SHOT_EXAMPLES` array — the 9 examples that guide the model
- `calculateConfidence()` — the scoring formula

### The Prompt: `src/openai-client.ts` → `getSystemPrompt()`

> "This is the main system prompt. It tells the model how to classify failures, what screenshots to look for, and — this is new in v1.21.0 — it has a **Causal Consistency Rule** that prevents the model from fabricating theories that contradict the PR diff."

Show:
- The verdict classification rules (TEST_ISSUE / PRODUCT_ISSUE / INCONCLUSIVE indicators)
- The screenshot analysis instructions
- **The new CAUSAL CONSISTENCY RULE block** (line ~266)
- `formatPRDiffSection()` and the new **CAUSAL CONSISTENCY CHECK** block

---

## SECTION 5: The Multi-Agent Pipeline (4 min)

**What to say:**

> "For higher-quality fixes, there's an optional 5-agent pipeline that replaces the single-shot repair. Each agent is a specialist. Let me walk you through all five."

**What to show:**

### The Orchestrator: `src/agents/agent-orchestrator.ts`

> "The orchestrator coordinates the agents in sequence: Analysis → Code Reading → Investigation → Fix Generation ↔ Review. The fix/review loop runs up to 3 times. If review rejects a fix, the feedback is sent back to the fix generator."

Show `orchestrate()` method — the step-by-step flow.

### Agent 1 — AnalysisAgent: `src/agents/analysis-agent.ts`

> "Classifies the root cause into categories like SELECTOR_MISMATCH, TIMING_ISSUE, ENVIRONMENT_ISSUE. It reads the error, logs, screenshots, and PR diff, then outputs a structured analysis."

Show: `getSystemPrompt()` — the root cause categories, `buildUserPrompt()` — how PR diff is included.

### Agent 2 — CodeReadingAgent: `src/agents/code-reading-agent.ts`

> "This one is **not an LLM call** — it's deterministic. It fetches the actual test file from GitHub, parses imports to find helper files and page objects, and collects all the source context the later agents need."

Show: `execute()` — the GitHub API file fetch logic.

### Agent 3 — InvestigationAgent: `src/agents/investigation-agent.ts`

> "Takes the analysis plus the source code, and does a deep investigation. It determines if the test code is fixable, identifies specific selectors to update, and recommends an approach."

Show: output interface — `isTestCodeFixable`, `selectorsToUpdate`, `recommendedApproach`.

### Agent 4 — FixGenerationAgent: `src/agents/fix-generation-agent.ts`

> "Generates exact code changes — oldCode/newCode pairs that can be applied as find-and-replace. It gets the analysis, investigation, source file content, and PR diff. New in v1.21.0 — the PR Diff Consistency rule prevents it from generating fixes based on theories the diff doesn't support."

Show: `getSystemPrompt()` — the **PR DIFF CONSISTENCY** section at the end.

### Agent 5 — ReviewAgent: `src/agents/review-agent.ts`

> "The quality gate. Reviews every proposed fix before it ships. Checks that oldCode actually matches the source file, that newCode is syntactically valid, and — new in v1.21.0 — that the fix reasoning doesn't contradict the PR diff. Any CRITICAL issue means rejection."

Show:
- The CRITICAL issues list — including the new diff-contradiction criterion
- The review instruction #6 about verifying diff consistency

---

## SECTION 6: The v1.21.0 Story — Causal Consistency (3 min)

**What to say:**

> "Let me tell you about a real failure that exposed a reasoning bug. This is why v1.21.0 exists."

### The Incident

> "A Cypress test in learn-webapp failed because `#password` wasn't found during a login hook. The PR only changed LMS rendering code — LessonRenderer, content-parser, a new ContentFallback component. Zero auth changes."

### What the Agent Did Wrong (pre-v1.21.0)

> "The agent saw the screenshot showing an email-only login page, saw a network call to `loginWithEmail`, and concluded: 'The login UI was changed to a passwordless flow.' Then it generated a fix to rewrite the login command to support 'both auth UIs.' 92% confidence."

> "The problem? It had the PR diff right there showing NO auth changes. It fabricated a theory, then cherry-picked normal network traffic as evidence — classic confirmation bias."

### The Fix

> "We added Causal Consistency Rules to all four prompt layers."

**What to show:**

1. **`src/openai-client.ts`** — Show the CAUSAL CONSISTENCY RULE (main analysis)
2. **`src/openai-client.ts`** — Show the CAUSAL CONSISTENCY CHECK (in `formatPRDiffSection`)
3. **`src/agents/fix-generation-agent.ts`** — Show the PR DIFF CONSISTENCY section
4. **`src/agents/review-agent.ts`** — Show the new CRITICAL criterion and review instruction #6

### The Proof

> "We wrote an integration test that hits the real model with the exact same scenario — login failure, unrelated PR diff. It verifies three things:"

**What to show:** Open `__tests__/integration/causal-consistency.integration.test.ts`

1. **analyzeFailure**: The model now says "PR only changes lesson content rendering — login failure is unrelated to this PR"
2. **FixGenerationAgent**: Generates a fix addressing selector brittleness, NOT a phantom "passwordless UI change"
3. **ReviewAgent**: When fed the old bad fix, rejects it with a CRITICAL issue: "Fix reasoning is inconsistent with the provided PR diff"

---

## SECTION 7: Auto-Fix & Validation (1 min)

**What to say:**

> "When the verdict is TEST_ISSUE and confidence is high enough, the agent can create a fix branch automatically. It reads the test code, generates a patch, and pushes it via the GitHub API. If validation is enabled, it triggers a workflow to re-run the specific test."

**What to show:**
- The auto-fix inputs in a triage workflow
- `src/repair/fix-applier.ts` — `applyFix()` method

---

## WRAP-UP (1 min)

**What to say:**

> "To recap: the triage agent runs automatically whenever a test fails in any of our E2E repos. It gathers logs, screenshots, and code diffs, analyzes the failure using GPT-5.3 Codex, and returns a structured verdict. For test issues, it can generate and auto-apply fixes through a 5-agent pipeline with built-in review. And as of v1.21.0, every agent cross-references its reasoning against the PR diff to prevent fabricated theories."

**What to show:**
- Open `docs/agent-workflow-flowchart.md` in GitHub — the Mermaid diagrams render inline
- Show the **Causal Consistency** diagram as the closing visual

---

## APPENDIX: Quick Reference

### Source File Map

| Component | File | Key Functions |
|-----------|------|---------------|
| Entry point | `src/index.ts` | `run()`, `getInputs()`, `generateFixRecommendation()` |
| Log processing | `src/services/log-processor.ts` | `processWorkflowLogs()`, `fetchDiffWithFallback()` |
| Error extraction | `src/simplified-analyzer.ts` | `analyzeFailure()`, `extractErrorFromLogs()` |
| OpenAI prompts | `src/openai-client.ts` | `getSystemPrompt()`, `buildPrompt()`, `formatPRDiffSection()` |
| Orchestrator | `src/agents/agent-orchestrator.ts` | `orchestrate()`, `runPipeline()` |
| Analysis agent | `src/agents/analysis-agent.ts` | `execute()`, `getSystemPrompt()` |
| Code reader | `src/agents/code-reading-agent.ts` | `execute()` (no LLM) |
| Investigation | `src/agents/investigation-agent.ts` | `execute()`, `getSystemPrompt()` |
| Fix generator | `src/agents/fix-generation-agent.ts` | `execute()`, `getSystemPrompt()` |
| Reviewer | `src/agents/review-agent.ts` | `execute()`, `getSystemPrompt()` |
| Base agent | `src/agents/base-agent.ts` | `createAgentContext()`, `executeWithTimeout()` |
| Repair agent | `src/repair/simplified-repair-agent.ts` | `generateFixRecommendation()`, `tryAgenticRepair()` |
| Fix applier | `src/repair/fix-applier.ts` | `canApply()`, `applyFix()` |
| Artifacts | `src/artifact-fetcher.ts` | `fetchScreenshots()`, `fetchPRDiff()` |
| Config | `src/config/constants.ts` | `OPENAI`, `CONFIDENCE`, `AGENT_CONFIG` |
| Types | `src/types.ts` | `ErrorData`, `AnalysisResult`, `FixRecommendation`, `PRDiff` |

### Key URLs

| Resource | URL |
|----------|-----|
| Triage Agent Repo | `https://github.com/adept-at/adept-triage-agent` |
| GitHub Marketplace | `https://github.com/marketplace/actions/adept-triage-agent` |
| lib-cypress-canary Triage Runs | `https://github.com/adept-at/lib-cypress-canary/actions/workflows/triage-failed-tests.yml` |
| lib-wdio-8-e2e-ts Triage Runs | `https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/workflows/triage-failed-tests.yml` |
| Slack Channel | `#learn-skillbuilder-cypress-tests` |

### Version History

| Version | Date | Highlights |
|---------|------|------------|
| v1.21.0 | 2026-03-10 | Causal consistency — PR diff cross-reference in all agent prompts |
| v1.20.0 | 2026-03-09 | INCONCLUSIVE verdict for infrastructure/session failures |
| v1.19.0 | 2026-03-07 | Cross-repo diff fix, NO_FAILURE verdict, validation URL alignment |
| v1.18.1 | 2026-03-04 | Upgrade to gpt-5.3-codex (~25% faster) |
| v1.18.0 | 2026-03-03 | Dead code cleanup, summary truncation fix |
