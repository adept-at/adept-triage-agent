# Adept Triage Agent — Workflow Flowchart

> Visual reference for how a triage run flows end-to-end.
> For textual deep-dive, see [ARCHITECTURE.md](ARCHITECTURE.md).
> **Current version:** v1.52.0

---

## 1. Top-level: trigger → classify → repair → save skill → output

```mermaid
flowchart TB
    subgraph TRIGGER["Trigger Sources"]
        T1["workflow_run<br/>(on: completed + failure)"]
        T2["repository_dispatch<br/>(triage-failed-test) — RECOMMENDED"]
        T3["In-workflow step<br/>(if: failure())"]
    end

    TRIGGER --> GHA["GitHub Action Entry<br/>src/index.ts → run()"]

    GHA --> INPUTS["getInputs()<br/>parse ActionInputs from core.getInput"]
    INPUTS --> DEPS["Init deps:<br/>Octokit, OpenAIClient, ArtifactFetcher"]
    DEPS --> COORDINATOR["new PipelineCoordinator"]
    COORDINATOR --> EXECUTE["coordinator.execute()"]

    EXECUTE --> LOGS["processWorkflowLogs<br/>fetch logs + artifacts + screenshots"]

    LOGS --> HAS_ERR{"errorData<br/>found?"}
    HAS_ERR -- no --> NO_ERR["handleNoErrorData()<br/>→ NO_FAILURE / PENDING / ERROR"]
    HAS_ERR -- yes --> SKILL_LOAD["SkillStore.load()<br/>(if AWS creds in env)"]

    SKILL_LOAD --> CLASSIFY_STEP["classify()"]

    CLASSIFY_STEP --> CONF{"confidence >=<br/>threshold?"}
    CONF -- no --> INCONCL["setInconclusiveOutput"]
    CONF -- yes --> VERDICT{"verdict ==<br/>TEST_ISSUE?"}
    VERDICT -- no --> NON_TEST["setSuccessOutput<br/>(PRODUCT_ISSUE etc.)"]
    VERDICT -- yes --> FLAKY{"chronically<br/>flaky spec?<br/>(fixCount >= 3)"}
    FLAKY -- yes --> CHRONIC["autoFixSkipped=true<br/>setSuccessOutput<br/>(human follow-up)"]
    FLAKY -- no --> REPAIR_STEP["repair()"]

    REPAIR_STEP --> SAVE_SKILL["Save skill to DynamoDB<br/>if fix attempted +<br/>skillStore + targetRepo"]
    SAVE_SKILL --> OUT["setSuccessOutput<br/>+ action outputs"]

    OUT --> SUMMARY["logRunSummary()<br/>📊 skill-telemetry-summary<br/>(always fires)"]
    NO_ERR --> SUMMARY
    INCONCL --> SUMMARY
    NON_TEST --> SUMMARY
    CHRONIC --> SUMMARY

    style CHRONIC fill:#fff3cd,color:#000
    style INCONCL fill:#f8d7da,color:#000
    style NO_ERR fill:#f8d7da,color:#000
    style OUT fill:#d4edda,color:#000
    style SUMMARY fill:#cce5ff,color:#000
```

---

## 2. Classification phase

```mermaid
flowchart TB
    START["classify(errorData, skillStore)"]
    START --> FLAK_CHECK["skillStore.detectFlakiness(spec)<br/>3d window: &gt;1 fix<br/>7d window: &gt;2 fixes"]
    FLAK_CHECK --> FLAK_LOG{"isFlaky?"}
    FLAK_LOG -- yes --> WARN["⚠️ FLAKINESS DETECTED"]
    FLAK_LOG -- no --> CLASSIFIER_SKILLS

    WARN --> CLASSIFIER_SKILLS["skillStore.findForClassifier({<br/>framework, spec, errorMessage })<br/>filter: validatedLocally + !retired<br/>score: +15 spec, +5×sim, +3 recent<br/>top 3"]

    CLASSIFIER_SKILLS --> RENDER["formatSkillsForClassifierContext<br/>📝 skill-telemetry role=classifier"]
    RENDER --> MERGE["Merge:<br/>skillContext + flakinessContext"]
    MERGE --> ANALYZE["analyzeFailure(openai, errorData, context)<br/>→ verdict + confidence + reasoning<br/>+ suggestedSourceLocations if PRODUCT_ISSUE"]

    ANALYZE --> RESULT["ClassificationResult<br/>+ classifierSkillIds"]
```

