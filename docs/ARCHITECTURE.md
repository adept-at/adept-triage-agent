# Adept Triage Agent — Architecture

> **Current version:** v1.55.2
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

- **Classification** — OpenAI-powered verdict (`TEST_ISSUE`, `PRODUCT_ISSUE`, `INCONCLUSIVE`, `TRIAGE_LIMIT_REACHED`, `PENDING`, `ERROR`, `NO_FAILURE`) with 0–100 confidence.
- **Multi-agent repair** — five agents (analysis, code-reading, investigation, fix-gen, review) collaborate in an orchestrator with an internal fix/review loop. If agentic repair cannot produce an approved fix, the run fails honestly with no weaker fallback path.
- **Local-validation loop** — clones the target repo, confirms the failure is real with a 3-attempt baseline before generating any fix, applies fixes on disk across up to 3 iterations, and only pushes a branch + opens a PR after the test passes 3 consecutive evidence-bearing runs.
- **Learning loop** — skills (canonical fix patterns for a spec + error shape) are persisted to DynamoDB, retrieved by relevance, and rendered into agent prompts. Human-curated seed skills bootstrap the store.
- **Repo conventions** — each consumer repo can commit a `.adept-triage/context.md` describing its selector strategy, wait rules, auth flow, etc. For product repos where tooling files are unwelcome, the context is bundled in the agent itself.
- **Chronic flakiness gate** — specs that have been auto-fixed repeatedly in a window are flagged and auto-fix is skipped; the failure is surfaced for human follow-up.
- **Non-fixable seed gate** — curated seeds can flag a failure pattern as `nonFixable` (exhausted test data, admin-only remediation); a match skips repair entirely and surfaces manual-intervention guidance.

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
| v1.51.0 | Fix-gen + review upgraded to the newest frontier model with xhigh reasoning; agent timeout bumped from 120s. |
| v1.51.1 | Extraction-quality hardening (causal vs background rule, reject URL file-attribution). |
| **v1.52.0** | **Repo context (bundled + remote)**; **seed skills with `isSeed` pruning protection**; **`normalizeSpec` on write and read** so seeds written with relative paths match runtime absolute paths. |
| **v1.52.2** | **Safety + measurement tightening**: local path traversal uses resolved-path containment, confidence values are clamped to 0–100, outer validation retries no longer chain hidden Responses API history, custom prompt calls retry and emit token usage, seed skills are labeled as curated guidance. |
| **v1.52.3** | **GPT-5.5 migration**: all LLM calls use `gpt-5.5`; classification/analysis/investigation use high reasoning, fix-generation/review use xhigh reasoning, and internal/reusable workflow timeouts allow 15-minute triage runs. |
| **v1.52.4** | **Agentic-only repair contract hardened**: `AgentOrchestrator` now refuses to ship any fix that review never approved. Pre-v1.52.4 the orchestrator returned the last high-confidence fix as a fallback unless it had a narrow class of quality CRITICALs, which still let unapproved fixes reach validation and skill storage. Review approval is now mandatory. |
| **v1.52.5** | **Remote-validation learning hardening**: structured `ValidationResult` is recorded *before* the skill-store outcome write, so a failed or still-pending remote validation can no longer be persisted as a `validatedLocally` skill that pollutes future repair prompts. `shouldWriteSkillOutcome` gates skill writes to terminal validation states (`passed | failed | inconclusive`); `pending` and missing-validation cases skip the write with explicit log lines. |
| **v1.52.6** | **Curated-seed expansion**: added `04-mailosaur-concurrent-mailbox-cleanup` to `seeds/lib-wdio-8-multi-remote/` to cover the org-invites Mailosaur race-condition pattern. No code change; see `seeds/DEPLOYED.md`. |
| **v1.52.7** | **Repair lifecycle outputs**: six new action outputs (`repair_status`, `repair_summary`, `repair_details`, `repair_iterations`, `repair_last_stage`, `repair_review_issues`) surface the orchestrator's lifecycle outcome — `not_started | skipped | in_progress | no_fix_generated | review_rejected | timed_out | cancelled | no_approved_fix | approved | applied | validated` — orthogonally to the classifier `verdict`. The `RepairTelemetry` type is constructed by `AgentOrchestrator`, finalized in `finalizeRepairTelemetry`, and emitted by `emitRepairOutputs` so Slack and dashboards can distinguish e.g. "TEST_ISSUE classified, fix rejected by review" from "TEST_ISSUE classified, fix validated and shipped". |
| **v1.52.8** | **Code-reading performance**: tree-based path resolution in `code-reading-agent.ts` collapses multiple `getContent` calls into a single `getTree` followed by local lookups, materially reducing GitHub API calls for repos with deep test trees. Fix-generation default tightened for repos that don't declare a framework. |
| **v1.52.9** | **Validation/publish decoupled (B1 + H1) + remote dispatch hardened (B5)** — the first phase of the architecture roadmap (Wave A; the roadmap doc has since been removed — see git history for `docs/ARCHITECTURE_ROADMAP.md`). A passing local test followed by a push/PR creation failure is no longer recorded as a failed skill trajectory: `validatedLocally` and `recordOutcome` are now driven by validation outcome, not by `ApplyResult.success`. Two new `RepairStatus` values surface this — `validated_publish_failed` (validation passed, publish failed afterward) and `validated_not_published` (reserved for future ApplyResult shapes). `auto_fix_applied` is now `applySucceeded && validationPassed` (was `success` alone), and `triage_json.autoFix.applied` agrees with the action output and `metadata.autoFixApplied`. `triggerValidation` resolves the target repo's default branch via `octokit.repos.get` instead of hardcoding `'main'`, and runs are correlated by `display_title` substring keyed on `triage_run_id` with time-window fallback for legacy consumer workflows. `validation_status` is the authoritative validation outcome, independent of publish success. |
| v1.52.10–v1.55.x | Not itemized here — highlights that shape the current design: baseline check moved **before** any fix generation; multi-pass post-fix validation (`validateFixPasses`, 3 consecutive evidence-bearing passes); non-fixable seed gate; verdict-override gate switched to an absolute threshold (70) covering `APP_CODE` and `BOTH`; cross-run fix-fingerprint dedupe + failed-trajectory confidence boosts; skill reinforcement instead of duplicate inserts; source-run admission gate (`TRIAGE_LIMIT_REACHED`); infrastructure fast-path; hybrid credential env-filtering in the local validator; single `gpt-5.6-sol` model for all stages. |

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

`src/index.ts` → `run()` does exactly this sequence:

1. **`getInputs()`** — parses `ActionInputs` from `core.getInput` + `process.env`. Feature booleans are strict `=== 'true'` (any other string is `false`); the one exception is `PERSIST_RESULTS`, which defaults on and is parsed as `!== 'false'`. Numeric inputs go through `clampInt` (out-of-range values fall back to the default with a warning).
2. **`new Octokit({ auth: inputs.githubToken })`**.
3. **`resolveRepository(inputs)`** → `{ owner, repo }` via `parseRepoString`; falls back to `github.context.repo` on invalid/missing `REPOSITORY`.
4. **`new OpenAIClient(inputs.openaiApiKey)`**.
5. **`new ArtifactFetcher(octokit)`**.
6. **`new PipelineCoordinator({ octokit, openaiClient, artifactFetcher, inputs, repoDetails })`**.
7. **`await coordinator.execute()`** — all GH Action outputs are set from inside the coordinator (`setSuccessOutput` / `setInconclusiveOutput` / `setErrorOutput` / `setTriageLimitOutput` in `src/pipeline/output.ts`).

