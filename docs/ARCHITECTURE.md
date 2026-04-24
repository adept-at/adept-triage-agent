# Adept Triage Agent — Architecture

> **Current version:** v1.52.0
> **Scope:** end-to-end architecture of the agent — entry point, pipeline, five-agent orchestration, skill-memory / repo-context learning loop, observability, operator surface.
> **Audience:** engineers who need to understand the system deeply enough to extend or debug it without surprises.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Repository contexts](#repository-contexts)
3. [Runtime entry point](#runtime-entry-point)
4. [Pipeline — coordinator + validator](#pipeline--coordinator--validator)
5. [The five agents](#the-five-agents)
6. [Prompt composition](#prompt-composition)
7. [Repair path — agentic only](#repair-path--agentic-only)
8. [Learning loop — skill store + repo context + seeds](#learning-loop--skill-store--repo-context--seeds)
9. [Validation paths — local vs remote](#validation-paths--local-vs-remote)
10. [Outputs, verdicts, and error contracts](#outputs-verdicts-and-error-contracts)
11. [Observability](#observability)
12. [Configuration defaults](#configuration-defaults)
13. [Invariants that must hold](#invariants-that-must-hold)

---

## What it does

The Adept Triage Agent is a Node 24 GitHub Action (`action.yml` → `dist/index.js` via ncc) that runs on a test-failure signal, classifies the failure as `TEST_ISSUE` or `PRODUCT_ISSUE`, and when appropriate proposes + validates + ships a fix to the test code. It learns across runs via a DynamoDB-backed skill store and a per-repo conventions file.

### Key features

- **Classification** — OpenAI-powered verdict (`TEST_ISSUE`, `PRODUCT_ISSUE`, `INCONCLUSIVE`, `PENDING`, `ERROR`, `NO_FAILURE`) with 0–100 confidence.
- **Multi-agent repair** — five agents (analysis, code-reading, investigation, fix-gen, review) collaborate in an orchestrator with an internal fix/review loop. If agentic repair cannot produce an approved fix, the run fails honestly with no weaker fallback path.
- **Local-validation loop** — clones the target repo, applies fixes on disk, runs the test command up to 3 iterations, and only pushes a branch + opens a PR after the test passes.
- **Learning loop** — skills (canonical fix patterns for a spec + error shape) are persisted to DynamoDB, retrieved by relevance, and rendered into agent prompts. Human-curated seed skills bootstrap the store.
- **Repo conventions** — each consumer repo can commit a `.adept-triage/context.md` describing its selector strategy, wait rules, auth flow, etc. For product repos where tooling files are unwelcome, the context is bundled in the agent itself.
- **Chronic flakiness gate** — specs that have been auto-fixed repeatedly in a window are flagged and auto-fix is skipped; the failure is surfaced for human follow-up.

### Version milestones that shape the current design

| Version | Change |
|---|---|
| v1.37.0 | DynamoDB skill store (replaces git-branch storage). |
| v1.43.0 | Memory hardening — atomic counters, deterministic retrieval, prune protection. |
| v1.44.0 | `SkillStore` collapsed to a single DynamoDB-backed class; git fallback removed. |
| v1.48.1 | `failureModeTrace` on `FixRecommendation` + blast-radius confidence scaling. |
| v1.49.1 | `failureModeTrace` persisted to skills; outer-loop staleness bugs fixed. |
| v1.49.2 | Prompt-injection hardening in `sanitizeForPrompt`; trace-rendering gate. |
| v1.49.3 | Telemetry (`skill-telemetry role=...`), retired-inclusion fix in `detectFlakiness`, `sanitizeForPrompt` accepts `unknown`. |
| v1.50.0 | Per-run telemetry summary; `testName` + `prUrl` surfaced in prompts. |
| v1.50.1 | Multi-pass baseline check (3 consecutive passes). |
| v1.51.0 | Fix-gen + review upgraded to `gpt-5.4` xhigh reasoning; agent timeout bumped to 300s. |
| v1.51.1 | Extraction-quality hardening (causal vs background rule, reject URL file-attribution). |
| **v1.52.0** | **Repo context (bundled + remote)**; **seed skills with `isSeed` pruning protection**; **`normalizeSpec` on write and read** so seeds written with relative paths match runtime absolute paths. |

---

## Repository contexts

The action operates across up to three GitHub repository contexts. Understanding which is which is mandatory for getting auth right.

| Context | What it is | Read surface |
|---|---|---|
| `github.context.repo` | Repo where the triage **workflow** runs. | Workflow runs, job logs, screenshots, uploaded test artifacts. **Always.** |
| `REPOSITORY` (input, default `github.repository`) | Test / app repo for PR / branch / commit **diff lookup**. | PR diffs, commit diffs. |
| `AUTO_FIX_TARGET_REPO` (input, default `github.repository`) | Repo where repair **source files** are fetched and fix **branches** are created. | Source files (via `getContent`), commits, branches, PRs. |

The product repo is a fourth context read-only:

| Context | Default |
|---|---|
| `PRODUCT_REPO` (input) | `adept-at/learn-webapp` — recent commit diff is fetched for classification context so the agent can distinguish "test is broken" from "test is correctly catching a product regression." |

PATs are needed whenever `REPOSITORY` or `AUTO_FIX_TARGET_REPO` differs from `github.context.repo`. See `README_CROSS_REPO_PR.md` for the auth matrix.

---

## Runtime entry point

`src/index.ts` → `run()` does exactly this sequence (`src/index.ts:13-41`):

1. **`getInputs()`** — parses `ActionInputs` from `core.getInput` + `process.env`. Booleans are strict `=== 'true'`; any other string is `false`.
2. **`new Octokit({ auth: inputs.githubToken })`**.
3. **`resolveRepository(inputs)`** → `{ owner, repo }` via `parseRepoString`; falls back to `github.context.repo` on invalid/missing `REPOSITORY`.
4. **`new OpenAIClient(inputs.openaiApiKey)`**.
5. **`new ArtifactFetcher(octokit)`**.
6. **`new PipelineCoordinator({ octokit, openaiClient, artifactFetcher, inputs, repoDetails })`**.
7. **`await coordinator.execute()`** — all GH Action outputs are set from inside the coordinator (`setSuccessOutput` / `setInconclusiveOutput` / `setErrorOutput` in `src/pipeline/output.ts`).

The only output set directly in `index.ts` is a top-level `catch` that builds an `ERROR` verdict + `core.setFailed(...)` for anything that escapes the coordinator's own error handling. The `require.main === module` trailer catches fatal unhandled errors outside the try/catch.

---

## Pipeline — coordinator + validator

### `PipelineCoordinator` (`src/pipeline/coordinator.ts`)

One class, five methods worth knowing:

- **`execute()`** — Top-level. Runs log processing, constructs `SkillStore` if AWS creds are ambient, then wraps `runClassifyAndRepair()` in `try { ... } finally { skillStore?.logRunSummary() }`. The `finally` guarantees a per-run summary line at every exit (including thrown errors).
- **`runClassifyAndRepair()`** *(private)* — The decision tree:
  1. `classify()` → returns `ClassificationResult`.
  2. If `classification.confidence < confidenceThreshold` → `setInconclusiveOutput` and return (classify handles this internally).
  3. If `verdict !== 'TEST_ISSUE'` → `setSuccessOutput` with the verdict and return.
  4. **Chronic flakiness gate**: if `skillStore.detectFlakiness(spec)` returns `fixCount >= CHRONIC_FLAKINESS_THRESHOLD` (default `3`), skip repair entirely, set `autoFixSkipped=true` with a human-readable reason, and return. This is how we stop stacking fallback fixes on truly broken specs.
  5. `repair()` → returns `RepairResult`.
  6. Save a skill if a fix was attempted AND `skillStore` and `autoFixTargetRepo` are both resolved, using `buildSkill()` with the agent-reported root cause and investigation findings.
  7. `setSuccessOutput` with the combined result.
- **`classify()`** — Reads classifier-relevant skills (`findForClassifier`), renders them into the classifier context, calls `analyzeFailure()`, handles low-confidence / non-`TEST_ISSUE` early exits.
- **`repair()`** — Resolves auto-fix target, fetches repo context (via `RepoContextFetcher`), branches on local-validation availability:
  - **Local path** (all of `enableAutoFix`, `enableValidation`, `enableLocalValidation`, `validationTestCommand`, `autoFixTargetRepo` true) → `iterativeFixValidateLoop`.
  - **Otherwise** → `generateFixRecommendation` + optional `attemptAutoFix`.
- **`handleNoErrorData()`** — Runs when log processing yields nothing. Classifies as `NO_FAILURE` (green run), `PENDING` (still in progress), or `ERROR` (cannot determine).

### `iterativeFixValidateLoop` (`src/pipeline/validator.ts`)

The local-validation loop. Maximum `FIX_VALIDATE_LOOP.MAX_ITERATIONS = 3`. For each iteration:

1. `generateFixRecommendation(...)` — builds a `RepairContext`, spins up `SimplifiedRepairAgent` with model overrides, calls `repairAgent.generateFixRecommendation(...)`. Returns `{ fix, agentRootCause, agentInvestigationFindings, lastResponseId }` or `null`.
2. If `null` or no `proposedChanges` → break.
3. **Blast-radius gate** (`requiredConfidence` in `src/pipeline/validator.ts`):
   - `+10` to the required confidence if any changed path touches shared code (`/pageobjects/`, `/helpers/`, `/commands/`, ...).
   - `+5` if 2+ files changed.
   - Capped at `max(baseMin, 95)` — explicit user floor is never lowered.
   - If the scaled threshold blocks the fix **because scaling kicked in** (not because confidence was just below the base threshold), set `autoFixSkipped=true` with the reasons; otherwise break silently.
4. **Duplicate-fix fingerprint**: if this fix has the same `fixFingerprint(...)` as a previously failed fix in this loop, break. Prevents infinite retry-same-attempt loops.
5. **First iteration only**: `validator.setup()` — clones the target repo, `npm ci`/`install`, optional Cypress binary cache. Then **`baselineCheck()`** — runs the test **3 consecutive times** without any fix applied. If all 3 pass, conclude the original failure was transient and return `{ fixRecommendation: null, autoFixResult: null, iterations: 0 }`. If any pass fails, short-circuit (it's a real failure).
6. `applyFix` (on-disk patch), `runTest`.
7. **On pass**: `pushAndCreatePR` (create branch, commit, push, open PR). Return with `autoFixResult.success = true`. Push-failure edge case: fix passed locally but push failed → return with `success=false` + `validationStatus=passed` (so operators can tell "the fix works, GitHub just rejected the push" apart from a real failure).
8. **On fail**: add fingerprint to failed set, `validator.reset()` (git clean), build `previousAttempt` for next iteration with the failed fix diff + sanitized validation logs + prior agent reasoning. Loop.
9. **After the loop**: `validator.cleanup()` always runs (`try { ... } finally { ... }`).

### `ClassificationResult` vs `RepairResult`

```ts
interface ClassificationResult {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  summary?: string;
  indicators?: string[];
  suggestedSourceLocations?: Array<{ file: string; lines: string; reason: string }>;
  responseId?: string;              // for OpenAI Responses API chaining
  fixRecommendation?: FixRecommendation;
  classifierSkillIds?: string[];    // surfaced skills — written for future "classification outcome" feedback loop
}

interface RepairResult {
  fixRecommendation: FixRecommendation | null;
  autoFixResult: ApplyResult | null;
  investigationContext?: string;
  iterations: number;
  prUrl?: string;
  agentRootCause?: string;
  agentInvestigationFindings?: string;
  autoFixSkipped?: boolean;
  autoFixSkippedReason?: string;
}
```

---

## The five agents

All live under `src/agents/`. All except `CodeReadingAgent` extend `BaseAgent` and make a single `generateWithCustomPrompt` call per `execute()`. The orchestrator runs them in a fixed order; the fix/review pair iterates.

### Analysis agent — `analysis-agent.ts`

**One-liner**: classify the failure into a whitelisted `rootCauseCategory`, `issueLocation`, patterns, selectors, and confidence.

- **Input**: `AnalysisInput = { additionalContext?: string }` — orchestrator passes `{}`.
- **Output**: `AnalysisOutput`:
  - `rootCauseCategory`: whitelisted `SELECTOR_MISMATCH | TIMING_ISSUE | STATE_DEPENDENCY | NETWORK_ISSUE | ELEMENT_VISIBILITY | ASSERTION_MISMATCH | DATA_DEPENDENCY | ENVIRONMENT_ISSUE | UNKNOWN`.
  - `issueLocation`: `TEST_CODE | APP_CODE | BOTH | UNKNOWN`.
  - `contributingFactors`, `explanation`, `selectors`, `elements`, `patterns` (7 booleans), `suggestedApproach`, `confidence`.
  - Parse-time whitelist enforcement — a malicious or drifting model response can't land an arbitrary string on `rootCauseCategory`.
- **Downstream**: `selectors` → code reading; full output → investigation, fix-gen, review. `analysis.confidence` gates the investigation-chain behavior (below).
- **Rejects / overrides**: none inside the agent; the orchestrator applies the investigation's `verdictOverride` gate later.

### Code reading agent — `code-reading-agent.ts`

**One-liner**: deterministically fetch the test file + related support / page objects / commands / PR diff files from GitHub. **No LLM.** (`getSystemPrompt()` returns `''`.)

- **Input**: `{ testFile, errorSelectors?, additionalFiles? }`.
- **Output**: `CodeReadingOutput = { testFileContent, relatedFiles[], customCommands[], pageObjects[], summary }`.
- On a successful read, the orchestrator populates `AgentContext.sourceFileContent` (line-numbered), `AgentContext.relatedFiles`, and stashes raw content for `autoCorrectOldCode`.
- Returns `success: false` if the test file can't be fetched — the orchestrator short-circuits the run.

### Investigation agent — `investigation-agent.ts`

**One-liner**: cross-reference analysis with actual code + diffs, produce structured findings, `recommendedApproach`, `selectorsToUpdate`, `isTestCodeFixable`, optional `verdictOverride`.

- **Input**: `{ analysis: AnalysisOutput, codeContext?: CodeReadingOutput }`.
- **Output**: `InvestigationOutput`:
  - `findings[]`: each has whitelisted `type` (`SELECTOR_DRIFT | TIMING_RACE | STATE_ISSUE | CODE_CHANGE | OTHER`) and `severity` (`HIGH | MEDIUM | LOW`).
  - `primaryFinding?`, `isTestCodeFixable`, `recommendedApproach`, `selectorsToUpdate[]`, `confidence`.
  - `verdictOverride?` — `{ suggestedLocation: 'TEST_CODE' | 'APP_CODE' | 'BOTH', confidence, evidence[] }`. Parse-time whitelist; invalid locations cause the entire `verdictOverride` to be dropped.
- **Verdict override gates** (applied in orchestrator immediately after investigation runs):
  - If `verdictOverride.suggestedLocation === 'APP_CODE'` **and** `verdictOverride.confidence >= analysis.confidence` → abort repair. The agent trusted investigation over analysis.
  - If `!isTestCodeFixable && !verdictOverride` → abort repair. The agent concluded the failure is not test-fixable.
- **Framework-aware prompt**: WebdriverIO shows `browser.*` command prefix; Cypress shows `cy.*`.

### Fix generation agent — `fix-generation-agent.ts`

**One-liner**: produce `changes[]` with concrete `oldCode` / `newCode` / `changeType`, plus the causal trace and confidence.

- **Input**: `{ analysis, investigation, previousFeedback? }`.
- **Output**: `FixGenerationOutput`:
  - `changes[]`: each `CodeChange` has whitelisted `changeType` (`SELECTOR_UPDATE | WAIT_ADDITION | LOGIC_CHANGE | ASSERTION_UPDATE | OTHER`).
  - `confidence`, `summary`, `reasoning`, `evidence[]`, `risks[]`, `alternatives?`.
  - **`failureModeTrace?`** — four sub-fields: `originalState`, `rootMechanism`, `newStateAfterFix`, `whyAssertionPassesNow`. This is the causal rationale the review agent audits; missing/vague trace is a CRITICAL rejection.
- **System prompt composition**:
  - `COMMON_PREAMBLE`
  - Framework-specific patterns block (`CYPRESS_PATTERNS` or `WDIO_PATTERNS`; both concatenated for unknown framework)
  - `COMMON_SUFFIX` containing the JSON output schema + `failureModeTrace` rules + `oldCode` rules (must verbatim-match source)
- **Iteration**: driven by the orchestrator. Each iteration may receive `previousFeedback` from prior review issues or low-confidence / oldCode-validation rejections.

### Review agent — `review-agent.ts`

**One-liner**: approve or reject a proposed fix, auditing changes, trace quality, and PR/product consistency.

- **Input**: `{ proposedFix, analysis, investigation?, codeContext? }` — orchestrator always passes `investigation` and `codeContext` when available.
- **Output**: `{ approved, issues[] (each with severity CRITICAL/WARNING/INFO), assessment, fixConfidence, improvements? }`.
- **Parser safety**: any CRITICAL issue forces `approved = false` even if the model says `approved: true`.
- **Approval rules** (from system prompt): no CRITICAL issues **and** the fix addresses the root cause.
- **CRITICAL list includes**:
  - `oldCode` doesn't match source (hallucinated).
  - Change is a no-op (same as original).
  - Wrong line / wrong file.
  - Missing or vague `failureModeTrace`.
  - **Logical strengthening** of an assertion without justification (e.g. `should('exist')` → `should('be.visible')`).
  - `issueLocation=APP_CODE` without justification.
  - Fix contradicts investigation's `verdictOverride`.
  - Fix ignores investigation's `recommendedApproach`.
- **Orchestrator integration**: `isBlockingCriticalIssue` helper inspects the issue list; at max iterations, refuses to ship any fix that has an open quality-critical issue (trace missing/vague, strictly-stronger logic).

### `AgentContext` (`src/agents/base-agent.ts`)

Every field and what it's for:

| Field | Role |
|---|---|
| `errorMessage`, `testFile`, `testName`, `errorType?`, `errorSelector?`, `stackTrace?` | Failure identity. |
| `screenshots?` (name + base64), `logs?` | Failure artifacts. |
| `prDiff?`, `productDiff?` | Test-repo PR diff + recent product-repo commits. |
| `framework?` | `cypress` | `webdriverio` — drives per-agent prompt branching. |
| `sourceFileContent?`, `relatedFiles?` | Populated by code reading agent before investigation. |
| `skillsPrompt?` | Pre-formatted skills text (set by orchestrator for each agent role). |
| `delegationContext?` | Per-stage briefing the orchestrator builds from prior agents' output. |
| `includeScreenshots?` | Default `true`; orchestrator sets to `false` after investigation to conserve tokens. |
| `investigationSummary?` | Short string used by downstream skill save. |
| `priorInvestigationContext?` | Prior investigation findings from the skill store (for the investigation agent only). |
| `repoContext?` | The `.adept-triage/context.md` block — prepended to every agent's system prompt. |

---

## Prompt composition

### System prompt
For every agent except `CodeReadingAgent` (which doesn't call the LLM):

```
<agent role + rubric + output schema>

<repo conventions block, if context.repoContext is set>
```

`BaseAgent.runAgentTask` (`src/agents/base-agent.ts:263-266`) does this concatenation automatically. Empty `repoContext` collapses to no-op. **Order matters**: the agent's role frames the task; repo conventions refine "how this repo does things." Swapping the order would risk the model treating conventions as the primary task.

Fix-gen's system prompt additionally includes `CYPRESS_PATTERNS` or `WDIO_PATTERNS` (~100 lines each of canonical fix patterns) before the JSON schema.

### User prompt

Each agent's `buildUserPrompt` is role-specific but composes these layers when present:

1. `delegationContext` (orchestrator briefing from prior stages)
2. `errorMessage`, diffs, code slices, screenshots metadata
3. `skillsPrompt` (prior-fix memory)
4. Role-specific instructions

### Skill-memory rendering

Three entry points, different framings to prevent anchoring bias:

- **`formatSkillsForPrompt(skills, role, flakiness?)`** — used by orchestrator before analysis/investigation/fix-gen/review. Role-specific header:
  - `investigation`: "these patterns have been applied before — use as background; do NOT anchor."
  - `fix_generation`: "validated approaches are starting points; use the causal trace as a reasoning template."
  - `review`: "check alignment with prior validated patterns; weaker current trace is a WARNING signal."
- **`formatForInvestigation({ framework, spec, errorMessage })`** — used by coordinator to build `investigationContext` passed through as `priorInvestigationContext`. Filters to skills that have `investigationFindings` set. Top 3 rendered as "Prior investigation for `<spec>` (<date>)".
- **`formatSkillsForClassifierContext(skills)`** — used by coordinator for the classifier context block. Numbered lines of (errorPattern, rootCauseCategory, fix summary, confidence, optional classificationOutcome).

**Trace rendering** is gated to avoid feeding "how this fix reasoned" under skills that failed:
- Only for roles `fix_generation` and `review`.
- Only when the skill is validated (`validatedLocally === true` OR `successCount > 0`).
- Each trace sub-field capped at 200 chars.

**Track-record wording** is three-state honest:
- `successCount + failCount > 0` → `"X/Y successful"`.
- No runtime counters, `validatedLocally === true` → `"validated on save, no runtime track record yet"`.
- No runtime counters, not validated-at-save → `"untested"`.

### Prior-attempt context (outer fix-validate loop)

When iteration N of `iterativeFixValidateLoop` runs, `buildPriorAttemptContext(...)` renders iteration N-1's failed fix into the agent's `errorMessage` block:

- The previous fix's diff (file paths, oldCode, newCode).
- Sanitized validation-run logs (tail, 8000 chars by default).
- `priorAgentRootCause` + `priorAgentInvestigationFindings` — forces the fresh pipeline to actively diverge rather than re-discover the same theory.
- `previousFix.reasoning` and `previousFix.failureModeTrace` sub-fields.
- Explicit instruction to try a *different* approach.

Every field goes through `sanitizeForPrompt` — test-runner logs can contain prompt-injection patterns quoted from user code.

### `sanitizeForPrompt`

Defensive sanitizer applied to every model-adjacent string before it lands in a prompt. Accepts `unknown` because upstream parsers sometimes leave non-strings on evidence arrays. Applied escapes:

- Triple backticks ` ``` ` → `′′′` (U+2032 primes) — can't break out of a fenced block.
- `## SYSTEM:` → `## INFO:`.
- `Ignore previous` → `[filtered]`.
- `<system>...</system>`, `<instruction>...</instruction>`, `<prompt>...</prompt>` tags stripped.
- `[INST]`, `[/INST]`, `<<SYS>>`, `<</SYS>>` removed.
- Length-capped (default 2000); overflow ends in `... [truncated]`.

---

## Repair path — agentic only

`SimplifiedRepairAgent.generateFixRecommendation()` now has exactly one repair path: the agentic orchestrator. If the orchestrator cannot produce an approved fix, the method returns `null`; the coordinator reports that no safe fix was generated. There is no weaker fallback repair path.

This is intentional. The removed legacy one-shot path bypassed the investigation agent, review agent, causal-trace enforcement, iterative feedback loop, and the upgraded `gpt-5.4` fix-gen/review model. A weak one-shot fix that happened to pass could be saved as a validated skill and pollute future memory. Failing honestly is safer than creating a low-quality fix.

### Entry point

In `SimplifiedRepairAgent.generateFixRecommendation()` (`src/repair/simplified-repair-agent.ts`):

1. Require an orchestrator. If source-fetch context is missing and no orchestrator can be constructed, log a warning and return `null`.
2. Run `tryAgenticRepair()` → `AgentOrchestrator.orchestrate()`.
3. If agentic returns a fix → return `{ fix, lastResponseId, agentRootCause, agentInvestigationFindings }`.
4. If agentic returns `null` (timeout, no valid fix, investigation abort, review rejection, max iterations) → log `🤖 Agentic repair did not produce an approved fix; no weaker fallback repair path will run.` and return `null`.

### Agentic path — `AgentOrchestrator.orchestrate()`

Happy path (`src/agents/agent-orchestrator.ts`):

1. Wrap the whole pipeline in a `Promise.race` against a `totalTimeoutMs` timer (default **300,000 ms** — bumped in v1.51.0 for xhigh reasoning latency).
2. **Analysis** — receives `skillsPrompt` pre-rendered with role `investigation` (by design — analysis shares investigation's "don't anchor" framing). Runs with `lastResponseId` as `previousResponseId` for Responses-API chaining across outer iterations.
3. **Code reading** — no LLM, no chaining. Sets `context.sourceFileContent` (line-numbered) and `context.relatedFiles`.
4. **Investigation** — chains to analysis **only** when `analysis.confidence < AGENT_CONFIG.INVESTIGATION_CHAIN_CONFIDENCE` (default **80**). Lower analysis confidence = pull in analysis's reasoning context; higher = start fresh to avoid cascading over-confident analysis.
5. **Verdict gates** — abort repair if `verdictOverride.suggestedLocation === 'APP_CODE'` with high-enough confidence, or if `!isTestCodeFixable && !verdictOverride`.
6. **Fix-gen / review loop** — up to `maxIterations` (default **3**). Each iteration:
   - Set `delegationContext` and `skillsPrompt` for fix-gen.
   - Run fix-gen with shared `fixReviewChainId` (Responses-API chain within the same run).
   - `autoCorrectOldCode` tries to snap near-miss `oldCode` strings to exact source matches.
   - If confidence `< minConfidence` (default **70**), set `reviewFeedback` and continue.
   - If `requireReview`: run review with the same chain id.
   - Approved + no blocking CRITICALs → return fix with `approach: 'agentic'`.
   - Not approved → build `reviewFeedback` from issues + (if blocking CRITICAL with prior trace) explicit replay of `previousFix.failureModeTrace` → next iteration.
7. **Max iterations fallback inside agentic only** — if the review loop ran out of iterations but the last agentic fix has acceptable confidence AND no blocking quality CRITICALs, return it with a warning ("not review-approved; validation is the final gate"). Otherwise error.

---

## Learning loop — skill store + repo context + seeds

### The `TriageSkill` data model

Fields (`src/services/skill-store.ts`) and what they mean:

| Field | Set by | Purpose |
|---|---|---|
| `id` | `buildSkill` / seed CLI | UUID. |
| `createdAt`, `lastUsedAt` | `buildSkill` / `recordOutcome` | Timestamps. |
| `repo`, `spec`, `testName`, `framework` | Callers | Identity for retrieval scoring. |
| `errorPattern` | `normalizeError(errorMessage)` | Structural shape for similarity matching. |
| `rootCauseCategory` | Analysis / inference | One of the analysis enum values. |
| `fix: { file, changeType, summary, pattern }` | Fix-gen / callers | What the fix was. |
| `confidence`, `iterations` | Repair loop | At save time. |
| `prUrl` | Coordinator (when PR created) | Trust signal for fix-gen/review; empty when local-only. |
| `validatedLocally` | Coordinator (local path) | Gates classifier retrieval + trace rendering. |
| `priorSkillCount` | `countForSpec` at save | Analytics only (retired-excluded, v1.49.3). |
| `successCount` / `failCount` | `recordOutcome` (atomic `ADD`) | Track record + auto-retire trigger. |
| `retired` | Auto-set on threshold | Excludes from retrieval. |
| `classificationOutcome` | `recordClassificationOutcome` | `'correct'` or `'incorrect'`; only `'correct'` written today. |
| `rootCauseChain` | Callers | Short human chain string. |
| `investigationFindings` | `summarizeInvestigationForRetry` | Rendered by `formatForInvestigation`. |
| `repoContext?` | Callers (seeds optional) | Per-skill note; distinct from the global `.adept-triage/context.md`. |
| `failureModeTrace?` | Fix-gen | The 4-field causal trace (v1.48.1/v1.49.1). |
| **`isSeed?`** | Seed CLI only | Pruning + audit exemption (v1.52.0). |

### DynamoDB layout

- **Table**: `triage-skills-v1-live` (configurable via `TRIAGE_DYNAMO_TABLE`).
- **Partition key** `pk` = `REPO#<owner>/<repo>`.
- **Sort key** `sk` = `SKILL#<id>`.
- **Auth**: AWS SDK default provider chain — the action does NOT wire OIDC or reference a role ARN in code. Consumer workflows typically use `aws-actions/configure-aws-credentials@v4` with OIDC before this action runs.
- **`MAX_SKILLS = 100`** per partition. Enforced on `save()`.

### Never-reject contracts

`load()`, `save()`, `recordOutcome()`, `recordClassificationOutcome()` ALL have an explicit never-reject contract:

- Errors are caught, logged (warning level), and translated to sentinel states (empty cache, in-memory rollback, skipped update).
- The coordinator awaits these without `.catch(...)` and relies on this — a DynamoDB outage must not take down triage.

### Pruning — `selectSkillsToPrune`

When `save()` pushes the partition over `MAX_SKILLS`:

- Eligible = all skills except (a) the just-saved skill id and (b) any skill with `isSeed === true`.
- Sort oldest-first by `createdAt`, then by `id` for tie-break.
- Delete the N oldest from the eligible set (where N = overflow).

Seeds are a hard floor — they can never be evicted by a flood of auto-saved skills. That's the whole point of the `isSeed` flag.

Pruning is **skipped entirely** if `loadSucceeded === false` (the in-memory view isn't trustworthy).

### Auto-retirement

In `recordOutcome()`: after a failure counter bump, if `failRate > RETIRE_FAIL_RATE (0.4)` AND `failCount >= RETIRE_MIN_FAILURES (3)`, a second `UpdateCommand` sets `retired = true`. Retired skills stop being surfaced but stay in the store (flakiness signal counts them).

### Retrieval

- **`normalizeSpec`** (v1.52.0) — strips GitHub Actions runner prefixes (Linux `/home/runner/work/<repo>/<repo>/`, Windows `D:\a\<repo>\<repo>\`) and leading `./`. Applied at **write time** in `buildSkill` and at **read time** in `findRelevant`, `findForClassifier`, `detectFlakiness`, `countForSpec`. This is what makes relative-path seeds match runtime absolute-path failures.

| Method | Filter | Scoring | Limit |
|---|---|---|---|
| `findRelevant({ framework, spec, errorMessage, limit })` | `!retired` + framework | spec-match `+10`, error-similarity Jaccard × 5 | 5 |
| `findForClassifier({ framework, spec, errorMessage })` | `!retired` + framework + **`validatedLocally === true`** | spec-match `+15`, error-similarity × 5, `+3` recency (lastUsedAt within 7d) | 3 |
| `detectFlakiness(spec)` | (counts retired) | Windowed: `>1` in 3d → flaky; `>2` in 7d → flaky | — |
| `countForSpec(spec)` | `!retired` | Count | — |

### `RepoContextFetcher` (v1.52.0)

`src/services/repo-context-fetcher.ts`. One class, one public method.

- **Cache key** `<owner>/<repo>@<ref>` — per-run, per-branch. Different branches on the same run don't collide.
- **Order of operations** in `fetch(owner, repo, ref)`:
  1. Cache hit → return.
  2. **`getBundledRepoContext(owner, repo)`** — synchronous lookup in `bundled-repo-contexts.ts`. Case-insensitive. If hit, render and return. **No network call.**
  3. `octokit.repos.getContent({ owner, repo, path: '.adept-triage/context.md', ref })`.
  4. On success: decode base64, `sanitizeForPrompt(body, REPO_CONTEXT_MAX_CHARS=6500)`, wrap with `## Repository Conventions` header, cache, return.
  5. On 404: debug-log, return `''`.
  6. On other error: debug-log, return `''`. Never throws.

### Bundled contexts (`src/services/bundled-repo-contexts.ts`)

A static map of `<owner>/<repo>` → raw markdown string. Used for repos where adding tooling files to every PR is costly (high-traffic product repos). Currently bundled: `adept-at/learn-webapp`.

- **Map-key invariant**: all keys must be lowercase. `getBundledRepoContext` lowercases its lookup input so `Adept-At/Learn-WebApp` resolves to the same entry. A test (`__tests__/services/repo-context-fetcher.test.ts`) asserts this at runtime — it's load-bearing, not aspirational.
- **Release coupling**: bundled contexts ship with the agent. Update = edit the template literal, `npm run all`, merge, new release. Slower than the in-repo path by design; the trade-off is clean product-repo PR histories.
- **Sanitization**: bundled content goes through the same `sanitizeForPrompt` as remote content. Defense-in-depth against a future maintainer accidentally landing unescaped patterns.

### Wiring into agent prompts

Coordinator calls `RepoContextFetcher.fetch(...)`, threads `repoContext` through validator → repair-agent → `createAgentContext({ repoContext })`, and `BaseAgent.runAgentTask` appends it to every agent's system prompt.

### Seed skills (v1.52.0)

Curated, hand-written skills inserted manually via `scripts/seed-skill.ts`. Purpose: bootstrap the learning loop for a repo before it accumulates its own runtime skills.

Seeds are normal skills with `isSeed: true` and these defaults:

- `validatedLocally: true`
- `successCount: 1`
- `classificationOutcome: 'correct'`

These defaults make seeds immediately eligible for `findForClassifier` (which requires `validatedLocally === true`) and give them a neutral starting track record. They score the same way as auto-saved skills — the `isSeed` flag only affects pruning and audit behavior.

**CLI**: `scripts/seed-skill.ts` takes a single file, a directory (recursive), `--list`, or `--remove <id-prefix>`. Validates `SeedInput` shape before inserting. Applies `normalizeSpec` and `normalizeError` the same way `buildSkill` does.

### Audit tooling

`scripts/audit-skills.ts` scans the entire table and flags issues at three severities:

| Severity | Check | Action flag |
|---|---|---|
| WARN | Failed trajectory (`!validatedLocally && !retired`) | `--retire-flagged` |
| INFO | `rootCauseCategory === 'OTHER'` (legacy pre-April-2026 data) | — |
| WARN | `classificationOutcome === 'incorrect'` (pre-v1.50.1 noisy writer) | `--clear-noisy-incorrect` |
| INFO | Empty `investigationFindings` | — |
| WARN | Empty or very short fix summary | — |
| INFO | Stale (>30d no activity) | — |
| DELETE | High fail rate (`>40%` with `>=3` attempts) not retired | `--delete-flagged` |
| WARN | Duplicate spec+test (newer than one active skill) | `--retire-flagged` |
| WARN | Partition over `MAX_SKILLS` | — |

**Seeds are skipped** for all per-skill checks and for the duplicate-group check (seeds legitimately cover multiple failure modes of the same test).

### Sister scripts

- `scripts/inspect-skills.ts <id-prefix>` — dumps full skill fields for manual review.
- `scripts/check-spec-paths.ts` — diagnostic that prints every skill's raw `spec` + `testName` + `fix.file` as persisted, useful for verifying what `normalizeSpec` will actually produce.

---

## Validation paths — local vs remote

### Local path (authoritative — v1.45.0+)

Used when **all** of these are true:

- `ENABLE_AUTO_FIX === 'true'`
- `ENABLE_VALIDATION === 'true'`
- `ENABLE_LOCAL_VALIDATION === 'true'` (explicit, avoids the pre-v1.45.0 bug where just setting `VALIDATION_TEST_COMMAND` implied local)
- `VALIDATION_TEST_COMMAND` is set
- `AUTO_FIX_TARGET_REPO` resolves

Flow: `iterativeFixValidateLoop` → `LocalFixValidator` clones the target repo into a temp dir, installs deps, optionally caches the Cypress binary, does a 3-consecutive-pass baseline check (`BASELINE_PASS_COUNT = 3`, v1.50.1), then per iteration applies the fix, runs the test command, and on pass pushes a branch + opens a PR.

`{spec}` and `{url}` in `VALIDATION_TEST_COMMAND` are substituted from `VALIDATION_SPEC` / `VALIDATION_PREVIEW_URL` (or from the `spec` in the dispatch payload).

### Remote path (legacy)

Used when the local conditions aren't met and `ENABLE_AUTO_FIX === 'true'` + `ENABLE_VALIDATION === 'true'`. `attemptAutoFix` applies the fix via the GitHub API (creates a branch, commits, opens a PR), then `triggerValidation` dispatches `VALIDATION_WORKFLOW` (default `validate-fix.yml`) on the target repo. `validation_run_id` + `validation_url` are surfaced on the action output.

### Baseline check short-circuit

On the first failing run in the 3-pass baseline, the validator short-circuits — we already know the test legitimately fails, no point running the other two. On 3/3 passes, we return `fixRecommendation: null` + `iterations: 0` — the original failure was transient and no fix is needed.

### Blast-radius confidence scaling

`requiredConfidence(fix, baseMin)` scales up the required confidence based on change scope:

- `+10` if any changed path matches a shared-code fragment (`/pageobjects/`, `/helpers/`, `/commands/`, ...).
- `+5` if the fix touches 2+ files.
- Scaled threshold is capped at `max(baseMin, 95)`.

`auto_fix_skipped` is set **only** when scaling raised the bar — a fix that fails only the base threshold isn't flagged as "skipped by policy" because no policy kicked in.

---

## Outputs, verdicts, and error contracts

### Verdict values

| Verdict | When |
|---|---|
| `TEST_ISSUE` | Test code problem; may trigger fix recommendation / auto-fix. |
| `PRODUCT_ISSUE` | Real app regression; no fix proposed. |
| `INCONCLUSIVE` | Confidence below threshold; no fix proposed. |
| `PENDING` | The referenced workflow run hasn't finished yet (same-workflow mode). |
| `NO_FAILURE` | No failing job detected. |
| `ERROR` | Unrecoverable failure (missing inputs, etc.). `core.setFailed(...)`. |

### Action outputs

All values are strings (GitHub Actions convention). JSON blobs are stringified JSON.

| Output | Set when | Content |
|---|---|---|
| `verdict`, `confidence`, `reasoning`, `summary`, `triage_json` | Always (even `ERROR`) | Core fields. `triage_json` is the full structured payload. |
| `has_fix_recommendation` | `TEST_ISSUE` with fix | `true`/`false`. |
| `fix_recommendation` | `TEST_ISSUE` with fix | Stringified JSON of fix object. |
| `fix_summary`, `fix_confidence` | `TEST_ISSUE` with fix | Human summary + confidence. |
| `auto_fix_applied`, `auto_fix_branch`, `auto_fix_commit`, `auto_fix_files` | Auto-fix created a branch | Note: `auto_fix_commit` not `auto_fix_commit_sha`. |
| `validation_run_id`, `validation_status`, `validation_url` | Remote validation path | Legacy remote path only. |
| `auto_fix_skipped`, `auto_fix_skipped_reason` | Intentional auto-fix skip | Chronic flakiness, blast-radius gate, no changes proposed, etc. |

### Error contracts

- **`index.ts` top-level catch** — builds an `ERROR` verdict inline and calls `core.setFailed(...)`. Backstop for anything that escapes the coordinator.
- **`setErrorOutput(reason)`** — used by `handleNoErrorData` when no failure can be located; calls `core.setFailed(reason)`.
- **`setInconclusiveOutput`** — does NOT call `core.setFailed`; the run is a clean pass but the verdict is `INCONCLUSIVE`.
- **Never-reject contract** applies to all `SkillStore` methods + `RepoContextFetcher.fetch` — the learning loop must never take down triage.

---

## Observability

Every grep-stable log line, what it means, and when to care.

### Learning loop

| Line | Meaning |
|---|---|
| `📝 Loaded N skill(s) from DynamoDB (<table>) for <owner>/<repo>` | Skills loaded. If missing, check AWS creds / table / region. |
| `📝 skill-telemetry role=<role> count=<n> ids=<csv>` | Which skills reached which prompt on this run. Proves retrieval is actually working. |
| `📊 skill-telemetry-summary loaded=N surfaced=M saved=K` | Per-run rollup. Emitted even when all zero (explicit "no activity"). |
| `📝 Saved validated skill <id>` / `📝 Saved failed skill trajectory <id>` | Skill persisted after a fix attempt. |
| `🧹 Pruned N old skill(s) from DynamoDB` | `MAX_SKILLS` cap enforcement. Seeds are never pruned. |
| `⚠️ Skill <id> retired — X% failure rate` | Auto-retirement threshold hit. |

### Repo context

| Line | Meaning |
|---|---|
| `📘 Loaded repo context from <owner/repo>/.adept-triage/context.md@<ref> (<N> chars)` | In-repo context was fetched successfully. |
| `📘 Loaded repo context for <owner/repo> (bundled in adept-triage-agent, <N> chars)` | Bundled context was used — no remote call. |

### Pipeline / agents

| Line | Meaning |
|---|---|
| `🤖 Starting agentic repair pipeline...` | Agentic path entered. |
| `📊 Step 1: Running Analysis Agent...` | Orchestrator phase headers. |
| `🤖 Agentic approach: <approach>, iterations: N, time: Xms` | Agentic success with stats. |
| `🤖 Agentic repair did not produce an approved fix; no weaker fallback repair path will run.` | Agentic repair failed honestly; no weaker repair path is attempted. |
| `🔄 Fix-Validate iteration N/3` | Local validation loop iteration. |
| `🧪 Running test locally...` | Local validation is running the test command. |
| `🔍 Running baseline check — does the test pass without any fix? (requires 3 consecutive passes)` | Baseline gate. |
| `✅ Baseline check passed — test passes without fix. Failure was likely transient.` | 3/3 passes, no fix needed. |
| `❌ Baseline failed on pass N — short-circuiting.` | Baseline proved real failure. |
| `⚠️ FLAKINESS DETECTED: <message>` | A spec is flaky but not chronic; repair still runs. |
| `⏭️ Chronic flakiness: <message> Auto-fix skipped` | `CHRONIC_FLAKINESS_THRESHOLD` hit; human follow-up needed. |
| `⏭️ Auto-fix skipped: <reason>` | Blast-radius gate or similar policy withheld a fix. |

---

## Configuration defaults

Every numeric / string default operators might want to know.

| Setting | Default | Where |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | `70` | `action.yml` input |
| `AUTO_FIX_MIN_CONFIDENCE` | `70` | `action.yml` input |
| `AUTO_FIX_BASE_BRANCH` | `main` | `action.yml` input |
| `AUTO_FIX.BRANCH_PREFIX` | `fix/triage-agent/` | `src/config/constants.ts` |
| `CHRONIC_FLAKINESS_THRESHOLD` | `3` | `src/config/constants.ts` |
| Flakiness windows | `>1` fix in 3d OR `>2` in 7d | `src/services/skill-store.ts` `FLAKY_THRESHOLDS` |
| `BLAST_RADIUS.SHARED_CODE_BOOST` | `+10` | `src/config/constants.ts` |
| `BLAST_RADIUS.MULTI_FILE_BOOST` | `+5` | `src/config/constants.ts` |
| `BLAST_RADIUS.MAX_REQUIRED_CONFIDENCE` | `95` | `src/config/constants.ts` |
| `FIX_VALIDATE_LOOP.MAX_ITERATIONS` | `3` | `src/config/constants.ts` |
| `FIX_VALIDATE_LOOP.TEST_TIMEOUT_MS` | `300_000` | `src/config/constants.ts` |
| `BASELINE_PASS_COUNT` | `3` | `src/services/local-fix-validator.ts` |
| `AGENT_CONFIG.MAX_AGENT_ITERATIONS` | `3` | `src/config/constants.ts` |
| `AGENT_CONFIG.AGENT_TIMEOUT_MS` | `300_000` | `src/config/constants.ts` |
| `AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE` | `70` | `src/config/constants.ts` |
| `AGENT_CONFIG.INVESTIGATION_CHAIN_CONFIDENCE` | `80` | `src/config/constants.ts` |
| `MAX_SKILLS` (per repo partition) | `100` | `src/services/skill-store.ts` |
| Skill auto-retire threshold | `failRate > 0.4` AND `failCount >= 3` | `src/services/skill-store.ts` |
| `REPO_CONTEXT_MAX_CHARS` | `6500` | `src/services/repo-context-fetcher.ts` |
| `OPENAI.LEGACY_MODEL` | `gpt-5.3-codex` | `src/config/constants.ts` |
| `OPENAI.UPGRADED_MODEL` | `gpt-5.4` | `src/config/constants.ts` |
| `AGENT_MODEL.classification` | `LEGACY_MODEL` (the pre-repair `classify()` step) | `src/config/constants.ts` |
| `AGENT_MODEL.analysis` / `investigation` | `LEGACY_MODEL` | `src/config/constants.ts` |
| `AGENT_MODEL.fixGeneration` / `review` | `UPGRADED_MODEL` (v1.51.0 upgrade) | `src/config/constants.ts` |
| `REASONING_EFFORT.fixGeneration` / `review` | `xhigh` | `src/config/constants.ts` |
| `PRODUCT_REPO` | `adept-at/learn-webapp` | `action.yml` input |
| `PRODUCT_DIFF_COMMITS` | `5` | `action.yml` input |
| `TRIAGE_AWS_REGION` | `us-east-1` | `action.yml` input |
| `TRIAGE_DYNAMO_TABLE` | `triage-skills-v1-live` | `action.yml` input |
| `DEFAULT_PRODUCT_URL` | `https://learn.adept.at` | `src/config/constants.ts` |

---

## Invariants that must hold

Things that are load-bearing across the codebase. If you break one of these, something silently degrades rather than erroring.

- **`SkillStore` never rejects**. `load()`, `save()`, `recordOutcome()`, `recordClassificationOutcome()` all catch and swallow errors (with warnings). The coordinator relies on `await` without `.catch(...)`.
- **`RepoContextFetcher.fetch` never rejects**. 404 and all other errors return `''` and the agent keeps running.
- **`logRunSummary()` runs at every exit**. Wrapped in `try { runClassifyAndRepair(...) } finally { skillStore?.logRunSummary() }` in `execute()`. Guaranteed one summary line per run, even on throw.
- **Bundled-context map keys must be lowercase**. Enforced by a test. `getBundledRepoContext` lowercases its lookup input.
- **Bundled context takes precedence over in-repo context**. For repos in `BUNDLED_REPO_CONTEXTS`, the in-repo `.adept-triage/context.md` is never fetched. This is intentional — adding a repo to the bundle map is an explicit "keep it here" signal.
- **`normalizeSpec` must be applied on both sides of equality**. Seeds write relative paths; runtime writes absolute paths. Without normalization on the read side, seeds are inert.
- **Seeds are never pruned**. `selectSkillsToPrune` filters `!isSeed` before picking prune candidates.
- **`validatedLocally: true` on seeds**. Without it, seeds would never surface through `findForClassifier`.
- **Analysis `rootCauseCategory` is whitelisted at parse time**. A drifting model can't land arbitrary strings that propagate into storage + logs.
- **Investigation `verdictOverride` trumps analysis when its confidence is >= analysis's**. Orchestrator aborts repair in this case; don't silently proceed.
- **Review approval is parsed safely**. Any CRITICAL issue forces `approved = false` even if the model claims `approved: true`.
- **`sanitizeForPrompt` escapes triple backticks and injection keywords**. Every model-adjacent string goes through it before entering a prompt. Test-runner logs are adversarial.
- **`retired` skills count in `detectFlakiness` but NOT in retrieval**. Retirement means "stop recommending"; flakiness means "stop auto-fixing." Different polarities; different filters.

---

**Related docs**

- `USAGE_GUIDE.md` — integration cookbook (consumer workflow setup, secrets, matrix jobs).
- `agent-workflow-flowchart.md` — mermaid diagrams of the pipeline.
- `README.md` — entry point + feature overview.
- `RELEASE_PROCESS.md` — bundling + tagging + `v1` rolling tag.
- `README_CROSS_REPO_PR.md` — when a PAT is needed vs `GITHUB_TOKEN`.
- `seeds/DEPLOYED.md` — record of the v1.52.0 context + seed rollout.