---

## 3. Agentic repair pipeline — the five-agent orchestrator

Happy path inside `AgentOrchestrator.orchestrate()` (`src/agents/agent-orchestrator.ts`). Wrapped in a `Promise.race` against `totalTimeoutMs = 300000` (v1.51.0 for xhigh latency).

```mermaid
flowchart TB
    START["orchestrate(context, errorData,<br/>previousResponseId, skills)"]
    START --> SKILL_PROMPT_A["context.skillsPrompt<br/>= formatSkillsForPrompt(skills, 'investigation', flakiness)"]
    SKILL_PROMPT_A --> ANALYSIS["<b>Analysis Agent</b><br/>gpt-5.3-codex<br/>→ rootCauseCategory, issueLocation,<br/>selectors, confidence"]

    ANALYSIS --> CODE_READ["<b>Code Reading Agent</b><br/>no LLM — direct octokit getContent<br/>→ test file + page objects + support files"]

    CODE_READ --> CHAIN_DECIDE{"analysis.confidence<br/>&lt; 80?"}
    CHAIN_DECIDE -- yes --> CHAIN_YES["investigationChainId =<br/>analysisResult.responseId"]
    CHAIN_DECIDE -- no --> CHAIN_NO["investigationChainId =<br/>undefined (fresh start)"]

    CHAIN_YES --> SKILL_PROMPT_I
    CHAIN_NO --> SKILL_PROMPT_I

    SKILL_PROMPT_I["context.skillsPrompt<br/>= priorInvestigationContext<br/>+ baseInvestigationSkills"]
    SKILL_PROMPT_I --> INVESTIGATION["<b>Investigation Agent</b><br/>gpt-5.3-codex<br/>→ findings, recommendedApproach,<br/>selectorsToUpdate, isTestCodeFixable,<br/>verdictOverride?"]

    INVESTIGATION --> OVERRIDE{"verdictOverride<br/>APP_CODE with<br/>higher conf?"}
    OVERRIDE -- yes --> ABORT_APP["ABORT:<br/>investigation outvoted analysis —<br/>not test-fixable"]
    OVERRIDE -- no --> TEST_FIXABLE{"isTestCodeFixable?"}
    TEST_FIXABLE -- no --> ABORT_TEST["ABORT:<br/>not test-code-fixable<br/>+ no override"]
    TEST_FIXABLE -- yes --> LOOP_START

    LOOP_START["Fix/Review loop<br/>maxIterations = 3"]
    LOOP_START --> FIX_GEN["<b>Fix Generation Agent</b><br/>gpt-5.4 xhigh<br/>+ CYPRESS_PATTERNS / WDIO_PATTERNS<br/>→ changes[], failureModeTrace (4 fields),<br/>confidence, reasoning"]

    FIX_GEN --> AUTO_CORRECT["autoCorrectOldCode<br/>(snap near-miss oldCode to source)"]

    AUTO_CORRECT --> CONF_GATE{"confidence >=<br/>70?"}
    CONF_GATE -- no --> FEEDBACK_CONF["reviewFeedback<br/>= low-confidence msg<br/>→ next iteration"]
    CONF_GATE -- yes --> REVIEW["<b>Review Agent</b><br/>gpt-5.4 xhigh<br/>audits: oldCode match, trace quality,<br/>logical strengthening, APP_CODE justification,<br/>verdictOverride alignment,<br/>recommendedApproach honored"]

    REVIEW --> APPROVED{"approved<br/>+ no CRITICAL?"}
    APPROVED -- yes --> SHIP["return fix<br/>approach: agentic"]
    APPROVED -- no --> BLOCKING{"blocking<br/>CRITICAL?"}
    BLOCKING -- yes --> TRACE_REPLAY["reviewFeedback<br/>+ prior failureModeTrace<br/>replay → next iteration"]
    BLOCKING -- no --> REGULAR_FEEDBACK["reviewFeedback<br/>= issue lines<br/>→ next iteration"]

    FEEDBACK_CONF --> LOOP_CHECK
    TRACE_REPLAY --> LOOP_CHECK
    REGULAR_FEEDBACK --> LOOP_CHECK
    LOOP_CHECK{"iterations<br/>&lt; 3?"}
    LOOP_CHECK -- yes --> FIX_GEN
    LOOP_CHECK -- no --> MAX_ITER{"lastFix<br/>confidence OK<br/>+ no blocking<br/>CRITICAL?"}
    MAX_ITER -- yes --> FALLBACK_SHIP["ship lastFix<br/>with warning<br/>(validation = final gate)"]
    MAX_ITER -- no --> FAIL["return error<br/>approach: failed"]

    style ABORT_APP fill:#f8d7da,color:#000
    style ABORT_TEST fill:#f8d7da,color:#000
    style SHIP fill:#d4edda,color:#000
    style FALLBACK_SHIP fill:#fff3cd,color:#000
    style FAIL fill:#f8d7da,color:#000
```

