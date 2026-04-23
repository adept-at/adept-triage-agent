# GPT-5.4 Upgrade Plan — v1.51.0 Targeted

> **Status:** Design — pre-implementation. No code changes until this doc is signed off.
>
> **Supersedes** `docs/opus-4-7-integration-plan.md` (shelved). Also supersedes the hybrid variant of this plan that proposed Pro on classification + review. Current scope is narrower and evidence-driven.

---

## Philosophy

**Upgrade only where observed quality falls short. Leave everything else alone.**

Current state: every agent runs on `gpt-5.3-codex` via a single hard-coded `OPENAI.MODEL` constant. No agent sends `reasoning_effort` on Responses-API calls.

From runtime audit of wdio-9-bidi-mux3 triage run `24835972873` (spec: `skill.video.transcripts.ts`):

- **Classification, Analysis, Investigation all performed correctly.** Classification nailed the cross-browser hard rule at 95% confidence. Analysis produced the right `DATA_DEPENDENCY` root cause at 96%. Investigation handed fix-gen two valid architectural options and clearly preferred the stronger one.
- **Fix-generation picked the weaker of the two options investigation offered.** Investigation's preferred path was "select a known transcript-enabled video by stable id/title." Fix-gen implemented the alternative — "handle both empty and populated states" — a broader, more defensive fix that works but blurs test intent.
- **Review caught it but did not veto.** Review's own output contains: *"does not implement the investigation's preferred determinism path. Test intent may drift from strict transcript-functionality validation into mixed availability validation."* Correct reasoning, inadequate gating — the finding shipped as a WARNING, not a CRITICAL.

**Thesis:** the two agents where reasoning quality observably falls short are **fix-generation** and **review**. Upgrade only those to `gpt-5.4` with `xhigh` reasoning effort. Classification, analysis, investigation, and single-shot repair stay on `gpt-5.3-codex`.

### Why `xhigh` (not `high`) on fix-gen

The prior hybrid-plan draft argued for `high` effort on fix-gen because HumanEval benchmarks favor less-reasoning models for pure code production (standard 5.4 at 95% vs Pro at 86%). That argument was framed around **Pro vs standard**, not `high` vs `xhigh` within a single model.

The wdio failure is not a code-production failure. Fix-gen wrote syntactically valid, functionally correct TypeScript. The failure was architectural judgment — picking between two valid implementations when one is cleaner. That is reasoning-depth territory, which is exactly what `xhigh` is for.

Cost: `xhigh` generates roughly 2× the reasoning tokens of `high`. Token budget and wall-clock implications are covered under Risks.

### Why `xhigh` on review

Review is the terminal quality gate. The v1.48.1 CRITICAL rules (trace audit, strictly-stronger logic) already exist; the wdio case shows review's reasoning was correct but its gating threshold was too lenient for a borderline-quality fix. `xhigh` gives review more compute to apply the strictly-stronger test rigorously and to escalate architectural-fit concerns from WARNING to CRITICAL.

### Safety invariants (non-negotiable)

1. **Single-commit rollback.** Both model IDs + effort values live in `src/config/constants.ts`. Reverting `AGENT_MODEL.fixGeneration` and `AGENT_MODEL.review` back to `'gpt-5.3-codex'` and setting their effort back to `'none'` removes all behavior changes in one commit.
2. **No prompt changes in this release.** Every prompt that runs on 5.4 is exactly the prompt it runs on 5.3-codex today. If we change the model *and* the prompts in one release we cannot attribute quality changes.
3. **Per-agent per-repo override via action inputs.** Two new inputs — `MODEL_OVERRIDE_FIX_GEN` and `MODEL_OVERRIDE_REVIEW` — let any consumer pin either agent back to `gpt-5.3-codex` without waiting for a code release if the upgrade regresses on their repo. Independent knobs, not all-or-nothing.
4. **Test suite unchanged.** No existing test asserts on model ID or reasoning-effort value. All 643 tests should pass as-is.

---

## LLM surface audit

Seven surfaces total in the codebase (six use LLMs). Only two change in this release.

