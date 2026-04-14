# Triage Memory Hardening Plan

> **Status:** Draft working plan  
> **Scope:** Triage pipeline, skill-memory quality, DynamoDB safety, rollout sequencing  
> **Related docs:** `docs/dynamo-skill-store-implementation-plan.md`, `docs/ARCHITECTURE.md`, `docs/agent-workflow-flowchart.md`

---

## Why This Exists

This document is the working plan for improving the triage agent's memory system without breaking the overall pipeline.

The goal is not to redesign everything at once. The goal is to:

1. Make the current skill store safer and more deterministic.
2. Improve the quality of the memory that gets injected into prompts.
3. Strengthen confidence in the pipeline before behavior changes land.
4. Ship changes in small, reversible phases.

---

## Progress Since v1.40.0

These items were identified in earlier reviews and are already shipped. They should not be treated as active work in this plan.

| Item | Status | Fixed in |
|------|--------|----------|
| Skill creation location / pipeline wiring | Done | v1.40.0 |
| `investigationFindings` stored the wrong data | Done | v1.41.0 |
| `rootCauseCategory` always becoming `OTHER` | Done | v1.41.0 |
| `formatSkillsForPrompt()` missing track record context | Done | v1.41.1 |
| Static AWS key / constructor assumptions | Done | v1.42.0 |
| 409 retry rollback corruption (`.pop()` / in-memory mutation issue) | Done | v1.40.0 |

### Plan maintenance rule

- Keep this section current as work ships.
- Do not leave completed fixes in the active problem list.
- When a phase item ships, either move it here or remove it from the plan if it is no longer relevant.

---

## Still Active Problems

### High-risk correctness issues

- `src/services/dynamo-skill-store.ts`
  - `recordOutcome()` uses overwrite-style counter updates, so concurrent runs can lose increments.
- `src/pipeline/coordinator.ts`
  - A failed fix can mark an unrelated prior skill as `classificationOutcome = incorrect`.
  - Flakiness is computed during classification but is not actually injected into the classifier prompt.

### Retrieval and prompt-quality issues

- `src/services/skill-store.ts`
  - `findRelevant()` and `findForClassifier()` do not have explicit deterministic tie-breakers beyond score.
- `src/services/dynamo-skill-store.ts`
  - Dynamo-backed loading does not guarantee a useful logical order like newest, most successful, or most recently used.
- `src/repair/simplified-repair-agent.ts`
  - The single-shot path does not return `agentRootCause`, so memory metadata can still diverge from the agentic path.

### Design tradeoff requiring an explicit decision

- `src/services/dynamo-skill-store.ts`
  - `load()` sets `loaded = true` even after a transient DynamoDB failure.
  - This is not just a bug. It is a deliberate degraded-mode choice:
    - upside: avoids repeated retry loops and reduces the chance of losing same-run local state after a save
    - downside: a transient load failure can leave the run with empty memory
  - The plan below explicitly chooses how to handle this rather than treating it as an unexamined defect.

### Test-confidence issues

- There is no direct automated coverage for:
  - `PipelineCoordinator`
  - `DynamoSkillStore`
  - `LocalFixValidator`
  - `iterativeFixValidateLoop`
  - `formatForClassifier()`
  - `formatForInvestigation()`
  - failed-fix classification writeback behavior
- Some existing tests are strong for helper logic or request shape, but they mock too deeply to protect the actual production control flow.

---

## Guiding Principles

### Simplicity first

- Prefer small, explicit changes over architectural churn.
- Avoid changing prompt behavior and persistence behavior in the same PR.
- Do not introduce new heuristics until existing heuristics are deterministic and observable.

### Safety first

- Phase 1 should fix correctness and degraded-mode behavior only.
- No large prompt rewrites in the first phase.
- No broad schema migration in the first phase.

### One change axis per release

- Store safety
- Retrieval determinism
- Prompt-memory quality
- Lifecycle and cleanup

Each axis should ship separately when possible.

---

## Non-Goals For Phase 1

- Do not redesign the entire skill schema.
- Do not change the current scoring weights in `findRelevant()` or `findForClassifier()`.
- Do not bundle product-diff branch assumptions with skill-store hardening.
- Do not automate deletion or retention cleanup yet.
- Do not change security-related sanitization behavior unless a new issue requires it.