---

## 4. Prompt composition — per-agent

Applied in `BaseAgent.runAgentTask` for every LLM-calling agent.

```mermaid
flowchart LR
    subgraph SYS["System prompt"]
        ROLE["Agent role + rubric<br/>+ JSON output schema"]
        PATTERNS["(fix-gen only)<br/>CYPRESS_PATTERNS /<br/>WDIO_PATTERNS"]
        REPO_CTX[".adept-triage/context.md<br/>(remote or bundled)<br/>appended when present"]
        ROLE --> PATTERNS
        PATTERNS --> REPO_CTX
    end

    subgraph USER["User prompt"]
        DELEG["delegationContext<br/>(briefing from orchestrator)"]
        ERROR["errorMessage<br/>+ stack + logs<br/>+ screenshots"]
        DIFFS["prDiff + productDiff"]
        SOURCE["sourceFileContent<br/>(line-numbered)"]
        SKILLS["skillsPrompt<br/>(role-specific framing)"]
        PRIOR["Prior attempt context<br/>(iteration N-1 fix + logs)<br/>when retry"]
        ROLE_INSTR["Role-specific instructions"]
        DELEG --> ERROR
        ERROR --> DIFFS
        DIFFS --> SOURCE
        SOURCE --> SKILLS
        SKILLS --> PRIOR
        PRIOR --> ROLE_INSTR
    end

    SYS --> OPENAI["generateWithCustomPrompt<br/>+ screenshots (if includeScreenshots)<br/>+ responseId (for chaining)"]
    USER --> OPENAI
```

### Skill-memory role framing

```mermaid
flowchart TB
    FOR_PROMPT["formatSkillsForPrompt(skills, role, flakiness)"]
    FOR_PROMPT --> INVEST_ROLE["role='investigation'<br/>header: 'use as background,<br/>do NOT anchor'<br/>trace: HIDDEN"]
    FOR_PROMPT --> FIX_ROLE["role='fix_generation'<br/>header: 'validated approaches<br/>as starting points'<br/>trace: SHOWN (if validated)"]
    FOR_PROMPT --> REV_ROLE["role='review'<br/>header: 'compare current trace<br/>to validated prior'<br/>trace: SHOWN (if validated)"]

    INVEST_ROLE --> GATE
    FIX_ROLE --> GATE
    REV_ROLE --> GATE

    GATE["TRACE RENDERING GATE<br/>(v1.49.2)<br/>• only for fix_gen + review<br/>• only when isValidated:<br/>  validatedLocally OR successCount > 0"]
```