| # | Surface | File | Role | Called | v1.50.x Model | v1.51.0 Model | v1.51.0 Effort |
|---|---|---|---|---|---|---|---|
| 1 | Top-level classification | `src/simplified-analyzer.ts` `analyzeFailure` | Judgment — TEST_ISSUE/PRODUCT_ISSUE/INCONCLUSIVE verdict | Every triage run | `gpt-5.3-codex` | **unchanged** | none |
| 2 | Analysis agent | `src/agents/analysis-agent.ts` | Judgment — root cause, selectors, issue location | Agentic repair | `gpt-5.3-codex` | **unchanged** | none |
| 3 | Code-reading agent | `src/agents/code-reading-agent.ts` | Deterministic, no LLM | — | — | — | — |
| 4 | Investigation agent | `src/agents/investigation-agent.ts` | Judgment — `verdictOverride`, `recommendedApproach`, selectorsToUpdate | Agentic repair | `gpt-5.3-codex` | **unchanged** | none |
| 5 | **Fix-generation** | `src/agents/fix-generation-agent.ts` | Mixed — code diffs + approach selection | Agentic repair, 1–3× per repair | `gpt-5.3-codex` | **`gpt-5.4`** | **`xhigh`** |
| 6 | **Review** | `src/agents/review-agent.ts` | Terminal quality gate, CRITICAL rules | Agentic repair, 1–3× per repair | `gpt-5.3-codex` | **`gpt-5.4`** | **`xhigh`** |
| 7 | Single-shot repair | `src/repair/simplified-repair-agent.ts:953` | Worker fallback when agentic disabled/fails | Rare | `gpt-5.3-codex` | **unchanged** | none |

**Net: 2 of 6 LLM-using surfaces move.** Four judgment surfaces (classification, analysis, investigation, single-shot) stay on 5.3-codex by design.

---

## Why only fix-gen and review (evidence-driven scope)

### Classification stays on 5.3-codex
Every triage run hits it; a wrong verdict routes the whole pipeline wrong. **But** on the wdio audit and on most recent runs, classification output is already strong (95% confidence with correct verdict applying the v1.48.2 cross-browser hard rule). Upgrading would spend reasoning budget on an agent that is not the observed bottleneck. Keep the option open for v1.52+ if metric #1 (confidence ≥ 80 rate) fails to move.

### Analysis stays on 5.3-codex
Analysis produces `rootCauseCategory` + selectors; its output feeds investigation and fix-gen downstream, both of which are verifiers. Since there are downstream checks that catch weak analysis, the marginal value of upgrading is lower than for gates without a verifier. Observed wdio output was correct (DATA_DEPENDENCY, 96% confidence).

### Investigation stays on 5.3-codex
Investigation's `verdictOverride` is high-leverage (can abort the repair), but on the wdio case investigation produced the right answer — the gap was fix-gen not following it. Upgrading investigation without upgrading fix-gen wouldn't have changed the outcome. If future audits show investigation missing APP_CODE overrides, reconsider.

### Fix-gen upgrades (bottleneck #1)
On the wdio case, fix-gen chose the less-ideal of two architecturally-valid options. Investigation's preferred option was cleaner (narrow test intent, deterministic fixture selection). Fix-gen defaulted to the broader/safer option. That is a **reasoning gap**, not a code-writing gap. `xhigh` effort targets exactly this kind of architectural-choice decision.

### Review upgrades (bottleneck #2)
Review's reasoning on the wdio case was correct — it identified the exact architectural concern. The gating threshold was too lenient: the correct finding landed as WARNING instead of CRITICAL. `xhigh` on review gives it more compute to apply the strictly-stronger-logic test and escalate borderline-quality fixes.

### Single-shot stays on 5.3-codex
Rare fallback path, explicitly degraded-quality by design. Not worth upgrading until the agentic path is proven stable on 5.4.

---

## Integration architecture

One provider (OpenAI), two models (`gpt-5.3-codex` legacy, `gpt-5.4` upgraded), per-agent routing.

### 1. `src/config/constants.ts` — model + effort routing