---

## Phased Plan

## Phase 0: Baseline And Audit

### Goal

Capture the current pipeline behavior and separate trustworthy tests from weak signals before making changes.

### Work

- Document the actual control flow in `src/pipeline/coordinator.ts`:
  - log processing
  - skill store selection
  - classification
  - repair branching
  - skill save
  - outcome recording
  - output formatting
- Record the current store selection rule:
  - DynamoDB only when `AUTO_FIX_TARGET_REPO` is set and ambient AWS credentials are present
  - document the v1.42.0 reality: OIDC / ambient AWS auth, not static constructor-time keys
  - Git-backed store otherwise
- Audit the current test surface and classify suites as:
  - trustworthy for contract behavior
  - useful but shallow
  - missing for important paths

### Acceptance criteria

- We can explain the current behavior of `PipelineCoordinator.execute()` in one page.
- We have a clear list of high-value missing coverage areas.
- We know which existing tests can catch regressions and which cannot.

---

## Phase 1: Safety And Correctness

### Goal

Fix the highest-risk memory integrity problems without changing prompt strategy.

### Change set

#### 1A. Codify Dynamo degraded-mode behavior and observability

Target:

- `src/services/dynamo-skill-store.ts`

Plan:

- Acknowledge that the current `loaded = true` on failure behavior is a deliberate tradeoff, not an accidental bug.
- Short-term decision: keep the current degraded-mode approach for now.
- Reason:
  - it is the lower-risk choice for Phase 1
  - it avoids repeated in-run retries
  - it reduces the chance of same-run in-memory state being overwritten after a save
- Phase 1 work here is to make that behavior explicit and observable:
  - log clearly that the run is continuing with empty memory
  - log the selected store, load outcome, and loaded skill count
  - document when to revisit this decision
- Revisit retry-once semantics only after Phase 1 canaries show that transient empty-memory runs are common enough to justify the risk.

#### 1B. Make Dynamo outcome updates concurrency-safe

Target:

- `src/services/dynamo-skill-store.ts`

Plan:

- Replace overwrite-style counter updates with atomic increment semantics.
- Concretely, move from `SET successCount = :sc` / `SET failCount = :fc` style updates to `ADD`-based increments.
- Preserve current retirement behavior, but ensure counters are not lost under concurrent runs.

#### 1C. Stop poisoning unrelated skills on failed fix paths

Target:

- `src/pipeline/coordinator.ts`

Plan:

- Simplest safe rule: remove the unrelated-skill `incorrect` writeback entirely until there is an explicit link between the stored skill and the classification decision that used it.
- Do not replace it with a more complex heuristic in the same PR.

#### 1D. Improve runtime observability

Targets:

- `src/pipeline/coordinator.ts`
- `src/services/dynamo-skill-store.ts`
- `src/services/skill-store.ts`

Plan:

- Log:
  - which store was selected
  - whether load succeeded or failed
  - how many skills were loaded
  - whether outcome writes were applied, skipped, or failed

### Acceptance criteria

- The load-failure behavior is explicit in the code and logs, not accidental or ambiguous.
- A degraded-memory run is clearly visible in logs.
- Concurrent outcome writes no longer lose increments.
- A failed fix cannot silently label an unrelated skill as incorrect.
- Existing prompt wording remains functionally unchanged.

### Rollback

- Revert the release tag if load/update changes create unexpected noise.
- Fall back to Git-backed storage operationally by removing AWS credentials from the workflow if needed.

---

## Phase 2: Determinism And Retrieval Quality

### Goal

Make memory retrieval stable and backend-independent before making it smarter.

### Note

- This phase is not behavior-neutral.
- Tie-breakers will change which skills surface in some real runs.
- Treat Phase 2 as a canary phase, not a pure refactor.

### Change set

#### 1. Normalize in-memory ordering after load

Targets:

- `src/services/skill-store.ts`
- `src/services/dynamo-skill-store.ts`

Plan:

- Apply the same stable sort after load in both backends.
- Use explicit tie-breakers so equal-score results do not depend on storage order.