---

## 5. Local validation loop

```mermaid
flowchart TB
    START["iterativeFixValidateLoop<br/>FIX_VALIDATE_LOOP.MAX_ITERATIONS = 3"]

    START --> GEN["generateFixRecommendation<br/>(agentic only)"]
    GEN --> NULL_CHK{"fix == null?"}
    NULL_CHK -- yes --> BREAK_EMPTY["break"]
    NULL_CHK -- no --> CHG_CHK{"proposedChanges<br/>empty?"}
    CHG_CHK -- yes --> BREAK_EMPTY
    CHG_CHK -- no --> BLAST

    BLAST["requiredConfidence(fix, minConf)<br/>+10 shared code<br/>+5 multi-file<br/>cap: max(minConf, 95)"]
    BLAST --> CONF_GATE{"fix.confidence<br/>>= requiredConf?"}
    CONF_GATE -- no + scaling --> SKIPPED["autoFixSkipped=true<br/>+ reason"]
    CONF_GATE -- no, no scaling --> BREAK_EMPTY
    CONF_GATE -- yes --> DUP_CHK

    DUP_CHK["fixFingerprint<br/>matches previous failed?"]
    DUP_CHK -- yes --> BREAK_DUP["break<br/>(avoid retry same)"]
    DUP_CHK -- no --> FIRST{"first<br/>iteration?"}

    FIRST -- yes --> SETUP["validator.setup()<br/>clone repo + npm ci<br/>+ optional Cypress binary"]
    SETUP --> BASELINE["baselineCheck()<br/>run test 3 consecutive times<br/>WITHOUT any fix applied"]
    BASELINE --> BASELINE_PASS{"all 3 pass?"}
    BASELINE_PASS -- yes --> RETURN_TRANSIENT["return:<br/>fixRecommendation: null<br/>(failure was transient)"]
    BASELINE_PASS -- no --> APPLY["validator.applyFix(changes)"]

    FIRST -- no --> APPLY

    APPLY --> RUN["validator.runTest()<br/>🧪 Running test locally..."]
    RUN --> TEST_PASS{"test passed?"}
    TEST_PASS -- yes --> PUSH["pushAndCreatePR<br/>→ branch + commit + PR"]
    PUSH --> PR_OK{"push OK?"}
    PR_OK -- yes --> RETURN_SUCCESS["return: autoFixResult.success=true<br/>+ prUrl + commitSha"]
    PR_OK -- no --> RETURN_PARTIAL["return: success=false<br/>validationStatus=passed<br/>(test works, push failed)"]

    TEST_PASS -- no --> RESET["validator.reset()<br/>git checkout -- .<br/>+ git clean -fd"]
    RESET --> ITER_CHK{"iterations<br/>< 3?"}
    ITER_CHK -- yes --> BUILD_PRIOR["buildNextPreviousAttempt<br/>diff + logs + priorAgentRootCause<br/>+ priorAgentInvestigationFindings<br/>+ prior failureModeTrace"]
    BUILD_PRIOR --> GEN
    ITER_CHK -- no --> EXHAUSTED["🛑 All 3 attempts exhausted"]

    EXHAUSTED --> CLEANUP
    RETURN_SUCCESS --> CLEANUP
    RETURN_PARTIAL --> CLEANUP
    RETURN_TRANSIENT --> CLEANUP
    BREAK_EMPTY --> CLEANUP
    BREAK_DUP --> CLEANUP
    SKIPPED --> CLEANUP
    CLEANUP["validator.cleanup()<br/>fs.rmSync workdir<br/>(always, try/finally)"]

    style RETURN_SUCCESS fill:#d4edda,color:#000
    style RETURN_TRANSIENT fill:#d4edda,color:#000
    style RETURN_PARTIAL fill:#fff3cd,color:#000
    style SKIPPED fill:#fff3cd,color:#000
    style EXHAUSTED fill:#f8d7da,color:#000
```