```typescript
/** OpenAI API configuration */
export const OPENAI = {
  /**
   * Legacy model — default for all agents that did not upgrade in v1.51.0.
   * Also kept as `MODEL` alias (same value) to preserve backward compatibility
   * with existing test and script references — see note below on test
   * invariant preservation.
   */
  LEGACY_MODEL: 'gpt-5.3-codex',
  /**
   * @deprecated Use LEGACY_MODEL. Kept as an alias (same value) so existing
   * references in __tests__/openai-client.test.ts and scripts/test-model-local.ts
   * continue to compile and pass unchanged. Remove in a future cleanup release
   * once callers migrate.
   */
  MODEL: 'gpt-5.3-codex',
  /** Upgraded model — used by fix-gen + review only in v1.51.0 */
  UPGRADED_MODEL: 'gpt-5.4',
  /**
   * Maximum completion tokens — bumped from 16384 for xhigh headroom on the
   * two upgraded agents. Note: this is a GLOBAL cap; unchanged agents see
   * the same higher ceiling. This is a cap on response size, not on prompt
   * or behavior, so unchanged agents remain functionally bit-exact — they
   * just gain headroom they won't use.
   */
  MAX_COMPLETION_TOKENS: 24000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
} as const;

/**
 * Per-agent model selection. Entries explicitly name the legacy model
 * for unchanged agents so reverting the upgrade is a one-line edit
 * (flip AGENT_MODEL.fixGeneration and AGENT_MODEL.review back to
 * OPENAI.LEGACY_MODEL).
 */
export const AGENT_MODEL = {
  classification: OPENAI.LEGACY_MODEL,
  analysis: OPENAI.LEGACY_MODEL,
  investigation: OPENAI.LEGACY_MODEL,
  fixGeneration: OPENAI.UPGRADED_MODEL,
  review: OPENAI.UPGRADED_MODEL,
  singleShot: OPENAI.LEGACY_MODEL,
} as const;

/**
 * Per-agent reasoning effort. 'none' means no `reasoning` field in the
 * Responses-API call — bit-exact with today's pre-v1.51 behavior. Only
 * the upgraded agents send an effort value.
 */
export const REASONING_EFFORT = {
  classification: 'none',
  analysis: 'none',
  investigation: 'none',
  fixGeneration: 'xhigh',
  review: 'xhigh',
  singleShot: 'none',
} as const;

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
```

### 2. `src/openai-client.ts` — accept model + effort per call

Both `analyze()` (used by classification) and `generateWithCustomPrompt()` (used by every other agent) accept optional `model` and `reasoningEffort` parameters. Defaults preserve today's behavior bit-exactly.

```typescript
async generateWithCustomPrompt(params: {
  systemPrompt: string;
  userContent: string | Array<…>;
  responseAsJson?: boolean;
  previousResponseId?: string;
  model?: string;                       // NEW — per-call override
  reasoningEffort?: ReasoningEffort;    // NEW
}): Promise<{ text: string; responseId: string }> {
  const model = params.model ?? OPENAI.LEGACY_MODEL;
  const effort = params.reasoningEffort ?? 'none';

  const response = await this.openai.responses.create({
    model,
    instructions: params.systemPrompt,
    input,
    max_output_tokens: OPENAI.MAX_COMPLETION_TOKENS,
    ...(effort !== 'none' ? { reasoning: { effort } } : {}),  // gate on 'none'
    text: params.responseAsJson ? { format: { type: 'json_object' } } : undefined,
    ...(params.previousResponseId ? { previous_response_id: params.previousResponseId } : {}),
  });
  // ...
}
```

When `effort === 'none'`, the `reasoning` field is omitted entirely — the call shape is identical to today for the four unchanged agents.

### 3. Per-agent wiring

Each agent's constructor reads its defaults from the centralized maps. `AgentConfig` in `base-agent.ts` gains `model?: string` and `reasoningEffort?: ReasoningEffort`. `base-agent.ts` threads them into every `generateWithCustomPrompt` call.

```typescript
// FixGenerationAgent constructor:
constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>) {
  super(openaiClient, 'FixGenerationAgent', {
    ...config,
    model: config?.model ?? AGENT_MODEL.fixGeneration,                   // 'gpt-5.4'
    reasoningEffort: config?.reasoningEffort ?? REASONING_EFFORT.fixGeneration,  // 'xhigh'
  });
}

// ReviewAgent constructor:
constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>) {
  super(openaiClient, 'ReviewAgent', {
    ...config,
    model: config?.model ?? AGENT_MODEL.review,                          // 'gpt-5.4'
    reasoningEffort: config?.reasoningEffort ?? REASONING_EFFORT.review, // 'xhigh'
  });
}
```