#### 2. Make `findRelevant()` and `findForClassifier()` deterministic

Target:

- `src/services/skill-store.ts`

Plan:

- Keep the current scoring formula.
- Add explicit secondary ordering using fields such as:
  - `lastUsedAt`
  - `createdAt`
  - `id`

#### 3. Align Git and Dynamo retrieval semantics

Targets:

- `src/services/skill-store.ts`
- `src/services/dynamo-skill-store.ts`

Plan:

- The same logical set of skills should produce the same ranked result list regardless of backend.

### Acceptance criteria

- The same test fixture produces the same skill ordering every time.
- Git and Dynamo behave the same for equivalent data.
- No scoring-weight changes are required to achieve determinism.

### Rollback

- Revert to prior ordering if the stable sort creates unexpected downstream regressions.
- Keep the sorting implementation isolated so it can be backed out without touching prompt code.

---

## Phase 3: Prompt-Memory Coherence

### Goal

Make targeted prompt-memory improvements only where current code still has a confirmed gap.

### Change set

#### 3A. Add bounded flakiness context to classification

Targets:

- `src/pipeline/coordinator.ts`
- `src/openai-client.ts`
- possibly `src/simplified-analyzer.ts`

Plan:

- Thread the existing flakiness signal into the classifier prompt in a short, bounded form.
- Keep the message informational, not directive.

#### 3B. Narrow parity follow-up for single-shot metadata

Targets:

- `src/repair/simplified-repair-agent.ts`
- `src/pipeline/coordinator.ts`

Plan:

- Narrow the scope from “broad prompt/taxonomy redesign” to the still-live gap:
  - single-shot repair does not surface `agentRootCause`
- Only expand this phase beyond that if Phase 2 canaries show real prompt-memory dilution that is still not addressed by the shipped `v1.41.0` / `v1.41.1` work.

### Acceptance criteria

- Classifier prompts include flakiness only when relevant.
- Single-shot and agentic paths no longer diverge unnecessarily on stored root-cause metadata.

### Rollback

- Keep prompt changes isolated from persistence changes.
- If triage quality shifts unexpectedly, revert prompt assembly without reverting store-safety fixes.

---

## Phase 4: Lifecycle, Cleanup, And Longer-Term Metrics

### Goal

Make the memory system sustainable as data volume grows.

### Change set

#### 1. Decide Dynamo retention strategy

Targets:

- `src/services/dynamo-skill-store.ts`
- `scripts/audit-skills.ts`

Options:

- cap active skills per repo
- archive old skills
- prune by age
- prune by low quality / poor outcomes

#### 2. Revisit classification accuracy model

Targets:

- `src/services/skill-store.ts`
- `src/services/dynamo-skill-store.ts`
- `scripts/audit-skills.ts`

Plan:

- Decide whether `classificationOutcome` should remain last-write-wins or become cumulative history.
- Only do this if there is a clear downstream use for that extra complexity.

#### 3. Improve audit and health reporting

Targets:

- `scripts/audit-skills.ts`
- future observability hooks

Plan:

- Keep audit as a periodic deep check.
- Add better reporting for:
  - stale skills
  - duplicate patterns
  - bad summaries
  - outcome skew

### Acceptance criteria

- There is a documented retention strategy for Dynamo-backed skills.
- The audit script reflects the real lifecycle policy.
- The table can grow without silently degrading prompt quality.

---

## Test And Verification Plan

## Existing Suites We Can Trust More

- `__tests__/services/skill-store.test.ts`
  - normalization
  - relevance scoring basics
  - flakiness thresholds
  - `formatSkillsForPrompt()`
- `__tests__/openai-client.test.ts`
  - request construction
  - response parsing
  - JSON output handling
- `__tests__/agents/agent-orchestrator.test.ts`
  - high-level orchestration branches with mocked OpenAI behavior

## Existing Suites We Should Treat As Shallow

- `__tests__/index.test.ts`
  - useful for resilience and output wiring
  - not enough for production coordinator behavior because it mocks deeply
- `__tests__/index-fix-recommendation.test.ts`
  - useful for fix recommendation plumbing
  - not a substitute for coordinator or validator coverage