---

## 6. Learning loop — skills + repo context

```mermaid
flowchart TB
    subgraph ON_START["Once per run (start)"]
        LOAD["SkillStore.load()<br/>Query pk=REPO#owner/repo<br/>📝 Loaded N skill(s)"]
        FETCH["RepoContextFetcher.fetch(owner, repo, ref)"]
        BUNDLED{"in BUNDLED_<br/>REPO_CONTEXTS?"}
        FETCH --> BUNDLED
        BUNDLED -- yes --> BUNDLE_RENDER["renderBundled<br/>📘 Loaded repo context<br/>(bundled in adept-triage-agent)"]
        BUNDLED -- no --> REMOTE["octokit.repos.getContent<br/>.adept-triage/context.md"]
        REMOTE --> REMOTE_OK{"200?"}
        REMOTE_OK -- yes --> REMOTE_RENDER["sanitize + cap<br/>📘 Loaded repo context<br/>from owner/repo/...@ref"]
        REMOTE_OK -- no --> EMPTY["return ''<br/>(debug-log 404)"]
    end

    LOAD --> PIPELINE["Coordinator + agents<br/>see §1, §3, §4"]
    BUNDLE_RENDER --> PIPELINE
    REMOTE_RENDER --> PIPELINE
    EMPTY --> PIPELINE

    PIPELINE --> ON_SAVE

    subgraph ON_SAVE["After fix attempt (if skillStore + targetRepo)"]
        BUILD["buildSkill({<br/>  spec: normalizeSpec(...),<br/>  errorPattern: normalizeError(...),<br/>  rootCauseCategory, fix, confidence,<br/>  prUrl, validatedLocally,<br/>  failureModeTrace,<br/>  investigationFindings<br/>})"]
        SAVE["SkillStore.save(skill)<br/>→ PutCommand"]
        PRUNE{"partition over<br/>MAX_SKILLS=100?"}
        SAVE --> PRUNE
        PRUNE -- yes --> SELECT["selectSkillsToPrune<br/>exclude isSeed ✔<br/>sort oldest-first<br/>delete overflow"]
        PRUNE -- no --> DONE
        SELECT --> DONE
        DONE --> RECORD{"fix succeeded?"}
        RECORD -- yes --> OUTCOME_OK["recordOutcome(skill.id, true)<br/>+ recordClassificationOutcome(<br/>  skill.id, 'correct')"]
        RECORD -- no --> OUTCOME_FAIL["recordOutcome(skill.id, false)<br/>→ auto-retire check:<br/>failRate &gt; 0.4 AND failCount &gt;= 3"]
    end

    OUTCOME_OK --> SUMMARY["logRunSummary()<br/>📊 loaded=N surfaced=M saved=K"]
    OUTCOME_FAIL --> SUMMARY
```

### Seed-skill protection

```mermaid
flowchart LR
    SEED["scripts/seed-skill.ts<br/>inserts TriageSkill<br/>with isSeed: true<br/>validatedLocally: true<br/>successCount: 1<br/>classificationOutcome: 'correct'"]

    SEED --> DYNAMO["DynamoDB<br/>triage-skills-v1-live"]

    DYNAMO --> RETRIEVAL["findRelevant<br/>findForClassifier<br/>(scored like any other skill)"]
    DYNAMO --> PRUNE["selectSkillsToPrune<br/>SKIPS seeds ✔<br/>(cap can never evict)"]
    DYNAMO --> AUDIT["scripts/audit-skills.ts<br/>SKIPS seeds ✔<br/>(per-skill + dedup checks)"]

    style PRUNE fill:#d4edda,color:#000
    style AUDIT fill:#d4edda,color:#000
```

