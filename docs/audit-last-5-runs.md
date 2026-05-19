# Triage Agent — Last 5 Completed Runs Audit

**Audit date:** 2026-05-18 (refreshed via parallel explore subagents)
**Scope:** Five most-recent **completed** triage workflow runs (excluding cancellations) across consumer repos.
**Agent versions:** `@v1` rolling tag — SHA `ffa5ad34` (May 12 runs), SHA `2f42d593` (May 13 run).
**Data sources:** GitHub Actions job logs (jobs API), triage-results artifacts (`data.json`), validation-run logs, source code at `/Users/pmerwin/Projects/Adept/adept-triage-agent`.
**Method:** Four parallel readonly subagents (access-code pair, Mailosaur pair, invariant verification, validation deep-dive) plus parent synthesis.

---

## Executive summary

| Metric | Value |
|--------|-------|
| Runs audited | 5 |
| Classification outcomes | 4× `TEST_ISSUE`, 1× `INCONCLUSIVE` |
| Repair attempted | 4 / 5 |
| Review approved (iter 1) | 4 / 4 |
| Branches pushed | 3 / 4 applied fixes |
| Remote validation passed | **0 / 3** |
| `auto_fix_applied` (validated + published) | **0 / 5** |
| PRs opened | **0** (orphan branches by design — see invariants section) |

### Top improvement themes (ranked by impact on fix/validation correctness)

1. **Validation exposes a different failure than the original triage error in every case.** Three pushed fixes failed validation with errors orthogonal to the diagnosed cause (access-code 400 in `before all` hook, unrelated `ArrowDropDownIcon` UI timeout, Mailosaur email never delivered in 120s). Review approved each because the patch was internally coherent for the *triaged* error, not the end-to-end run. Evidence: validation deep-dive on runs `25752951498`, `25752398867`, `25750567013`.

2. **The learning loop is functioning but not changing outcomes.** Run B (`25752503143`) loaded 6 skills including `da37c077` — the failed trajectory saved 12 minutes earlier by run A (`25751919179`) for the *same* spec. Run B's review text even references run A's `ArrowDropDownIcon` failure mode. Review still approved. Confidence dropped only 1 point (90% → 89% nominal). Repair logic does not down-weight prior failed-trajectory skills retrieved from memory.

3. **Stricter setup hooks turn benign API state into hard failures.** Run B's fix introduced `isCodeAlreadyReusableError` substring matching for HTTP 400 — but the actual production reverse API returned `Unable to reverse Access Code in current state`, which the matcher did not include. Validation failed at the new strict before-hook (line 36) without ever reaching the original line-141 assertion path.

4. **Blast-radius gate blocked the better Mailosaur fix by 1 percentage point.** Run D (`25751239010`) at 84% (required 85%) was strictly stronger than the earlier run C (`25750207697`) that shipped at 89% and failed validation. The reviewer in run D explicitly cited C's 120s email timeout as evidence the timeout had to grow — so the agent did improve via memory — but reviewer fix-confidence dropped from 86% to 82% because the fix was bigger. Calibration penalizes thoroughness.

5. **Helper-correctness fixes do not substitute for delivery guarantees.** Run C's Mailosaur fix made `r.items[0].id` empty-search retryable. Validation polled for the full 120s and no email arrived — the real bottleneck is email delivery / bulk-invite dispatch, not the test helper. Fix-gen needs a way to recognize "test waits for external delivery" and propose product-side or fixture-side validation rather than further test patching.

6. **Infra failures are classified well and short-circuit cleanly.** Run `25823303735` correctly returned `INCONCLUSIVE` for a Sauce session-creation timeout in 35s with `repair_status=not_started`, no skill writes, no DynamoDB noise.

**Datadog:** MCP `plugin-datadog-datadog` is **not set up** in this environment; supplementary log shipping was not available. All findings are from GitHub Actions logs + artifacts + source.

---

## Per-run dossiers

### 1. Run `25823303735` — `adept-at/lib-wdio-8-e2e-ts`