## Important Gaps To Close Before Behavior Changes

- `PipelineCoordinator`
- `DynamoSkillStore`
- `LocalFixValidator`
- `iterativeFixValidateLoop`
- `formatForClassifier()`
- `formatForInvestigation()`
- failed-fix classification writeback logic
- flakiness-to-classifier wiring

## Phase 1 concrete test targets

These are the highest-value checks for the first implementation pass.

1. `DynamoSkillStore.recordOutcome`
   - verify atomic increment semantics rather than stale overwrite semantics
2. `PipelineCoordinator.execute`
   - verify no unrelated prior skill is marked `incorrect`
3. Store observability
   - verify logs identify Dynamo vs Git
   - verify load success vs degraded-memory fallback
   - verify skill count logging
4. Git `SkillStore` retry behavior
   - keep the existing Git-side retry semantics green while Phase 1 Dynamo work lands
5. `DynamoSkillStore.load`
   - if the load-failure design is changed later, add fail-once / succeed-on-retry coverage at that time

## Verification matrix

| Area | Unit characterization | Mocked integration | Real integration | Manual canary |
|------|-----------------------|--------------------|------------------|---------------|
| Store selection and coordinator branching | Needed | Useful | Optional | Yes |
| Dynamo load/save/outcome behavior | Needed | Useful | Useful in dev table | Yes |
| Retrieval ordering and tie-breaks | Needed | Not necessary | Optional | Yes |
| Prompt-memory assembly | Needed | Useful | Optional | Yes |
| Local fix-validate loop | Needed | Needed | Optional / expensive | Yes |
| Failed-fix classification writes | Needed | Needed | Optional | Yes |

---

## Operational Guardrails

### Canary strategy

- Ship one phase per release tag.
- Canary on one low-risk consumer repo first.
- If possible, use a dev Dynamo table before touching live table behavior.
- For stateful memory changes, use multi-run canaries rather than one-off verification.
- Specifically watch for:
  - unexpected counter jumps
  - unexpected retirements
  - empty-memory runs
  - surprising changes in surfaced skills for the same spec over repeated runs

### Logs and health signals to watch

- store selected: Dynamo vs Git
- number of skills loaded
- load failures
- save failures
- outcome write failures
- validation loop duration
- unexpected increase in `ERROR` or `INCONCLUSIVE`

### Rollback options

1. Revert the action version.
2. Disable auto-fix or validation at the workflow layer.
3. Remove AWS credentials to force Git-backed memory temporarily.

---

## Separate Workstream: Product Diff Assumptions

This should not be bundled into the memory hardening phases unless explicitly chosen.

Reason:

- `src/artifact-fetcher.ts` currently assumes `main` for recent product diff fetches.
- That affects context quality, but it is a separate operational and correctness concern from skill-store integrity.

Recommended approach:

- track this as a neighboring task
- do not mix it into Phase 1 or Phase 2 memory-store hardening

---

## Open Questions

- What is the intended semantic meaning of `classificationOutcome`?
  - Was the classifier correct?
  - Was the remembered pattern helpful?
  - Did the generated fix succeed?
- Do we want active memory capped per repo, or do we want archival plus audit cleanup?
- Is cumulative classification history worth the added complexity?
- Should flakiness be a classifier hint only, or should it also change downstream repair behavior?

---

## Suggested PR Sequence

1. `Phase 1A/1B`: Dynamo degraded-mode documentation + observability + atomic outcome updates
2. `Phase 1C`: remove unrelated-skill incorrect writeback
3. `Phase 2A`: stable sort and deterministic retrieval
4. `Phase 2B`: Git/Dynamo retrieval parity cleanup
5. `Phase 3A`: bounded flakiness in classification prompt
6. `Phase 3B`: single-shot `agentRootCause` parity follow-up
7. `Phase 4`: lifecycle / retention / audit improvements

---

## Working Notes

- This plan is intentionally conservative.
- If a proposed change touches both prompt behavior and persistence behavior, split it.
- If a proposed change cannot be verified with at least one characterization test or one canary signal, it is probably too large for a single PR.