---

## 7. Verdict state machine

```mermaid
stateDiagram-v2
    [*] --> processingLogs

    processingLogs --> NO_FAILURE : workflow run succeeded
    processingLogs --> PENDING : run still in progress
    processingLogs --> ERROR : unrecoverable / missing inputs
    processingLogs --> classifying : errorData found

    classifying --> INCONCLUSIVE : confidence < threshold
    classifying --> PRODUCT_ISSUE : verdict=PRODUCT_ISSUE
    classifying --> flakyGate : verdict=TEST_ISSUE

    flakyGate --> TEST_ISSUE_SKIPPED : fixCount >= 3 (chronic)<br/>auto_fix_skipped=true
    flakyGate --> repairing : not chronic

    repairing --> TEST_ISSUE_WITH_FIX : fix generated + (auto-applied OR recommendation only)
    repairing --> TEST_ISSUE_SKIPPED : blast-radius gate blocked fix
    repairing --> TEST_ISSUE_NO_FIX : fix-gen failed / verdict override / not test-fixable

    NO_FAILURE --> [*]
    PENDING --> [*]
    ERROR --> [*] : core.setFailed
    INCONCLUSIVE --> [*]
    PRODUCT_ISSUE --> [*]
    TEST_ISSUE_WITH_FIX --> [*]
    TEST_ISSUE_SKIPPED --> [*]
    TEST_ISSUE_NO_FIX --> [*]
```

---

## 8. Log-line quick reference

Top-level spans every stage. Useful for `grep` in CI logs.

```mermaid
sequenceDiagram
    participant GHA as GitHub Action
    participant Coord as PipelineCoordinator
    participant Store as SkillStore
    participant Fetcher as RepoContextFetcher
    participant Orch as AgentOrchestrator
    participant Val as LocalFixValidator

    GHA->>Coord: execute()
    Coord->>Store: load()
    Store-->>Coord: skills[]
    Note over Store: 📝 Loaded N skill(s) from DynamoDB
    Coord->>Fetcher: fetch(owner, repo, ref)
    Fetcher-->>Coord: repoContext
    Note over Fetcher: 📘 Loaded repo context from ...<br/>OR<br/>📘 (bundled in adept-triage-agent)

    Coord->>Coord: classify()
    Note over Coord: 📝 skill-telemetry role=classifier ids=...
    Coord->>Coord: detectFlakiness<br/>⚠️ FLAKINESS DETECTED<br/>or ⏭️ Chronic flakiness

    Coord->>Orch: orchestrate() [agentic]
    Note over Orch: 🤖 Starting agentic repair pipeline<br/>📊 Step 1/2/3/4/5 ...<br/>📝 skill-telemetry role=investigation/fix_generation/review
    Orch-->>Coord: fix + failureModeTrace
    Note over Orch: 🤖 Agentic approach: agentic, iterations: N

    Coord->>Val: iterativeFixValidateLoop
    Note over Val: 🔄 Fix-Validate iteration N/3<br/>🔍 Running baseline check (requires 3 consecutive passes)<br/>✅ Baseline passed OR ❌ Baseline failed on pass N<br/>🧪 Running test locally
    Val-->>Coord: success + prUrl

    Coord->>Store: save(skill)
    Note over Store: 📝 Saved validated skill ...<br/>🧹 Pruned N old skill(s)<br/>⚠️ Skill ... retired — X%

    Coord->>Store: logRunSummary()
    Note over Store: 📊 skill-telemetry-summary loaded=N surfaced=M saved=K
```

---

**Related**

- [ARCHITECTURE.md](ARCHITECTURE.md) — textual deep-dive.
- [../USAGE_GUIDE.md](../USAGE_GUIDE.md) — operator cookbook.
- [../README.md](../README.md) — features + inputs/outputs table.