The top-level `catch` in `index.ts` delegates to `setErrorOutput(...)` (which emits the `ERROR` verdict outputs and calls `core.setFailed`) for anything that escapes the coordinator's own error handling. The `require.main === module` trailer catches fatal unhandled errors outside the try/catch the same way.

---

## Pipeline — coordinator + validator

### `PipelineCoordinator` (`src/pipeline/coordinator.ts`)

One class, five methods worth knowing:

- **`execute()`** — Top-level. First claims a **source-run admission slot** (`claimSourceRunSlot`, `TRIAGE_RUN_GATE.MAX_ATTEMPTS = 2` triage runs per source workflow attempt; a `limited` result emits the `TRIAGE_LIMIT_REACHED` verdict via `setTriageLimitOutput` and returns; `unavailable` fails the run unless the caller is a legacy consumer that didn't pass `WORKFLOW_RUN_ATTEMPT`). Then runs log processing, constructs `SkillStore` when `autoFixTargetRepo` resolves and `PERSIST_RESULTS` isn't false, and wraps `runClassifyAndRepair()` in `try { ... } finally { skillStore?.logRunSummary(); logRunGateSummary(); persistRunOutcome() }`. The `finally` guarantees per-run summary lines and a durable outcome-event write at every exit (including thrown errors).
- **`runClassifyAndRepair()`** *(private)* — The decision tree:
  1. **Infrastructure fast-path** (`detectInfrastructureFailure`): unambiguous remote-WebDriver / Sauce session-creation failures skip the LLM classifier entirely and emit `INCONCLUSIVE` at 95 confidence. No test or product code ran, so no fix is applicable.
  2. **Synthetic canary fast-path** (`detectSyntheticCanaryFailure`): for repos in `CANARY_REPOS`, the seeded canary selector failure is classified `TEST_ISSUE` deterministically.
  3. `classify()` → returns `ClassificationResult`. A durable failure event is recorded (`recordFailureEvent`) for every verdict before the early returns below.
  4. If `classification.confidence < confidenceThreshold` → `setInconclusiveOutput` and return (classify handles the output internally).
  5. If `verdict !== 'TEST_ISSUE'` → `setSuccessOutput` with the verdict and return.
  6. **Non-fixable seed gate**: `skillStore.findNonFixableMatch(...)` — if a curated seed with `nonFixable: true` matches the spec exactly AND the error pattern with ≥0.3 Jaccard similarity, skip repair, set `autoFixSkipped=true` with the seed's manual-intervention guidance, and return. Runs **before** the chronic-flakiness gate because non-fixable is the stronger signal ("we know from the start no code fix applies" vs "we've tried repeatedly").
  7. **Chronic flakiness gate**: if `skillStore.detectFlakiness(spec)` returns `isFlaky` (thresholds in `FLAKY_THRESHOLDS`: >1 fix in 3 days or >2 in 7 days), skip repair entirely, set `autoFixSkipped=true` with a human-readable reason, and return. This is how we stop stacking fallback fixes on truly broken specs.
  8. `repair()` → returns `RepairResult`. Wrapped in try/catch: repair is best-effort, so an infrastructure throw (clone / npm install / network during validation setup) publishes the classification with `repair_status=no_fix_generated` telemetry instead of erasing the verdict as `ERROR`.
  9. Persist the skill outcome when a fix was attempted AND `shouldWriteSkillOutcome` says the validation reached a terminal state. If the fix is byte-identical to an existing skill (`findReinforcementTarget` on `fixFingerprint` + normalized spec), **reinforce** that skill in place (`reinforceSkill`) instead of inserting a near-duplicate; otherwise `buildSkill()` + `save()` + `recordOutcome()`. `validatedLocally` is driven by validation outcome, not publish success; failed validations also persist `failedFixEvidence` (but only when the validation failure has the same failure signature as the original error — unrelated downstream failures skip the write).
  10. `setSuccessOutput` with the combined result and finalized repair telemetry.
- **`classify()`** — Reads classifier-relevant skills (`findForClassifier`), renders them via `formatSkillsForClassifierContext`, appends a flakiness-signal block when `detectFlakiness` fires, calls `analyzeFailure()`, handles low-confidence / non-`TEST_ISSUE` early exits.
- **`repair()`** — Resolves auto-fix target, fetches repo context (via `RepoContextFetcher`, from the trusted base branch only — never the failing feature branch), branches on local-validation availability:
  - **Local path** (all of `enableAutoFix`, `enableValidation`, `enableLocalValidation`, `validationTestCommand`, `autoFixTargetRepo` true) → `iterativeFixValidateLoop`.
  - **Otherwise** → `generateFixRecommendation` + optional `attemptAutoFix`.
- **`handleNoErrorData()`** — Runs when log processing yields nothing. Classifies as `NO_FAILURE` (green run), `PENDING` (still in progress), or `ERROR` (cannot determine).

### `iterativeFixValidateLoop` (`src/pipeline/validator.ts`)

The local-validation loop. Maximum `FIX_VALIDATE_LOOP.MAX_ITERATIONS` outer iterations (= `AGENT_CONFIG.GLOBAL_FIX_ATTEMPT_BUDGET` = 3); each outer iteration runs the orchestrator with `maxFixIterations: 1` so the outer loop owns the global generated-fix budget (no nested 3×3 cost).

**Before any fix generation** (setup + baseline first — the cheapest, highest-signal gate):

- `validator.setup()` — clones the target repo, `npm ci`/`install` (with `--ignore-scripts`), npm + Cypress binary caching.
- `baselineCheck()` — runs the unmodified test `VALIDATION_PASS_COUNT` (3) times and classifies the `BaselineDisposition`: `all_failed` (proceed with repair), `all_passed` (failure was transient — skip repair), or `mixed` (flaky/inconclusive — skip repair). Any non-`all_failed` disposition returns `{ fixRecommendation: null, iterations: 0, repairTelemetry.status: 'skipped' }` without spending a single LLM call.

Then, per iteration:

1. `generateFixRecommendation(...)` — builds a `RepairContext`, spins up `SimplifiedRepairAgent` with model overrides, calls `repairAgent.generateFixRecommendation(...)`. Returns `{ fix, agentRootCause, agentInvestigationFindings, lastResponseId }` or `null`. Local validation retries intentionally start each full orchestrator run without a cross-iteration `previous_response_id`; the retry signal is the explicit sanitized `previousAttempt` block below.
2. If `null` or no `proposedChanges` → break.
3. **Blast-radius gate** (`requiredConfidence` in `src/pipeline/validator.ts`) — see [Blast-radius confidence scaling](#blast-radius-confidence-scaling) for the full factor list. If the scaled threshold blocks the fix **because scaling kicked in** (not because confidence was just below the base threshold), set `autoFixSkipped=true` with the reasons; otherwise break silently.
4. **In-run duplicate-fix fingerprint**: if this fix has the same `fixFingerprint(...)` as a previously failed fix in this loop, break. Prevents infinite retry-same-attempt loops.
5. **Cross-run fingerprint dedupe**: `skillStore.findRecentFailedFingerprints(spec, 24h)` — if the fix is byte-equivalent to one already saved as a `validatedLocally=false` skill on the same spec within the last 24 hours, skip unconditionally with `autoFixSkipped=true`. This blocks duplicates even when their confidence clears the raised threshold.
6. `applyFix` (on-disk patch using resolved-path containment), then **`validateFixPasses()`** — the fix must pass `VALIDATION_PASS_COUNT` (3) **consecutive evidence-bearing** test runs before publication; a single lucky pass is not enough.
7. **On pass**: `pushAndCreatePR` (create branch, commit — staging **only** `changedFiles`, not `git add -A` — push, open PR). Return with `autoFixResult.success = true` and `validationStatus=passed`. Push-failure edge case: fix passed locally but push failed → return with `success=false` + `validationStatus=passed` (so operators can tell "the fix works, GitHub just rejected the push" apart from a real failure — surfaced as `repair_status=validated_publish_failed`).
8. **On fail**: add fingerprint to failed set, record a terminal `validationStatus=failed` `ApplyResult` (this is what lets the coordinator persist the failed trajectory + fingerprint so the cross-run dedupe has data), `validator.reset()` (git clean), build `previousAttempt` for next iteration with the failed fix diff + sanitized validation logs + prior agent reasoning. Loop.
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
  responseId?: string;              // classifier response id, not chained across local validation retries
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
  repairTelemetry?: RepairTelemetry;
  baselineDisposition?: BaselineDisposition;  // explicit local baseline result
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
- **Tree-based path resolution** (perf optimization): on first need, `ensureTreePathSet()` resolves the configured branch to a tree SHA via `octokit.git.getRef`, then calls `octokit.git.getTree({ recursive: 'true' })` and caches a per-instance `Set<string>` of every blob path in the repo. `findAndFetchSupportFiles` and `findPageObjectFile` then filter against that set before issuing `getContent`, instead of probe-fetching every candidate path and counting on 404s. The cache is per-`CodeReadingAgent` instance, so each orchestrator run pays the tree fetch at most once. On a truncated tree, `getTree` failure, missing context, or unresolvable branch the helper returns `null` and the methods fall back to legacy probing — every call site treats the tree as a hint, never a hard contract. Net effect on a typical run: ~13–30 round-trips collapse to ~5.

### Investigation agent — `investigation-agent.ts`

**One-liner**: cross-reference analysis with actual code + diffs, produce structured findings, `recommendedApproach`, `selectorsToUpdate`, `isTestCodeFixable`, optional `verdictOverride`.

- **Input**: `{ analysis: AnalysisOutput, codeContext?: CodeReadingOutput }`.
- **Output**: `InvestigationOutput`:
  - `findings[]`: each has whitelisted `type` (`SELECTOR_CHANGE | MISSING_ELEMENT | TIMING_GAP | STATE_ISSUE | CODE_CHANGE | OTHER`) and `severity` (`HIGH | MEDIUM | LOW`).
  - `primaryFinding?`, `isTestCodeFixable`, `recommendedApproach`, `selectorsToUpdate[]`, `confidence`.
  - `verdictOverride?` — `{ suggestedLocation: 'TEST_CODE' | 'APP_CODE' | 'BOTH', confidence, evidence[] }`. Parse-time whitelist; invalid locations cause the entire `verdictOverride` to be dropped.
- **Verdict override gates** (applied in orchestrator immediately after investigation runs):
  - If `verdictOverride.suggestedLocation` is `'APP_CODE'` **or** `'BOTH'` and `verdictOverride.confidence >= VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD` (absolute, 70) → abort repair. The gate deliberately does NOT compare against `analysis.confidence` — analysis confidence measures certainty in a *root-cause category*, override confidence measures certainty in a *defect location*; comparing them apples-to-oranges rejected legitimate product-side overrides whenever analysis happened to be very sure of its (different) categorization. `BOTH` fires the gate just like `APP_CODE` — a product component in the failure means a test-side fix would paper over a real regression either way.
  - If `!isTestCodeFixable` → abort repair unconditionally. The only sanctioned "not test-fixable but proceed anyway" case was a confident product-side override, and the gate above already converts that into an abort.
- **Framework-aware prompt**: WebdriverIO shows `browser.*` command prefix; Cypress shows `cy.*`.

### Fix generation agent — `fix-generation-agent.ts`

**One-liner**: produce `changes[]` with concrete `oldCode` / `newCode` / `changeType`, plus the causal trace and confidence.

- **Input**: `{ analysis, investigation, previousFeedback? }`.
- **Output**: `FixGenerationOutput`:
  - `changes[]`: each `CodeChange` has whitelisted `changeType` (`SELECTOR_UPDATE | WAIT_ADDITION | LOGIC_CHANGE | ASSERTION_UPDATE | OTHER`).
  - `confidence`, `summary`, `reasoning`, `evidence[]`, `risks[]`, `alternatives?`.
  - **`failureModeTrace?`** — four sub-fields: `originalState`, `rootMechanism`, `newStateAfterFix`, `whyAssertionPassesNow`. This is the causal rationale the review agent audits; missing/vague trace is a CRITICAL rejection.
- **System prompt composition** (see `getSystemPrompt` in `src/agents/fix-generation-agent.ts`):
  - `COMMON_PREAMBLE`
  - Framework-specific patterns block from the framework-profile registry (`src/config/framework-profiles.ts`) — `CYPRESS_PATTERNS` for `cypress`, `WDIO_PATTERNS` for `webdriverio`. **Unknown / missing framework gets a framework-NEUTRAL pattern block** (not Cypress) so an unattributed failure isn't pushed toward `cy.*` fixes; `getSystemPrompt` emits a single `core.warning` per agent instance via the `warnedUnknownFramework` flag so the action log doesn't get spammed across the fix/review loop iterations.
  - `COMMON_SUFFIX` containing the JSON output schema + `failureModeTrace` rules + `oldCode` rules (must verbatim-match source)
- **Iteration**: driven by the orchestrator. Each iteration may receive `previousFeedback` from prior review issues or low-confidence / oldCode-validation rejections.

### Review agent — `review-agent.ts`

**One-liner**: approve or reject a proposed fix, auditing changes, trace quality, and PR/product consistency.

- **Input**: `{ proposedFix, analysis, investigation?, codeContext? }` — orchestrator always passes `investigation` and `codeContext` when available.
- **Output**: `{ approved, issues[] (each with severity CRITICAL/WARNING/SUGGESTION), assessment, fixConfidence, improvements? }`.
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
- **Orchestrator integration**: `isBlockingCriticalIssue` helper inspects the issue list for quality-critical issues (trace missing/vague, strictly-stronger logic). From v1.52.4 onward, hitting max iterations without review approval always refuses the fix — the helper is now used to classify the refusal reason (blocking-quality-CRITICAL vs simply-never-approved) and to replay the prior trace into `reviewFeedback` for the next fix-gen iteration. Pre-v1.52.4 the helper also gated a narrow fallback path that has since been removed.

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
| `repoContext?` | The `.adept-triage/context.md` block — rendered into every agent's **user prompt** as a delimited, explicitly untrusted context section (never system instructions). |
| `abortSignal?` | Orchestration-level abort signal — on total-timeout the orchestrator aborts all in-flight agent calls so they stop consuming tokens. |

---

## Prompt composition

### System prompt
For every agent except `CodeReadingAgent` (which doesn't call the LLM), the system prompt is the agent's role + rubric + output schema, unmodified. Fix-gen's system prompt additionally includes the framework pattern block (`CYPRESS_PATTERNS` / `WDIO_PATTERNS` / neutral, ~100 lines of canonical fix patterns) before the JSON schema.

Repo conventions are deliberately **not** in the system prompt. `.adept-triage/context.md` is branch-controlled consumer content, so `BaseAgent.runAgentTask` prepends it to the **user prompt** under a `### Repository conventions (untrusted user context)` header with an explicit instruction to treat it as repo-style evidence only, never system policy. Empty `repoContext` collapses to no-op.

### User prompt

Each agent's `buildUserPrompt` is role-specific but composes these layers when present:

1. `repoContext` (delimited untrusted conventions block, prepended by `BaseAgent.runAgentTask`)
2. `delegationContext` (orchestrator briefing from prior stages)
3. `errorMessage`, diffs, code slices, screenshots metadata
4. `skillsPrompt` (prior-fix memory)
5. Role-specific instructions

### Skill-memory rendering

Four entry points, different framings to prevent anchoring bias:

- **`formatSkillsForPrompt(skills, role, flakiness?)`** — used by orchestrator before analysis/investigation/fix-gen/review. The orchestrator filters the skill list to seeds and validated skills (`isSeed || validatedLocally === true`) before rendering. Role-specific header:
  - `investigation`: "these patterns have been applied before — use as background; do NOT anchor."
  - `fix_generation`: "validated approaches are starting points; use the causal trace as a reasoning template."
  - `review`: "check alignment with prior validated patterns; weaker current trace is a WARNING signal."
- **`formatFailedTrajectoriesForPrompt(skills)`** — negative-evidence block appended for fix-gen and review only: prior fixes on this spec that did NOT validate ("do NOT repeat them unless you can explain why they will succeed now"), sourced from `findFailedTrajectories`.
- **`formatForInvestigation({ framework, spec, errorMessage })`** — used by coordinator to build `investigationContext` passed through as `priorInvestigationContext`. Retrieves via `findRelevantForInvestigation` (seeds + validated only) and filters to skills that have `investigationFindings` set. Top 3 rendered as "Prior investigation for `<spec>` (<date>)".
- **`formatSkillsForClassifierContext(skills)`** — used by coordinator for the classifier context block. Numbered lines of (errorPattern, rootCauseCategory, fix summary, confidence, optional classificationOutcome). Seed skills are explicitly labeled as curated guidance and do not render `classificationOutcome`, even if older seeded rows still carry one. `nonFixable` seeds render a hard directive that the failure needs human action, not a code fix.

**Trace rendering** is gated to avoid feeding "how this fix reasoned" under skills that failed:
- Only for roles `fix_generation` and `review`.
- Only when the skill is validated (`validatedLocally === true` OR `successCount > 0`), and the runtime record hasn't contradicted that (suppressed when `successCount + failCount >= 3` with `successCount === 0` — see the trace-rendering safety net below).
- Each trace sub-field capped at 200 chars.

**Track-record wording** is three-state honest:
- Seed skills → `"curated seed, not runtime outcome evidence"`.
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

The explicit `previousAttempt` block is the only cross-validation-iteration retry memory. The Responses API `previous_response_id` chain is intentionally not carried from one full local-validation attempt into the next, so the next analysis does not inherit hidden model history from a failed path.

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

This is intentional. The removed legacy one-shot path bypassed the investigation agent, review agent, causal-trace enforcement, iterative feedback loop, and the full reasoning-model fix-gen/review pipeline. A weak one-shot fix that happened to pass could be saved as a validated skill and pollute future memory. Failing honestly is safer than creating a low-quality fix.

### Entry point

In `SimplifiedRepairAgent.generateFixRecommendation()` (`src/repair/simplified-repair-agent.ts`):

1. Require an orchestrator. If source-fetch context is missing and no orchestrator can be constructed, log a warning and return `null`.
2. Run `tryAgenticRepair()` → `AgentOrchestrator.orchestrate()`.
3. If agentic returns a fix → return `{ fix, lastResponseId, agentRootCause, agentInvestigationFindings }`.
4. If agentic returns `null` (timeout, no valid fix, investigation abort, review rejection, max iterations) → log `🤖 Agentic repair did not produce an approved fix; no weaker fallback repair path will run.` and return `null`.

### Agentic path — `AgentOrchestrator.orchestrate()`

Happy path (`src/agents/agent-orchestrator.ts`):

1. Wrap the whole pipeline in a `Promise.race` against a `totalTimeoutMs` timer (default **900,000 ms / 15 minutes** — reasoning models can spend minutes per fix-gen/review round). On timeout an `AbortController` shared through `context.abortSignal` cancels all in-flight agent calls so they stop consuming tokens. `BaseAgent.DEFAULT_AGENT_CONFIG.timeoutMs` uses the same value, so inner agent calls share the same budget.
2. **Analysis** — receives `skillsPrompt` pre-rendered with role `investigation` (by design — analysis shares investigation's "don't anchor" framing), filtered to seeds + validated skills. Local-validation retries start analysis fresh from an API-history perspective; they receive prior failure state through the explicit `previousAttempt` context instead.
3. **Code reading** — no LLM, no chaining. Sets `context.sourceFileContent` (line-numbered) and `context.relatedFiles`.
4. **Investigation** — chains to analysis **only** when `analysis.confidence < AGENT_CONFIG.INVESTIGATION_CHAIN_CONFIDENCE` (default **80**). Lower analysis confidence = pull in analysis's reasoning context; higher = start fresh to avoid cascading over-confident analysis.
5. **Verdict gates** — abort repair if `verdictOverride.suggestedLocation` is `APP_CODE` or `BOTH` with confidence `>= VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD` (70, absolute), or if `!isTestCodeFixable` (unconditional).
6. **Fix-gen / review loop** — up to `maxIterations` (default **3**; the local-validation path passes **1** so the outer loop owns the budget). Before each round, a wall-clock budget guard requires at least `MIN_FIX_GEN_BUDGET_MS` (180s) + `MIN_REVIEW_BUDGET_MS` (120s) remaining, otherwise the loop stops early with honest telemetry instead of starting a round it can't finish. Each iteration:
   - Set `delegationContext` and `skillsPrompt` (validated skills + failed-trajectory negative evidence) for fix-gen.
   - Run fix-gen. Fix/review stages intentionally do NOT chain `previous_response_id` — their prompts already carry full prior-stage context.
   - `autoCorrectOldCode` tries to snap near-miss `oldCode` strings to exact source matches (dropping changes it can't match).
   - If confidence `< minConfidence` (default **70**), set `reviewFeedback` and continue.
   - If `requireReview`: run review. Approval requires `review.approved` **and** `review.fixConfidence >= minConfidence`.
   - Approved → return fix with `approach: 'agentic'` and `repair_status=approved`.
   - Not approved → build `reviewFeedback` from issues + (if blocking CRITICAL with prior trace) explicit replay of `previousFix.failureModeTrace` → next iteration.
7. **Max iterations — review approval is mandatory** — if the review loop exhausts its iterations without the review agent approving the last fix, the orchestrator returns an error regardless of the fix's confidence. There is no "ship unapproved but high-confidence fix" fallback. Pre-v1.52.4 there was a narrow fallback that shipped the last high-confidence fix when it had no blocking quality CRITICALs, with a warning that validation was the final gate. That path was removed because it still allowed unapproved fixes to reach validation and skill storage, undermining the agentic-only repair contract. The orchestrator now classifies the refusal reason (`unresolved quality CRITICAL(s)` vs `max iterations reached without review approval`) for telemetry and logs it, but in every case returns `null` up to the coordinator.

All model-produced confidence values are clamped to `0–100` at parse boundaries before they reach gates (`analysis`, `investigation`, `verdictOverride`, `fix_generation`, and `review`).

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
| `fixFingerprint?` | `fixFingerprint(recommendation)` at save | Stable fingerprint of the change set; powers cross-run duplicate detection and reinforcement matching. Missing on legacy skills (they just opt out of the dedupe). |
| `confidence`, `iterations` | Repair loop | At save time. |
| `prUrl` | Coordinator (when PR created) | Trust signal for fix-gen/review; empty when local-only. |
| `validatedLocally` | Coordinator (local path) | Gates classifier retrieval + trace rendering. |
| `priorSkillCount` | `countForSpec` at save | Analytics only (retired-excluded, v1.49.3). |
| `successCount` / `failCount` | `recordOutcome` (atomic `ADD`) | Track record for the `X/Y successful` prompt line + runtime-contradiction gate on causal traces. |
| `retired` | Operator-set via `scripts/audit-skills.ts --retire-flagged` | Excludes from retrieval. Never auto-set by the agent. |
| `classificationOutcome` | `recordClassificationOutcome` | `'correct'` or `'incorrect'`; only `'correct'` written today. |
| `rootCauseChain` | Callers | Short human chain string. |
| `investigationFindings` | `summarizeInvestigationForRetry` | Rendered by `formatForInvestigation`. |
| `repoContext?` | Callers (seeds optional) | Per-skill note; distinct from the global `.adept-triage/context.md`. |
| `failureModeTrace?` | Fix-gen | The 4-field causal trace (v1.48.1/v1.49.1). |
| `failedFixEvidence?` | Coordinator (failed validations) | Structured evidence from the validation failure that falsified this fix (failure signatures, failed assertion, stage). Rendered only as "what did not work," never as a success template. |
| `nonFixable?` | Seed CLI only | Marks the failure pattern as not fixable by code in this repo. A match (`findNonFixableMatch`) short-circuits repair before it starts. |
| **`isSeed?`** | Seed CLI only | Audit-script exemption (skipped by every per-skill maintenance rule) + prompt-framing label (v1.52.0). |

### DynamoDB layout

- **Table**: `triage-skills-v1-live` (configurable via `TRIAGE_DYNAMO_TABLE`).
- **Partition key** `pk` = `REPO#<owner>/<repo>`.
- **Sort key** `sk` = `SKILL#<id>` for skills. The same table also holds durable failure events (`FAILURE#<timestamp>#<runId>`), run-outcome events (`OUTCOME#<timestamp>#<runId>`), and source-run admission-gate records (`TRIAGE_GATE#<sourceRunId>#ATTEMPT#<n>`).
- **Auth**: AWS SDK default provider chain — the action does NOT wire OIDC or reference a role ARN in code. Consumer workflows typically use `aws-actions/configure-aws-credentials@v4` with OIDC before this action runs.
- **No partition cap**. Partitions grow unbounded; manual cleanup via `scripts/audit-skills.ts` is the operator path for trimming the long tail.

### Never-reject contracts

`load()`, `save()`, `recordOutcome()`, `reinforceSkill()`, `recordClassificationOutcome()` ALL have an explicit never-reject contract:

- Errors are caught, logged (warning level), and translated to sentinel states (empty cache, in-memory rollback, skipped update).
- The coordinator awaits these without `.catch(...)` and relies on this — a DynamoDB outage must not take down triage.

### Manual skill lifecycle (no auto-prune, no auto-retire)

As of the manual-skill-lifecycle refactor, the agent does NOT auto-prune or auto-retire any skill. Both behaviors were removed because they were extra DynamoDB round-trips that operators preferred to control directly.

The operator-facing surface is `scripts/audit-skills.ts`, which:

- Flags high-fail-rate skills (`>40%` failure with `≥3` recorded outcomes) as `WARN` with `action: 'retire'`. The thresholds match the old auto-retire heuristic so the manual surface matches what the agent used to do automatically. Operators run `--retire-flagged` to silence them.
- Flags failed trajectories, generic-only legacy skills, noisy `classificationOutcome='incorrect'` rows (use `--clear-noisy-incorrect`), short fix summaries, and duplicate spec+test rows — see [Audit tooling](#audit-tooling). A `--delete-flagged` flag exists for `DELETE`-severity findings, but no current rule emits that severity.
- Skips seeds entirely (`isSeed === true` skips every per-skill rule).

Retirement still has runtime effect: retrieval helpers (`findRelevant` and everything built on it, `findForClassifier`, `findNonFixableMatch`, `countForSpec`) exclude retired skills, so a manual `--retire-flagged` is enough to stop a skill from reaching LLM prompts. `detectFlakiness` intentionally still counts retired skills so the chronic-flakiness gate stays integral on specs whose patterns have all been silenced (it does, however, exclude seeds — a curated seed batch is not runtime fix-attempt evidence).

### Trace-rendering safety net

With auto-retire gone, a skill saved with `validatedLocally: true` will continue to surface even after its runtime track record contradicts its at-save validation. To prevent the prompt from rendering `"Prior causal trace (from a validated fix — use as reasoning template)"` on a skill whose track-record line says `"0/N successful"`, `formatSkillsForPrompt` adds a runtime-contradiction override: when `failCount + successCount >= 3` AND `successCount === 0`, the trace block is suppressed for that skill. All other signals on the skill (track record, error pattern, fix summary) continue to render — only the misleading "use as reasoning template" framing is hidden.

### Retrieval

- **`normalizeSpec`** (v1.52.0) — strips GitHub Actions runner prefixes (Linux `/home/runner/work/<repo>/<repo>/`, Windows `D:\a\<repo>\<repo>\`) and leading `./`. Applied at **write time** in `buildSkill` and at **read time** in `findRelevant`, `findForClassifier`, `detectFlakiness`, `countForSpec`. This is what makes relative-path seeds match runtime absolute-path failures.

| Method | Filter | Scoring / behavior | Limit |
|---|---|---|---|
| `findRelevant({ framework, spec, errorMessage, limit, eligible?, minErrorSimilarity? })` | `!retired` + framework (an `unknown` query framework drops the filter) + optional eligibility predicate; when error text exists, skills below `minErrorSimilarity` score 0 | spec-match `+10`, error-similarity Jaccard × 5 | 5 |
| `findRelevantForInvestigation(...)` | `findRelevant` with `eligible: isSeed \|\| validatedLocally`, `minErrorSimilarity: 0.15` | same | 5 |
| `findFailedTrajectories(...)` | `findRelevant` with `eligible: !isSeed && !validatedLocally && failCount > 0`, `minErrorSimilarity: 0.15` | same — negative evidence for fix-gen/review | 3 |
| `findForClassifier({ framework, spec, errorMessage })` | `!retired` + framework + **`validatedLocally === true`**; error-similarity `< 0.15` scores 0 when error text exists | spec-match `+15`, error-similarity × 5, `+3` recency (lastUsedAt within 7d) | 3 |
| `findNonFixableMatch({ framework, spec, errorMessage })` | `nonFixable === true` + `!retired` + framework + **exact normalized-spec match** | best error similarity `>= 0.3` Jaccard, or no match | 1 |
| `detectFlakiness(spec)` | counts retired, **excludes seeds** | Windowed: `>1` in 3d → flaky; `>2` in 7d → flaky | — |
| `countRecentFailedTrajectories(spec, windowMs)` / `findRecentFailedFingerprints(spec, windowMs)` | `!isSeed` + `!retired` + `validatedLocally === false` + within window (fingerprint variant also requires `fixFingerprint`) | Count / fingerprint list — feeds the recent-failure confidence boost and cross-run dedupe | — |
| `findReinforcementTarget({ spec, testName, fixFingerprint })` | `!retired` + `!isSeed` + same `fixFingerprint` + same normalized spec | prefers exact `testName` match, then recency | 1 |
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

Coordinator calls `RepoContextFetcher.fetch(...)` against the trusted base branch, threads `repoContext` through validator → repair-agent → `createAgentContext({ repoContext })`, and `BaseAgent.runAgentTask` prepends it to every agent's **user prompt** as a delimited untrusted-context block (branch-controlled consumer content never becomes system instructions).

### Seed skills (v1.52.0)

Curated, hand-written skills inserted manually via `scripts/seed-skill.ts`. Purpose: bootstrap the learning loop for a repo before it accumulates its own runtime skills.

Seeds are normal skills with `isSeed: true` and these defaults:

- `validatedLocally: true`
- `successCount: 0`
- `classificationOutcome: 'unknown'`

These defaults make seeds immediately eligible for `findForClassifier` (which requires `validatedLocally === true`) without making them look empirically successful. Prompt renderers label `isSeed` rows as curated operator-provided guidance and suppress `classificationOutcome` for seeds, so a bootstrap exemplar does not overstate runtime evidence. Seeds score the same way as auto-saved skills; the `isSeed` flag affects audit behavior, prompt trust framing, and exclusion from flakiness counts, reinforcement, and failed-trajectory retrieval. A seed may also set `nonFixable: true` to feed the coordinator's non-fixable gate.

**CLI**: `scripts/seed-skill.ts` takes a single file, a directory (recursive), `--list`, or `--remove <id-prefix>`. Validates `SeedInput` shape before inserting. Applies `normalizeSpec` and `normalizeError` the same way `buildSkill` does.

### Audit tooling

`scripts/audit-skills.ts` scans the entire table and flags issues at three severities:

| Severity | Check | Action flag |
|---|---|---|
| WARN | Failed trajectory (`!validatedLocally && !retired`) | `--retire-flagged` |
| INFO | `rootCauseCategory === 'OTHER'` (should be a specific category) | — |
| WARN | Generic-only legacy row (`OTHER` + no findings + `fix.changeType` missing/`OTHER`) | `--retire-flagged` |
| WARN | `classificationOutcome === 'incorrect'` (pre-v1.50.1 noisy writer) | `--clear-noisy-incorrect` |
| INFO | Empty `investigationFindings` | — |
| WARN | Empty or very short fix summary (<20 chars) | — |
| INFO | Stale (>30d no activity) | — |
| WARN | High fail rate (`>40%` with `>=3` recorded outcomes) — retire candidate (replaces the agent's old auto-retire mechanism) | `--retire-flagged` |
| WARN | Duplicate spec+test (older than the most recently used active skill) | `--retire-flagged` |

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

Flow: `iterativeFixValidateLoop` → `LocalFixValidator` clones the target repo into a temp dir, installs deps (`npm ci --ignore-scripts`, npm + Cypress binary caching), runs the multi-attempt baseline check (`VALIDATION_PASS_COUNT = 3`, disposition-based — see below) **before any fix generation**, then per iteration applies the fix, runs `validateFixPasses()` (3 consecutive evidence-bearing passes), and on pass pushes a branch + opens a PR.

`{spec}` and `{url}` in `VALIDATION_TEST_COMMAND` are substituted from `VALIDATION_SPEC` / `VALIDATION_PREVIEW_URL` (or from the `spec` in the dispatch payload).

Hardening in `LocalFixValidator` worth knowing:

- **Env filtering** (`shouldDropEnvVar` / `filterEnv`): test subprocesses get a filtered environment — a hybrid of an explicit deny-list (agent credentials: `GITHUB_TOKEN`, `OPENAI_API_KEY`, `CROSS_REPO_PAT`, `AWS_*`, OIDC request vars, Slack webhook, and their `INPUT_*` mirrors), a categorical credential-name pattern (`TOKEN|SECRET|PASSWORD|KEY|PAT|...`) that catches future credentials without code changes, and a small audited allow-override set for test-needed credentials (`SAUCE_*`, `MAILOSAUR_API_KEY`, `CYPRESS_RECORD_KEY`, `BROWSERSTACK_*`).
- **Spec safety**: the spec path must match a strict pathspec regex (alphanumerics + `_-./`), contain no `..`, and resolve to an existing file inside the clone workdir — a shell-injection defense for log-extracted spec paths interpolated into `execSync`.
- **Test evidence verification** (`verifyTestEvidence`): exit code 0 alone is not proof tests ran (piped runners without `pipefail`, "no spec files found"). Passes without concrete pass evidence are treated as failures so false validations can't poison the skill store.

### Remote path (legacy)

Used when the local conditions aren't met and `ENABLE_AUTO_FIX === 'true'` + `ENABLE_VALIDATION === 'true'`. `attemptAutoFix` first re-checks the blast-radius gate and the cross-run fingerprint dedupe (its only duplicate defense — there's no in-loop fingerprint set on this path), applies the fix via the GitHub API (creates a branch, commits), opens a **draft PR** best-effort, then `triggerValidation` dispatches `VALIDATION_WORKFLOW` (default `validate-fix.yml`) on the target repo, waits for the run (`waitForValidation`), records the structured `ValidationResult`, and finalizes the PR with the validation outcome. `validation_run_id` + `validation_url` are surfaced on the action output.

### Baseline disposition

The baseline runs all `VALIDATION_PASS_COUNT` (3) attempts against the unmodified test and classifies the result:

- `all_failed` — the failure is real; proceed with repair.
- `all_passed` — the original failure was transient; return `fixRecommendation: null` + `iterations: 0`, no fix needed.
- `mixed` — flaky/inconclusive; also skip repair (publishing a fix validated against a flaky baseline would be unsafe).

Because the baseline runs before any fix generation, a transient flake — the modal CI failure — costs three test runs, not a 15-minute multi-agent repair budget.

### Blast-radius confidence scaling

`requiredConfidence(fix, baseMin, { recentFailedTrajectories })` scales up the required confidence based on change scope (`BLAST_RADIUS` in `src/config/constants.ts`):

- `+10` (`SHARED_CODE_BOOST`) if any changed path matches a shared-code fragment (`/pageobjects/`, `/helpers/`, `/commands/`, ...).
- `+5` (`MULTI_FILE_BOOST`) if the fix touches 2+ files.
- `+5` (`GLOBAL_TIMEOUT_BOOST`) if a change introduces a large (≥30s) global timeout that `oldCode` didn't have — wide semantic blast radius even in a single file.
- `+5` (`HELPER_CONTRACT_CHANGE_BOOST`) if a shared-code change makes a helper rethrow where the old code didn't (`newCode` adds `throw`) — every existing caller is affected.
- `+8` per recent failed trajectory on the same spec within 24h (`RECENT_FAILED_TRAJECTORY_BOOST`, capped at `+16`).
- Scaled threshold is capped at `max(baseMin, 95)` — an explicit user floor is never lowered.

`auto_fix_skipped` is set **only** when scaling raised the bar — a fix that fails only the base threshold isn't flagged as "skipped by policy" because no policy kicked in.

---

## Outputs, verdicts, and error contracts

### Verdict values

| Verdict | When |
|---|---|
| `TEST_ISSUE` | Test code problem; may trigger fix recommendation / auto-fix. |
| `PRODUCT_ISSUE` | Real app regression; no fix proposed. |
| `INCONCLUSIVE` | Confidence below threshold, or the infrastructure fast-path fired (session-creation failure); no fix proposed. |
| `TRIAGE_LIMIT_REACHED` | The source workflow attempt already used its triage budget (`TRIAGE_RUN_GATE.MAX_ATTEMPTS = 2`); the run exits without classifying. |
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
| `validation_status` | Both local and remote validation paths | One of `passed | failed | inconclusive | pending | skipped` (`ValidationStatus` in `src/types.ts`). **Authoritative validation signal** (v1.52.9+): `passed` means the fix was validated by the local or remote path independent of `auto_fix_applied`. A `passed` status paired with `auto_fix_applied=false` indicates validation succeeded but publish/PR creation failed. |
| `validation_run_id`, `validation_url` | Remote validation path only | Legacy `workflow_dispatch` path. |
| `auto_fix_skipped`, `auto_fix_skipped_reason` | Intentional auto-fix skip | Chronic flakiness, blast-radius gate, no changes proposed, etc. |
| `repair_status`, `repair_summary`, `repair_details`, `repair_iterations`, `repair_last_stage`, `repair_review_issues` | Always (orthogonal to `verdict`) | v1.52.7+ (v1.52.9 added two values). Repair-pipeline lifecycle outputs built from `RepairTelemetry`, finalized in `finalizeRepairTelemetry`, emitted by `emitRepairOutputs`. `repair_status` ∈ `not_started | skipped | in_progress | no_fix_generated | review_rejected | timed_out | cancelled | no_approved_fix | approved | applied | validated | validated_publish_failed | validated_not_published`. Lets Slack / dashboards tell apart "TEST_ISSUE classified, fix rejected by review", "TEST_ISSUE classified, fix validated and shipped", and "TEST_ISSUE classified, fix validated but publish failed" (the v1.52.9 split). |

### Error contracts

- **`index.ts` top-level catch** — delegates to `setErrorOutput(...)`, which emits the `ERROR` verdict outputs and calls `core.setFailed(...)`. Backstop for anything that escapes the coordinator.
- **`setErrorOutput(reason)`** — used by `handleNoErrorData` when no failure can be located; calls `core.setFailed(reason)`.
- **`setInconclusiveOutput`** — does NOT call `core.setFailed`; the run is a clean pass but the verdict is `INCONCLUSIVE`.
- **Repair-stage isolation** — a throw from `repair()` publishes the already-computed classification with degraded repair telemetry instead of escalating to `ERROR`; repair is best-effort, classification is the product.
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
| `📊 learning-telemetry baseline=<all_failed \| all_passed \| mixed> ...` | Baseline disposition (and duration) for local validation; non-`all_failed` dispositions log `validation=skipped iterations=0`. |
| `📊 learning-telemetry validation=<passed or failed> iteration=N ...` | Local validation test outcome by iteration. |
| `📊 learning-telemetry verdict=<verdict> savedSkillId=<id> validationPassed=<bool> publishSucceeded=<bool> iterations=N` | Connects a saved skill to the verdict, validation, and publish outcomes that produced it (`reinforcedSkillId=` variant when an existing skill was reinforced instead). |
| `📝 Saved validated skill <id>` / `📝 Saved failed skill trajectory <id>` / `📝 Reinforced existing skill <id>` | Skill persisted (or reinforced in place) after a fix attempt. |
| `📝 Skipping skill outcome write ...` | Skill write gated: remote validation still pending, or no terminal validation result. |
| `[<AgentName>] Token usage: N` / `🧮 <model> analysis token usage: N` | OpenAI Responses API usage metadata when the API returns token counts. |

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
| `🔍 Running baseline check — does the unmodified test fail consistently? (requires 3/3 failures to proceed with repair)` | Baseline gate (runs before any fix generation). |
| `✅ Skipping repair — baseline check passed without a fix (failure likely transient).` | `all_passed` disposition — no fix needed. The `mixed` variant logs `baseline mixed results (N pass / M fail)`. |
| `❌ Baseline check confirmed consistent failure — proceeding with fix.` | `all_failed` disposition — real failure. |
| `🧪 Running multi-pass local validation...` / `🧪 Validating applied fix — requires 3 consecutive evidence-bearing passes` | Post-fix validation (`validateFixPasses`). |
| `⏭️  Infrastructure fast-path: <summary>` | Session-creation failure short-circuited to `INCONCLUSIVE` without an LLM call. |
| `⏭️  Non-fixable failure pattern matched (seed <id>): <summary>` | Non-fixable seed gate skipped repair; manual intervention required. |
| `⚠️ FLAKINESS DETECTED: <message>` | A spec is flaky — this same signal drives the chronic-flakiness gate. |
| `⏭️  Chronic flakiness: <message> Auto-fix skipped` | `detectFlakiness` returned `isFlaky`; human follow-up needed. |
| `⏭️ Auto-fix skipped: <reason>` | Blast-radius gate, cross-run fingerprint dedupe, or similar policy withheld a fix. |
| `✅ Source-run triage slot N/2 claimed for workflow <id> attempt <n>` | Source-run admission gate accounting. |

---

## Configuration defaults

Every numeric / string default operators might want to know.

| Setting | Default | Where |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | `70` | `action.yml` input |
| `AUTO_FIX_MIN_CONFIDENCE` | `70` | `action.yml` input |
| `AUTO_FIX_BASE_BRANCH` | `main` | `action.yml` input |
| `PERSIST_RESULTS` | `true` (set `false` to skip all DynamoDB writes, e.g. canary runs) | `action.yml` input |
| `AUTO_FIX.BRANCH_PREFIX` | `fix/triage-agent/` | `src/config/constants.ts` |
| `AUTO_FIX.BRANCH_DEDUPE_WINDOW_MS` | `6h` — an existing fix branch for the same spec within this window refuses a new attempt | `src/config/constants.ts` |
| `TRIAGE_RUN_GATE.MAX_ATTEMPTS` | `2` triage runs per source workflow attempt | `src/config/constants.ts` |
| Flakiness windows | `>1` fix in 3d OR `>2` in 7d (this IS the chronic-flakiness gate — no separate threshold constant) | `src/services/skill-store.ts` `FLAKY_THRESHOLDS` |
| `VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD` | `70` (absolute; fires for `APP_CODE` and `BOTH`) | `src/config/constants.ts` |
| `BLAST_RADIUS.SHARED_CODE_BOOST` | `+10` | `src/config/constants.ts` |
| `BLAST_RADIUS.MULTI_FILE_BOOST` | `+5` | `src/config/constants.ts` |
| `BLAST_RADIUS.GLOBAL_TIMEOUT_BOOST` | `+5` (new ≥30s timeout in `newCode`) | `src/config/constants.ts` |
| `BLAST_RADIUS.HELPER_CONTRACT_CHANGE_BOOST` | `+5` (shared file now rethrows) | `src/config/constants.ts` |
| `BLAST_RADIUS.RECENT_FAILED_TRAJECTORY_BOOST` | `+8` per recent failed trajectory, capped `+16`, 24h window | `src/config/constants.ts` |
| `BLAST_RADIUS.MAX_REQUIRED_CONFIDENCE` | `95` | `src/config/constants.ts` |
| `AGENT_CONFIG.GLOBAL_FIX_ATTEMPT_BUDGET` | `3` (owns the local-validation outer loop; `FIX_VALIDATE_LOOP.MAX_ITERATIONS` aliases it) | `src/config/constants.ts` |
| `FIX_VALIDATE_LOOP.TEST_TIMEOUT_MS` | `900_000` | `src/config/constants.ts` |
| `VALIDATION_PASS_COUNT` | `3` (baseline attempts AND post-fix consecutive passes) | `src/services/local-fix-validator.ts` |
| `AGENT_CONFIG.MAX_AGENT_ITERATIONS` | `3` (remote path; local passes 1 per outer iteration) | `src/config/constants.ts` |
| `AGENT_CONFIG.AGENT_TIMEOUT_MS` | `900_000` | `src/config/constants.ts` |
| `MIN_FIX_GEN_BUDGET_MS` / `MIN_REVIEW_BUDGET_MS` | `180_000` / `120_000` (wall-clock guards before starting a fix/review round) | `src/agents/agent-orchestrator.ts` |
| `BaseAgent.DEFAULT_AGENT_CONFIG.timeoutMs` | `AGENT_CONFIG.AGENT_TIMEOUT_MS` | `src/agents/base-agent.ts` |
| `BaseAgent.DEFAULT_AGENT_CONFIG.maxTokens` | `OPENAI.MAX_COMPLETION_TOKENS` (each agent overrides with its `STAGE_MAX_OUTPUT_TOKENS` entry) | `src/agents/base-agent.ts` |
| `AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE` | `70` | `src/config/constants.ts` |
| `AGENT_CONFIG.INVESTIGATION_CHAIN_CONFIDENCE` | `80` | `src/config/constants.ts` |
| Skill retire-candidate threshold (operator-facing, audit-skills.ts rule 7) | fail rate `> 0.4` with `>= 3` recorded outcomes | `scripts/audit-skills.ts` |
| `REPO_CONTEXT_MAX_CHARS` | `6500` | `src/services/repo-context-fetcher.ts` |
| `OPENAI.MODEL` | `gpt-5.6-sol` — the single production model for every stage (the old `LEGACY_MODEL` / `UPGRADED_MODEL` split is gone) | `src/config/constants.ts` |
| `OPENAI.MAX_COMPLETION_TOKENS` | `24_000` (shared fallback; prefer per-stage ceilings) | `src/config/constants.ts` |
| `STAGE_MAX_OUTPUT_TOKENS` | classification `4000`, analysis `6000`, investigation `8000`, fixGeneration `12000`, review `6000` | `src/config/constants.ts` |
| `AGENT_MODEL.*` (all five stages) | `OPENAI.MODEL` (`gpt-5.6-sol`) | `src/config/constants.ts` |
| `GPT56_CANDIDATE_MODEL` / `GPT56_CANDIDATE_REASONING` | all `gpt-5.6-sol` / all `high` — retained for replay evaluation and canary compatibility via `TRIAGE_MODEL_PROFILE=gpt56-candidate` | `src/config/constants.ts` |
| `REASONING_EFFORT.*` (all five stages) | `high` | `src/config/constants.ts` |
| Model resolution (`resolveAgentModel`) | explicit override (`MODEL_OVERRIDE_FIX_GEN` / `MODEL_OVERRIDE_REVIEW` input) > `TRIAGE_MODEL_PROFILE=gpt56-candidate` env > `AGENT_MODEL` pin. `resolveReasoningEffort` mirrors this and returns `none` for models without reasoning support (`supportsReasoningEffort`: `gpt-5.5*` / `gpt-5.6*`). | `src/config/constants.ts` |
| `PRODUCT_REPO` | `adept-at/learn-webapp` | `action.yml` input |
| `PRODUCT_DIFF_COMMITS` | `5` | `action.yml` input |
| `TRIAGE_AWS_REGION` | `us-east-1` | `action.yml` input |
| `TRIAGE_DYNAMO_TABLE` | `triage-skills-v1-live` | `action.yml` input |
| `DEFAULT_PRODUCT_URL` | `https://learn.adept.at` | `src/config/constants.ts` |

---

## Invariants that must hold

Things that are load-bearing across the codebase. If you break one of these, something silently degrades rather than erroring.

- **`SkillStore` never rejects**. `load()`, `save()`, `recordOutcome()`, `reinforceSkill()`, `recordClassificationOutcome()` all catch and swallow errors (with warnings). The coordinator relies on `await` without `.catch(...)`.
- **`RepoContextFetcher.fetch` never rejects**. 404 and all other errors return `''` and the agent keeps running.
- **`logRunSummary()` runs at every exit**. Wrapped in `try { runClassifyAndRepair(...) } finally { skillStore?.logRunSummary() }` in `execute()`. Guaranteed one summary line per run, even on throw.
- **Bundled-context map keys must be lowercase**. Enforced by a test. `getBundledRepoContext` lowercases its lookup input.
- **Bundled context takes precedence over in-repo context**. For repos in `BUNDLED_REPO_CONTEXTS`, the in-repo `.adept-triage/context.md` is never fetched. This is intentional — adding a repo to the bundle map is an explicit "keep it here" signal.
- **`normalizeSpec` must be applied on both sides of equality**. Seeds write relative paths; runtime writes absolute paths. Without normalization on the read side, seeds are inert.
- **No agent-driven skill mutation beyond save + counter/reinforcement updates**. The agent does not prune, retire, or delete skills (reinforcement only promotes — it never downgrades `validatedLocally`). All cleanup is operator-driven via `scripts/audit-skills.ts`.
- **Seeds are exempted from every per-skill audit rule**. The `isSeed` guard at the top of `audit-skills.ts` skips the entire per-skill check loop — operators must use `scripts/seed-skill.ts --remove` to retire a seed.
- **`validatedLocally: true` on seeds, but no synthetic success counter**. Without `validatedLocally`, seeds would never surface through `findForClassifier`; without the seed prompt label, they would look like runtime-proven memory.
- **Local fix paths must be resolved inside the clone workdir**. `LocalFixValidator` uses `path.resolve(workDir, cleanPath)` and requires the resolved path to start with `${workDir}${path.sep}` so sibling-prefix paths cannot escape.
- **Test subprocesses never see agent credentials**. `filterEnv` applies the explicit deny-list + credential-name pattern (with the audited test-credential overrides) to every `npm` / test-command invocation in `LocalFixValidator`.
- **`pushAndCreatePR` stages only the fix's `changedFiles`**. Scaffold files written during setup (`.npmrc`, env files) must never land in a fix commit; the `git add -A` fallback exists only for legacy callers and explicitly unstages those files.
- **Model confidence values are clamped at parse time**. Gates assume `0–100`; malformed model output must not bypass thresholds.
- **Analysis `rootCauseCategory` is whitelisted at parse time**. A drifting model can't land arbitrary strings that propagate into storage + logs.
- **A product-side `verdictOverride` (`APP_CODE` or `BOTH`) at or above the absolute threshold (70) aborts repair**. It is deliberately NOT compared to `analysis.confidence` — the two confidences measure different things. A not-test-fixable verdict aborts unconditionally.
- **Review approval is parsed safely**. Any CRITICAL issue forces `approved = false` even if the model claims `approved: true`.
- **`sanitizeForPrompt` escapes triple backticks and injection keywords**. Every model-adjacent string goes through it before entering a prompt. Test-runner logs are adversarial.
- **`retired` skills count in `detectFlakiness` but NOT in retrieval**. Retirement means "stop recommending"; flakiness means "stop auto-fixing." Different polarities; different filters.

---

## Known issues (open, salvaged from the May 2026 code review)

- **Unconditional recency boost in `findForClassifier`** (`skill-store.ts`, scoring loop): any skill used within 7 days gets +3 regardless of spec or error relevance, which alone clears the `score > 0` surfacing filter — a recently-used but irrelevant skill can occupy one of the classifier's 3 memory slots.
- **Blank-error Jaccard inflation in `errorSimilarity`** (`skill-store.ts`): `''.split(/\s+/)` yields `['']`, so the empty-set guard never fires and two blank/whitespace error strings score a perfect 1.0 similarity. Any retrieval path comparing two skills that both lack error text (e.g. `findNonFixableMatch`, similarity floors) treats them as identical failures.

---

**Related docs**

- `USAGE_GUIDE.md` — integration cookbook (consumer workflow setup, secrets, matrix jobs).
- `agent-workflow-flowchart.md` — mermaid diagrams of the pipeline.
- `README.md` — entry point + feature overview.
- `RELEASE_PROCESS.md` — bundling + tagging + `v1` rolling tag.
- `README_CROSS_REPO_PR.md` — when a PAT is needed vs `GITHUB_TOKEN`.
- `seeds/DEPLOYED.md` — record of the v1.52.0 context + seed rollout.