The other four agents inherit the legacy defaults; no constructor change required if we keep `AgentConfig` defaults bound to `AGENT_MODEL[agentKey]` and `REASONING_EFFORT[agentKey]`.

`simplified-analyzer.ts` (classification) passes the legacy defaults explicitly when calling `openaiClient.analyze()` so the call shape is unchanged from today.

### 4. `action.yml` — two per-repo rollback inputs

```yaml
inputs:
  MODEL_OVERRIDE_FIX_GEN:
    description: >
      Optional override for the fix-generation agent model. When set
      (e.g. "gpt-5.3-codex"), fix-gen reverts to this model without
      requiring a new release. Use for per-repo rollback if the v1.51
      upgrade regresses fix quality on your repo.
    required: false
    default: ''
  MODEL_OVERRIDE_REVIEW:
    description: >
      Optional override for the review agent model. Same rollback
      mechanism as MODEL_OVERRIDE_FIX_GEN, independent. Set both to
      revert the entire v1.51 upgrade on this repo.
    required: false
    default: ''
```

Two independent knobs so we can roll back fix-gen without touching review, or vice versa. If we learn that `xhigh` on fix-gen is too slow but review is fine, we change one input.

**Effort auto-resets on override.** When `MODEL_OVERRIDE_FIX_GEN` (or `MODEL_OVERRIDE_REVIEW`) is set to a non-`gpt-5.4` model, the agent's reasoning effort must automatically reset to `'none'` — otherwise we'd send `reasoning: { effort: 'xhigh' }` to `gpt-5.3-codex`, which either errors or silently ignores the field depending on SDK version. Implement this in the agent's constructor: if `config.model !== OPENAI.UPGRADED_MODEL`, force `config.reasoningEffort = 'none'`. One line per agent, tested in Phase 0 smoke.

### 5. Deprecation comment update

Line 633 of `openai-client.ts` currently says:
> *"temperature parameter is accepted for backward compatibility but is not supported by Codex models and will be ignored."*

Updated:
> *"temperature parameter is accepted for backward compatibility but is not supported by reasoning-class models (`gpt-5.3-codex`, `gpt-5.4`) that do not expose a `temperature` parameter. The value will be ignored."*

No behavior change, accurate documentation.

### Not changing

- **Prompts.** All system prompts stay as-is.
- **Tests.** 643/643 pass unchanged.
- **API surface.** Still Responses API, still `previous_response_id` chaining.
- **Confidence thresholds, blast-radius caps, chronic-flakiness gate.** All untouched.
- **Four of six LLM surfaces.** Bit-exact with today.

---

## Risks and mitigations

### R1 — Fix-gen confidence distribution shift
5.4's self-reported fix confidence may be calibrated differently from 5.3-codex. If 5.4 is systematically more confident, more fixes cross `AUTO_FIX.DEFAULT_MIN_CONFIDENCE` and ship — a quality win if correct, a regression if overconfident.

**Mitigation:** instrument confidence distribution on the canary for the first 50 fix-gen calls. If p50 shifts by more than 5 points, recalibrate `AUTO_FIX.DEFAULT_MIN_CONFIDENCE` in v1.51.1. Do not pre-adjust; let data decide.

### R2 — Token budget at xhigh
`xhigh` generates roughly 2× the reasoning tokens of standard calls. Review at `xhigh` on a multi-file fix could approach the 16384 `MAX_COMPLETION_TOKENS` cap. Preemptively bumped to 24000 in this plan. 5.4's actual cap is 128K so we have headroom if 24K turns out to be insufficient.

### R3 — Repair-path latency (primary operational risk) — **TIMEOUT ARCHITECTURE MATTERS**
`xhigh` is slower than today's no-effort calls. Fix-gen (1–3 iterations) + review (1–3 iterations) both using `xhigh` means repair-path wall-clock grows, and **this plan changes the math on the existing orchestrator timeout**.

**Current timeout architecture (as-is in `agent-orchestrator.ts:147`):**
- `DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs = 120000` (120s) — wraps the **entire** `orchestrate()` call via `Promise.race`. Covers analysis + code-reading + investigation + N iterations of fix-gen + review.
- `DEFAULT_AGENT_CONFIG.timeoutMs = 60000` (60s) — per-agent cap on a single call.