| Field | Value |
|-------|-------|
| When | 2026-05-13 20:03 UTC, ~35s |
| Spec | `test/specs/access-codes/redeem.org.access.expire.access.ts` |
| Verdict | `INCONCLUSIVE` (95%) |
| Repair | `not_started` |
| Validation | skipped |

WebdriverIO never created a Sauce Labs session (`POST .../wd/hub/session` timed out ~120s). Agent correctly refused to blame product or test code. Skill telemetry: `loaded=7 surfaced=0 saved=0`. No issues.

---

### 2. Run `25752503143` — `adept-at/lib-wdio-8-e2e-ts` (access-code, run B)

| Field | Value |
|-------|-------|
| When | 2026-05-12 17:57 UTC, ~9m 49s |
| Spec | `test/specs/access-codes/redeem.org.access.expire.access.menu.link.ts` |
| Verdict | `TEST_ISSUE` (95%) |
| Repair | `applied`, 1 iteration, 469s |
| Fix-gen confidence | 90% |
| Reviewer confidence | reviewer text approved |
| Files | spec + `test/helpers/axios.access.code.helper.ts` |
| Validation | failed — run `25752951498` — `Request failed with status code 400` at `before all` hook line 36 |
| Branch | `fix/triage-agent/test-specs-access-codes-redeem-org-acces-20260512-517` @ `3ce86f3` (no PR) |
| Skill saved | `494a46aa` — failed trajectory |
| Flakiness signal | `fixCount=2`, `windowDays=3` (gate at 3) |

**Stage timings:** Analysis 17s → Investigation 67s → Fix-gen 271s → Review 113s.
**Tokens:** ~131k repair pipeline.

**Skill-loop signal (new):** Run B loaded 6 skills (run A loaded 5) — the additional skill is `da37c077`, run A's failed trajectory saved 12 minutes earlier. Run B's review text references run A's downstream `ArrowDropDownIcon` failure but still approves.

**Validation deep-dive:** Validation failed in `before all` because the new helper retried only on 5xx/408/429, and `isCodeAlreadyReusableError` substring list (`already reversed`, `not redeemed`, etc.) did not include the actual production message `Unable to reverse Access Code in current state`. The strict before-hook converted a benign API state into a hard fixture failure that the original (non-strict) hook would have swallowed. The fix never reached line 141.

---

### 3. Run `25751919179` — `adept-at/lib-wdio-8-e2e-ts` (access-code, run A)

| Field | Value |
|-------|-------|
| When | 2026-05-12 17:45 UTC, ~11m 20s |
| Spec | same access-code menu-link spec |
| Verdict | `TEST_ISSUE` (95%) |
| Repair | `applied`, 1 iteration, 499s |
| Fix-gen confidence | 90% |
| Files | spec + `test/helpers/axios.access.code.helper.ts` |
| Validation | failed — run `25752398867` — `[data-testid="ArrowDropDownIcon"]` not displayed after 20s |
| Branch | `fix/triage-agent/test-specs-access-codes-redeem-org-acces-20260512-718` @ `b94a3f3` (no PR) |
| Skill saved | `da37c077` — failed trajectory |

**Validation deep-dive:** First test (`Can fill in code…`) actually passed. Failure was downstream at line 198 on a `waitForDisplayed` for an MUI dropdown icon. After-hook reverse logged the API 400 message and was correctly interpreted as `Code already reversed (expected)` — so the helper's looser `error.response?.status === 400` path worked here. The failure is **unrelated** to the triaged error: it is either an intermittent UI/selector flake on `learn.adept.at` or a regression introduced by the bulk-invite product change. Re-run might pass.

**Cross-run note:** Run A's fix used a different code path than run B's (env override + `reverseAccessCode()` helper). The two runs produced *different* fixes for the same root mechanism within 12 minutes.

---

### 4. Run `25751239010` — `adept-at/lib-wdio-8-multi-remote` (Mailosaur, run D)