**Rough expectation at xhigh:**
- Today: analysis ~15s, code-reading ~5s, investigation ~15s, fix-gen ~20s/iter, review ~10s/iter
- At xhigh: fix-gen ~35s/iter, review ~25s/iter (reviewer's back-of-envelope; confirm in benchmark)
- **2-iteration repair: ~15 + ~5 + ~15 + (2 × ~35) + (2 × ~25) ≈ ~155s** → blows the 120s pipeline ceiling
- **3-iteration worst case: ~245s** → ~2× over ceiling

This plan therefore requires a **pipeline-timeout bump** alongside the model/effort change, or xhigh runs will time out on normal (non-worst-case) 2-iteration repairs.

**Required mitigation (part of the v1.51.0 release):**
1. Bump `DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs` from 120000 → **300000** (5 min). Fits 3-iter xhigh at ~245s with margin.
2. Confirm `DEFAULT_AGENT_CONFIG.timeoutMs` (60s per-agent) is still enough for a single xhigh call via pre-launch benchmark (open question #3). If a single call approaches 60s at p95, bump this too — probably to 90000.
3. Canary measures per-agent p95 wall-clock for first 3 days.
4. If a single upgraded agent p95 exceeds its per-agent cap → downgrade that agent from `xhigh` to `high` (keep 5.4, drop effort) in v1.51.1.
5. If still a problem at `high` → revert that agent via `MODEL_OVERRIDE_*` and investigate.

**Test suite invariant re: timeout:** no existing test asserts on these timeout values, so bumping them is behaviorally-additive (higher ceilings, no failure-mode change). Verify during implementation.

### R4 — JSON mode on `gpt-5.4`
`text: { format: { type: 'json_object' } }` must work on 5.4. Standard 5.4 supports structured output (unlike Pro, which had hedged documentation); expected to work. Verify pre-launch with one call.

### R5 — Knowledge cutoff drift
5.4's knowledge cutoff differs from 5.3-codex. Our prompts reference stable technologies (Cypress, WebDriverIO, GitHub Actions, OpenAI API) with no dependence on post-2025 details. Low risk; visual read-through of fix-gen + review prompts pre-canary as defense in depth.

### R6 — Rate limits
5.4 has a different per-tier RPM ceiling than 5.3-codex. Under burst traffic (large canary failure cluster), we could see 429s. Existing `MAX_RETRIES=3` with exponential backoff handles transients; confirm org tier supports 5.4 at expected RPM.

### R7 — Prompt regression from model change
Prompts were tuned against reasoning-model semantics and should port cleanly to 5.4, but framework-specific patterns (`WDIO_PATTERNS`, `CYPRESS_PATTERNS`) have not been validated on 5.4. Canary on both frameworks in parallel (`lib-cypress-canary` + `lib-wdio-8-e2e-ts`) mitigates.

### R8 — Fix-gen ↔ review chain continuity across model
The v1.48.1 trace-replay feedback path chains via `previous_response_id`. Both agents upgrade to the same model in this release, so the chain stays within 5.4 — no cross-model chaining. Expected to work; include a chain-aware fixture in local smoke test.

---

## Phased rollout

### Phase 0 — this weekend

- [ ] Sign off on this doc
- [ ] Implement the five code changes (constants + maps, openai-client plumbing, agent wiring via `base-agent.ts`, `action.yml` inputs, deprecation comment)
- [ ] Run full test suite — expect 643/643 (no test asserts on model ID or effort value)
- [ ] Local smoke test on a known-failing fixture:
  - Fix-gen request uses `gpt-5.4` and `reasoning: { effort: 'xhigh' }`
  - Review request uses `gpt-5.4` and `reasoning: { effort: 'xhigh' }`
  - Classification, analysis, investigation, single-shot all still use `gpt-5.3-codex` with no `reasoning` field
  - JSON responses parse cleanly on 5.4
  - Fix-gen → review chain survives the model boundary within 5.4
- [ ] Ship as **v1.51.0** (minor — substantive capability change, not a bugfix)

### Phase 1 — canary (Monday onward)

Two canary repos in parallel to cover both supported frameworks:

- **`lib-cypress-canary`** — Cypress framework
- **`lib-wdio-8-e2e-ts`** — WebDriverIO framework (home of redeem.org and transcript patterns)

Unlike the shelved Opus plan, there is no `OPUS_AGENTS` toggle. Upgrade is per-release. Per-repo rollback is via `MODEL_OVERRIDE_FIX_GEN` / `MODEL_OVERRIDE_REVIEW`.

- [ ] Ship v1.51.0 globally (every repo on `@v1` picks it up)
- [ ] Monitor both canaries daily for 3 days:
  - Metric #4 (first fix-gen iteration pass rate) — most sensitive to fix-gen quality change
  - Metric #3 (review CRITICAL true-positive rate) — most sensitive to review quality change
  - Per-agent p95 wall-clock (R3)
- [ ] If metric #4 drops ≥ 10pp on either canary: set `MODEL_OVERRIDE_FIX_GEN=gpt-5.3-codex` on that canary, investigate
- [ ] If metric #3 drops (fewer CRITICALs fire OR fewer true positives among them): same pattern with `MODEL_OVERRIDE_REVIEW`
- [ ] If per-agent p95 > 90s: drop that agent from `xhigh` to `high` in v1.51.1

### Phase 2 — broader observation (days 4–7)

- [ ] Expand monitoring to all repos on `@v1` (they've already received 5.4 via rolling tag)
- [ ] Daily confidence distribution comparison: 5.3-codex baseline (prior 2 weeks) vs 5.4 first week
- [ ] If any specific repo regresses on fix quality, set per-repo `MODEL_OVERRIDE_*`

### Phase 3 — retrospective (30 days)

- [ ] Metric #5 (validated-fix rate) movement — primary business outcome
- [ ] Confidence distribution drift — should we recalibrate `AUTO_FIX.DEFAULT_MIN_CONFIDENCE`?
- [ ] Latency delta — is `xhigh` worth the cost? If metrics #3 and #4 didn't move, de-escalate to `high` in v1.51.2
- [ ] Decide next scope: upgrade classification / analysis / investigation to 5.4 (Option 2 from the decision memo) or hold

---

## Success criteria

Measured over a 2-week canary window compared to a matched baseline from the prior 2 weeks:

| # | Metric | Baseline (est.) | Target | Role |
|---|---|---|---|---|
| 1 | % classification calls with confidence ≥ 80 | ~70% | **unchanged** | Control — detects unintended regression in 5.3-codex classification |
| 2 | % investigation `verdictOverride` decisions that later prove correct | ~75% | **unchanged** | Control — detects unintended regression in 5.3-codex investigation |
| 3 | % review-agent CRITICAL rejections that are true positives | ~70% | **≥ 85%** | Primary ruler for review `xhigh` |
| 4 | % of first fix-gen iterations passing review | ~55% | **≥ 70%** | Primary ruler for fix-gen `xhigh` |
| 5 | % of shipped auto-fixes that survive validation | ~80% | **≥ 90%** | Primary business outcome |
| 6 | p50 / p95 triage wall-clock | p50 ~90s, p95 ~210s | p50 +40% max, p95 +60% max (see R3 — ceiling bumped) | Operational |

**Note on statistical power:** at ~50–200 runs/day with high per-run variance, the 2-week canary window yields ~700–2800 runs per framework. An 8pp lift on metric #3 or #4 should be detectable, but a 3–5pp real improvement could register as noise. If the canary shows directionally-positive but sub-target movement (≥ 3pp on #3 and #4), treat as inconclusive rather than failure — extend the window or escalate the measurement plan before de-escalating or rolling back.

**Primary metrics: #3, #4, #5.** #3 and #4 directly measure the two upgraded agents; #5 is the business outcome. If #3 or #4 fails to move ≥ 8pp after the canary window, `xhigh` is not earning its cost and we de-escalate that agent to `high` in v1.51.1.

**Anything red for 3 consecutive days → rollback that repo via `MODEL_OVERRIDE_*` and investigate.**

**Flat-result decision path:** if metrics #3 and #4 move less than 3pp in either direction after 2 weeks (i.e., no regression but no measurable lift either), de-escalate effort from `xhigh` to `high` in v1.51.1 (same model, lower cost + lower latency). If still flat after 2 additional weeks at `high`, revert both agents to `gpt-5.3-codex` via updated defaults and re-evaluate scope. Do not leave the canary in "no signal" state indefinitely.

---

## Monitoring plan

Instrument:
- Per-call `reasoning_effort` in run log (`[FixGenerationAgent] model=gpt-5.4 effort=xhigh`)
- Per-call latency for fix-gen and review (already partly captured in `[Agent] Completed in Nms` lines; extend to include model + effort)
- Token usage if provider exposes it — helpful for R2 verification
- Existing `skill-telemetry-summary` per-run line unchanged

Dashboard target (future): Datadog-side comparison of fix-gen and review latency / confidence distributions pre- vs post-v1.51.0.

---

## Cost model

Per-run estimate for a repair-path run with 2 iterations:

| Scenario | Class | Analysis | Invest | Fix-gen 2× | Review 2× | Other | Total |
|---|---|---|---|---|---|---|---|
| Current v1.50.x (all 5.3-codex) | $0.003 | $0.004 | $0.005 | $0.15 | $0.05 | $0.07 | **$0.28** |
| **This plan (fix-gen + review on 5.4 + xhigh)** | $0.003 | $0.004 | $0.005 | **$0.25** | **$0.15** | $0.07 | **$0.48 (+71%)** |
| Alternative (all-5.4, xhigh on the two high-leverage) | $0.008 | $0.010 | $0.012 | $0.25 | $0.15 | $0.07 | **$0.50 (+79%)** |
| Shelved hybrid (Pro on classification + review) | $0.015 | $0.010 | $0.012 | $0.25 | $0.10 | $0.07 | **$0.46 (+64%)** |

Volume: 50–200 triage runs/day across all repos. Incremental cost vs today: ~$10–40/day = **~$300–1200/month**. Not material.

Cost is explicitly not the constraint here; accuracy and fix quality are. Documenting for posterity.

---

## Alternatives considered (not chosen)

### Option 2 — Single-tier 5.4 across all six agents
Upgrade every LLM-using surface to `gpt-5.4` with effort per role (`xhigh` on classification + review, `high` elsewhere). Only ~$0.02/run more expensive than this plan. **Rejected** because the observable quality gap in the wdio audit was specifically in fix-gen and review; uniform upgrade would spend reasoning budget on agents that already perform correctly on observed cases, broaden the pre-launch risk surface 3×, and burn more of the R3 latency budget for unclear quality lift on agents that are not the bottleneck.

Kept as the logical next step if v1.51.0 ships green and metric #5 plateaus below 90%.

### Option 3 — Hybrid Pro plan (shelved)
Original design: Pro on classification + review, standard 5.4 elsewhere. **Rejected** because (a) classification already performs correctly on observed cases, (b) Pro's published "requests may take several minutes" latency risks GHA job timeouts, (c) Pro's JSON-mode support is hedged in OpenAI's own docs, adding pre-launch verification cost. This plan avoids all three concerns by staying on standard 5.4.

Preserved in git history. Revisit if `xhigh` on standard 5.4 proves insufficient for the review CRITICAL-gating task specifically.

---

## Open questions (resolve before / during implementation)

1. **Verify `reasoning_effort` field shape** in the current OpenAI Node SDK. Might be nested (`reasoning: { effort: 'xhigh' }`) or top-level (`reasoning_effort: 'xhigh'`) depending on SDK version. Five-minute check against the TypeScript types.

2. **Verify JSON mode on `gpt-5.4`.** One `responseAsJson: true` call with a tiny prompt; confirm valid JSON returns. Expected to work; verify before canary. Fallback is our existing instruction-based JSON prompting via `ensureJsonMention`.

3. **Benchmark `xhigh` latency on 5 fixture triages locally.** Record p95 per-call latency for fix-gen and review at `xhigh` before canary. If either > 90s per call, consider starting with `high` effort and measuring quality first; revisit `xhigh` later if metric #4 doesn't lift.

4. **Confirm OpenAI org tier for `gpt-5.4`.** Rate limits differ from 5.3-codex. `MAX_RETRIES: 3` handles transients; higher-tier key may be needed for sustained traffic.

5. **Does the fix-gen ↔ review retry chain work when both sides run on 5.4?** The v1.48.1 trace-replay feedback uses `previous_response_id`. Both agents upgrade to the same model so there's no cross-model boundary, but verify via a fixture that induces a rejected fix followed by a retry iteration.

---

## Monday checklist

### Pre-launch verification (gate the rollout)

- [ ] 5-minute: OpenAI Node SDK shape for `reasoning_effort` — confirm against TypeScript types
- [ ] 5-minute: `responseAsJson: true` call against `gpt-5.4`, confirm valid JSON
- [ ] 15-minute: run 5 fixture triages locally; record p95 per-call latency for fix-gen and review at `xhigh`. If > 60s per single call, also bump `DEFAULT_AGENT_CONFIG.timeoutMs` beyond the default 60s (see R3)
- [ ] Confirm bumped `DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs` (300s per R3) accommodates the longest observed xhigh pipeline in the benchmark
- [ ] Confirm OpenAI org tier supports `gpt-5.4` at expected RPM
- [ ] Smoke-test rollback: set `MODEL_OVERRIDE_FIX_GEN=gpt-5.3-codex` locally, run a fixture, verify fix-gen falls back to 5.3-codex with **no `reasoning` field** sent to the API (effort auto-reset must work). Repeat for `MODEL_OVERRIDE_REVIEW`

### Implementation

- [ ] `src/config/constants.ts` — add `LEGACY_MODEL`, `UPGRADED_MODEL`, `AGENT_MODEL`, `REASONING_EFFORT`, bump `MAX_COMPLETION_TOKENS` to 24000. **Keep `MODEL` as an alias** on `OPENAI` (same value as `LEGACY_MODEL`) so existing references in tests + scripts continue to compile
- [ ] `src/agents/agent-orchestrator.ts` — bump `DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs` from `120000` to `300000` per R3
- [ ] `src/agents/base-agent.ts` — consider bumping `DEFAULT_AGENT_CONFIG.timeoutMs` if pre-launch benchmark shows single-call p95 approaching 60s
- [ ] `src/openai-client.ts` — thread optional `model` + `reasoningEffort` through `analyze()` and `generateWithCustomPrompt()`; gate on `'none'` so the `reasoning` field is omitted for legacy agents
- [ ] `src/agents/base-agent.ts` — extend `AgentConfig` with `model` and `reasoningEffort`; thread into `generateWithCustomPrompt` calls
- [ ] `src/agents/fix-generation-agent.ts` — constructor default upgrade; include the "effort auto-reset when model ≠ UPGRADED_MODEL" guard
- [ ] `src/agents/review-agent.ts` — constructor default upgrade with the same guard
- [ ] `src/simplified-analyzer.ts` — pass legacy defaults explicitly to `openaiClient.analyze()`
- [ ] `action.yml` — `MODEL_OVERRIDE_FIX_GEN`, `MODEL_OVERRIDE_REVIEW` inputs with effort-reset semantics documented
- [ ] Deprecation comment: update to note that `gpt-5.3-codex` and `gpt-5.4` are reasoning-class models that do not expose a `temperature` parameter

### Release

- [ ] Full test suite — expect 643/643 unchanged
- [ ] Local smoke test per Phase 0 checklist (verify correct model + effort per agent, chain continuity, JSON parsing)
- [ ] Commit, bump to `v1.51.0` in package.json, tag, push, create GH release
- [ ] First canary triage on each framework — spot-check in the run log:
  - `[FixGenerationAgent]` lines show `model=gpt-5.4 effort=xhigh`
  - `[ReviewAgent]` lines show `model=gpt-5.4 effort=xhigh`
  - `[AnalysisAgent]`, `[InvestigationAgent]`, and classification output still use `gpt-5.3-codex`
  - End-to-end run completes within target latency

### Canary monitoring

- [ ] Daily check for 3 days on both canaries: metrics #3, #4, #6 (latency), confidence distribution
- [ ] If regression: `MODEL_OVERRIDE_*` the offending agent on the canary, investigate before rollback

---

## Done when

- v1.51.0 live on both canary frameworks for 2 weeks
- Metrics #3 and #4 (the xhigh rulers) show ≥ 8pp lift over baseline
- Metric #5 (validated-fix rate) improves ≥ 7pp across both frameworks
- Latency metric #6 stays within the relaxed target bounds from Success Criteria (p50 +40% max, p95 +60% max — ceiling was intentionally loosened in v1.51.0 to account for xhigh reasoning overhead per R3)
- No repo has `MODEL_OVERRIDE_*` set back to 5.3-codex for stability reasons
- This doc updated with actual measured results; decision recorded for whether to expand to Option 2 (all-5.4) or hold