| Field | Value |
|-------|-------|
| When | 2026-05-12 17:32 UTC, ~9m 59s |
| Spec | `test/specs/orginvites/invite.org.learner.cancel.ts` |
| Verdict | `TEST_ISSUE` (95%) |
| Repair | `approved` — **not applied** (blast-radius gate) |
| Fix-gen confidence | 84% (required 85%: base 70 + shared-helper +10 + multi-file +5) |
| Reviewer confidence | 82% |
| Files | `test/helpers/multi.mailosaur.ts` + spec |
| Validation | skipped (no branch) |

**Why blocked:** `BLAST_RADIUS.SHARED_CODE_BOOST=10`, `MULTI_FILE_BOOST=5` (`src/config/constants.ts`), formula in `requiredConfidence` (`src/pipeline/validator.ts:450`). Fix confidence 84 < required 85 by 1 point.

**Why this fix is materially better than what shipped earlier (run C):**
- Timeout extended 120s → 300s (run C's failure mode was email arriving past 120s).
- Replaces brittle `message.html.links[1]` with `links.find(href contains 'invite')`.
- `waitUntil` callback validates that the retrieved email actually contains an invite href before assigning `message`.

**Skill-loop signal:** Run D investigated with 4 skills (run C had 3); the additional one was `4557d86b`, run C's failed trajectory. Reviewer noted "prior 120s email timeout" explicitly. Despite using prior failure as evidence, fix-gen confidence dropped 5 points (89% → 84%) and reviewer confidence dropped 4 points (86% → 82%). The "more thorough" fix scored *lower* than the demonstrably-failed earlier version.

---

### 5. Run `25750207697` — `adept-at/lib-wdio-8-multi-remote` (Mailosaur, run C)

| Field | Value |
|-------|-------|
| When | 2026-05-12 17:12 UTC, ~11m 30s |
| Spec | same Mailosaur spec |
| Verdict | `TEST_ISSUE` (95%) |
| Repair | `applied`, 1 iteration, 309s |
| Fix-gen confidence | 89% |
| Reviewer confidence | 86% |
| Validation | failed — run `25750567013` — `Invite email for acceptUser did not arrive within 120s` |
| Branch | `fix/triage-agent/test-helpers-multi-mailosaur-ts-20260512-150` @ `9984381` (no PR) |
| Skill saved | `4557d86b` — failed trajectory |

**Validation deep-dive:** All steps before email wait succeeded (login, batch invite, cancel-one, snackbar success, `200 DELETE`). MultiRemote browsers `b5d51ee4…` + `99f8d23371…`. Mailosaur server `mldolj4x`, recipient `phil+accept-s5d6lu@adept.at`. Helper polled every 10s for the full 120s — fix worked, but no message ever arrived. Cleanup logs `suToken or variables undefined — skipping user removal`, indicating the accept-flow never executed. **Root cause is not in the test helper**; it is upstream email delivery (SES/Mailosaur or the new bulk-invite dispatch path).

---

## Fix-generation findings

### Causal trace quality (v1.51.1 invariant)

All four traces are well-formed: 4 fields populated, cite concrete log values (timestamps, Mailosaur criteria JSON, exact code values, line numbers), no URL-only or background-only text. **Invariant holds.** What traces *do not* capture is end-to-end pass conditions — they explain why the *observed exception* would stop, not whether the test will reach the final assertion under real fixtures.

### Review rigor

- All four repair runs: review approved on iteration 1.
- Reviewers correctly flag concerns (shared hardcoded code, broad 400 acceptance, `links[1]` brittleness, `ArrowDropDownIcon` follow-on risk in run B's review of run A's outcome) but treat them as non-blocking.
- No run produced a second fix-gen iteration.

### Skill retrieval signal

| Run | Loaded | Surfaced | Saved | Notable |
|-----|--------|----------|-------|---------|
| 25823303735 | 7 | 0 | 0 | Inconclusive — no surfacing |
| 25752503143 | 6 | 5 | 1 | Includes `da37c077` (run A's failed trajectory, ~12 min earlier) |
| 25751919179 | 5 | 5 | 1 | Saves `da37c077` |
| 25751239010 | 4 | 4 | 0 | Includes `4557d86b` (run C's failed trajectory, ~20 min earlier) |
| 25750207697 | 3 | 3 | 1 | Saves `4557d86b` |

Memory loop is **wired correctly** (skills surface across runs within minutes) but **does not gate behavior**. A fresh skill flagged `validatedLocally=false` from the same spec hours earlier surfaces in the next run's prompts, and the reviewer text references it, yet repair still proceeds with similar confidence.

### Blast-radius scaling (v1.48.1)

Verified arithmetic: `requiredConfidence` (`src/pipeline/validator.ts:450`) = `AUTO_FIX_MIN_CONFIDENCE` (70 from input) + `SHARED_CODE_BOOST` (10) + `MULTI_FILE_BOOST` (5) = 85. Run D fix-confidence 84 → blocked. Implementation matches `__tests__/pipeline/required-confidence.test.ts:63-74`. **Invariant holds, but the gate considered only file paths and file count, not patch semantic weight (e.g., a global 300s timeout has system-wide blast a 1-line null check does not).**

### Confidence calibration weaknesses

1. **Outcome under-weighting.** A failed-trajectory skill from the same spec retrieved minutes earlier does not lower the next run's fix-confidence in proportion to that signal. Run D's reviewer explicitly cited run C's `120s` failure as motivation for a 300s timeout, yet reviewer confidence *dropped* (86 → 82) because the fix grew. The system penalizes thoroughness instead of rewarding learning.
2. **Path-only blast-radius.** Two runs with different fix shapes (one 1-line nullcheck, one global timeout multiplier) hit the same 85% bar because both touch the same shared file.

### Chronic flakiness gate

`CHRONIC_FLAKINESS_THRESHOLD = 3` (`src/config/constants.ts:191`). Run B's artifact has `flakiness.fixCount=2 windowDays=3` — gate did NOT trigger. With three failed trajectories now in the window for the access-code spec, the next failure on this spec should be gated.

---

## Validation findings

### All three remote validations failed for distinct reasons

| Validation run | Triage | Failure | Class |
|----------------|--------|---------|-------|
| 25752951498 | 25752503143 | `before all` API 400 (line 36) | Fix shortfall — strict hook missing the production 400 message |
| 25752398867 | 25751919179 | `ArrowDropDownIcon` UI timeout (line 198) | Likely unrelated UI flake/regression on `learn.adept.at` |
| 25750567013 | 25750207697 | Mailosaur email never arrived in 120s | Delivery / fixture issue — fix worked, email didn't ship |

### Cross-cutting pattern

Every "passed review, failed validation" case overfits to the *triage narrative* and does not prove end-to-end behavior against the shared production fixture (real access codes, real Mailosaur inbox, real Sauce session timing). The fix-gen + review loop has no oracle for "will this pass on `learn.adept.at`?"

### Correlation reliability

All three validation triggers logged a fallback warning:

```
Validation run correlation fell back to time window for triage_run_id=...
```

Consumer `validate-fix.yml` should set `run-name` to include `triage_run_id` to eliminate the time-window race.

### Publish/validation decoupling (v1.52.9)

| Invariant | Result |
|-----------|--------|
| `auto_fix_applied = applySucceeded && validationPassed` | Holds — all 5 runs `false` |
| `validatedLocally` driven by validation outcome (not `ApplyResult.success`) | Holds — three failed-trajectory writes show `validationPassed=false publishSucceeded=true` |
| Skill writes only on terminal validation states | Holds |
| `validated_publish_failed` reserved for validation-pass + publish-fail | Not exercised — no validations passed in this window |

### Multi-pass baseline (v1.50.1)

Not exercised in this window (no "no fix needed" path).

### Orphan-branch behavior (closes prior open question)

`pushAndCreatePR` (which calls `octokit.pulls.create`) lives in `src/services/local-fix-validator.ts:524` and is **only invoked by the local-validation pass path** (`src/pipeline/validator.ts:322`). The remote-validation path uses `src/repair/fix-applier.ts`, which creates a branch via `git.createRef` + commits but contains **no `pulls.create` call**. **Orphan branches on the remote-validation path are intentional architecture, not a bug.** Engineers must currently open PRs manually for remote-validated fixes.

---

## Architecture invariants — verified

| Invariant | Status | Evidence |
|-----------|--------|----------|
| v1.52.4 — review approval before ship | Pass | `Fix APPROVED by Review Agent on iteration 1` in all 4 repair runs (`src/agents/agent-orchestrator.ts:744`); orchestrator refuses unapproved ship at line 819 |
| v1.52.5 — skill-write gating on terminal validation | Pass | Run D logs `Skipping skill outcome write because no validation attempt produced a terminal result` (`src/pipeline/coordinator.ts:464`) |
| v1.52.9 — publish/validation decoupling | Pass | `fixFullyAccepted = applySucceeded && validationPassed` (`src/pipeline/output.ts:228`); `validatedLocally: validationPassed` (`coordinator.ts:503`) |
| v1.51.1 — causal trace quality | Pass | All 4 traces concrete and causal |
| v1.48.1 — blast-radius scaling | Pass | Run D 84 < 85 = 70 + 10 + 5 (`validator.ts:450` + `constants.ts:206-230`) |
| v1.50.1 — 3-pass baseline | N/A | Not exercised |
| Chronic flakiness gate | Pass | `fixCount=2 < threshold=3`; gate did not trigger |
| Orphan branch / no PR on remote path | Confirmed intentional | `pulls.create` only in `local-fix-validator.ts:524`; `fix-applier.ts` has none |

---

## Recommendations

### P0 — Validation effectiveness

| # | Recommendation | File / Module |
|---|----------------|---------------|
| 1 | **Open a draft PR after every remote-validation run regardless of outcome**, labeled with `validation_status`. Engineers cannot review orphan branches today. | `src/repair/fix-applier.ts` (add `pulls.create` post-push) |
| 2 | **Fixture preflight before push.** For shared-fixture failures (access-code reverse, Mailosaur reachability), run a sanity check; if reset returns 400 with a non-allowlisted message, mark the fix as `fixture_state` and skip push. | New helper invoked from `coordinator.ts` repair path |
| 3 | **`validate-fix.yml` `run-name` includes `triage_run_id`.** Eliminates time-window correlation fallback warning logged on every run. | Consumer `validate-fix.yml` files |

### P1 — Fix-gen and review logic

| # | Recommendation | File / Module |
|---|----------------|---------------|
| 4 | **Prior-failed-trajectory penalty.** When a skill flagged `validatedLocally=false` for the same spec is retrieved within N hours, scale fix-gen confidence down (e.g., -10 per recent failed trajectory) before the blast-radius gate. The signal exists but doesn't change behavior today. | `src/services/skill-store.ts` retrieval scoring or `src/pipeline/coordinator.ts` confidence adjustment |
| 5 | **Hook-strictness symmetry rule.** When fix-gen makes a `before` hook strict, require review to verify any allow-list / message-classifier matches what the matching `after` hook accepts. Run B's `before` allow-list missed the `Unable to reverse... in current state` message that the existing `after` hook handled. | `src/agents/review-agent.ts` system prompt |
| 6 | **Semantic blast-radius factors.** Add boosts for global timeout multipliers and for changes that affect every caller of a helper, not only file-path matching. Run D's 300s suite-wide timeout has more system blast than file-count alone captures. | `src/pipeline/validator.ts` `requiredConfidence` + `src/config/constants.ts` `BLAST_RADIUS` |
| 7 | **Branch dedupe within window.** If a `fix/triage-agent/<spec-hash>*` branch was pushed in the last 6 hours for the same spec, abort fix-gen or reuse the existing branch. Run A and run B produced two competing branches for the same spec 12 minutes apart. | `src/repair/fix-applier.ts` pre-push check |
| 8 | **Delivery-vs-helper detector.** When the original failure is a `waitUntil` polling external delivery (Mailosaur, SQS, webhook), require the fix to address either delivery SLA or fixture provisioning, not only the helper's null-check. | `src/agents/fix-generation-agent.ts` system prompt |

### P2 — Operational hygiene

| # | Recommendation | File / Module |
|---|----------------|---------------|
| 9 | **Lower chronic-flakiness threshold from 3 to 2 with a `warn` action** between runs (still applies fix at 2, blocks at 3). Today the warning at `fixCount=2` is invisible to operators. | `src/config/constants.ts:191` + `src/pipeline/coordinator.ts:412` |
| 10 | **INCONCLUSIVE fast-path for session-creation / infra errors.** Skip DynamoDB and OpenAI cost when `Failed to create a session` is detected. | `src/pipeline/coordinator.ts` early classification |
| 11 | **Surface `repair_status` in artifact `data.json`.** The 5 artifacts inspected do not include top-level `repair_status` / `repair_iterations` etc. — only inside the embedded `TRIAGE_JSON` blob. Slack / dashboards reading the artifact alone miss the lifecycle. | Consumer artifact step (the `jq` slice) |

### P3 — Observability

| # | Recommendation | File / Module |
|---|----------------|---------------|
| 12 | Configure Datadog log shipping for `skill-telemetry`, `learning-telemetry`, per-agent timing lines. Cross-run analysis would have been faster with structured queries. | Org observability + Datadog MCP setup |

---

## Open questions

1. Should run B have refused to fix-gen at all, given run A's failed trajectory was already in DynamoDB at run B's start (12 minutes prior)?
2. Is the `Unable to reverse Access Code in current state` 400 message a recoverable test-data state requiring a fresh code (best handled as a `nonFixable` seed) rather than continued patching?
3. The `ArrowDropDownIcon` failure in run A's validation — is it real on `learn.adept.at` today, or a one-off Sauce/MUI flake? Worth a manual rerun.
4. Should the agent be allowed to fix the *email-delivery* problem on the product side (open a PR to the product repo), or is that always out of scope?
5. Why is reviewer confidence drifting *down* (run C 86 → run D 82) when memory shows the previous fix failed? Should the prompt signal "your prior fix failed validation, this one addresses it" as a confidence boost rather than a blast-radius penalty?

---

## Appendix: run + validation links

| Run ID | Repo | Validation | Branch |
|--------|------|------------|--------|
| [25823303735](https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/runs/25823303735) | lib-wdio-8-e2e-ts | none | none |
| [25752503143](https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/runs/25752503143) | lib-wdio-8-e2e-ts | [25752951498](https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/runs/25752951498) | `...20260512-517` |
| [25751919179](https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/runs/25751919179) | lib-wdio-8-e2e-ts | [25752398867](https://github.com/adept-at/lib-wdio-8-e2e-ts/actions/runs/25752398867) | `...20260512-718` |
| [25751239010](https://github.com/adept-at/lib-wdio-8-multi-remote/actions/runs/25751239010) | lib-wdio-8-multi-remote | skipped (gate) | none |
| [25750207697](https://github.com/adept-at/lib-wdio-8-multi-remote/actions/runs/25750207697) | lib-wdio-8-multi-remote | [25750567013](https://github.com/adept-at/lib-wdio-8-multi-remote/actions/runs/25750567013) | `...mailosaur-ts-20260512-150` |

**Orphan branches (no PR by design — see invariants):**
- `fix/triage-agent/test-specs-access-codes-redeem-org-acces-20260512-517`
- `fix/triage-agent/test-specs-access-codes-redeem-org-acces-20260512-718`
- `fix/triage-agent/test-helpers-multi-mailosaur-ts-20260512-150`

---

## Method note

This audit was produced by four parallel readonly explore subagents:
- Access-code pair (runs `25751919179` + `25752503143`)
- Mailosaur pair (runs `25751239010` + `25750207697`)
- Architecture invariant verification (all 5 runs vs source)
- Validation-failure root-cause deep-dive (3 failed validation runs)

Per workspace rules, subagent output was treated as reconnaissance and verified against source-code citations and log line numbers before incorporation. Each finding above ties to either a log line in `/tmp/triage-audit/<id>.log`, a field in the corresponding `data.json` artifact, or a file:line in the agent source.
