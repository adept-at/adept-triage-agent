# Adept Triage Agent — Workflow Flowchart

## Main Triage Pipeline

```mermaid
flowchart TB
    subgraph TRIGGER["Trigger Sources"]
        T1["workflow_run<br/>(on: completed + failure)"]
        T2["repository_dispatch<br/>(triage-failed-test)"]
        T3["In-workflow step<br/>(if: failure())"]
    end

    TRIGGER --> GHA["GitHub Action Entry<br/>src/index.ts"]

    GHA --> INPUTS["Parse Inputs<br/>getInputs()"]
    INPUTS --> CLIENTS["Initialize Clients<br/>Octokit + OpenAIClient + ArtifactFetcher"]
    CLIENTS --> LOGS["Process Workflow Logs<br/>log-processor.ts"]

    LOGS --> FETCH_DATA
    subgraph FETCH_DATA["Data Collection"]
        direction TB
        WF_LOGS["Fetch Workflow Run Logs<br/>via GitHub API"]
        ARTIFACTS["Fetch Artifacts<br/>artifact-fetcher.ts"]
        SCREENSHOTS["Extract Screenshots<br/>(base64 encoded)"]
        PR_DIFF["Fetch PR Diff / Branch Diff<br/>via GitHub API"]
        WF_LOGS --> ARTIFACTS --> SCREENSHOTS
        WF_LOGS --> PR_DIFF
    end

    FETCH_DATA --> NULL_CHECK{Error Data<br/>Found?}
    NULL_CHECK -->|No| WF_STATUS{Workflow<br/>Still Running?}
    WF_STATUS -->|Yes| PENDING["Output: PENDING"]
    WF_STATUS -->|No| NO_DATA["Output: ERROR<br/>No error data found"]

    NULL_CHECK -->|Yes| INFRA_CHECK{"Infrastructure<br/>Failure Detected?<br/>detectInfrastructureFailure()"}

    INFRA_CHECK -->|Yes| INCONC_INFRA["Output: INCONCLUSIVE<br/>(session/browser crash)"]
    INFRA_CHECK -->|No| ANALYZE["Analyze with AI<br/>simplified-analyzer.ts"]

    ANALYZE --> AI_CALL["OpenAI Responses API<br/>gpt-5.3-codex<br/>openai-client.ts"]

    AI_CALL --> VERDICT{Verdict?}

    VERDICT -->|TEST_ISSUE| FIX_REC["Generate Fix Recommendation<br/>SimplifiedRepairAgent"]
    VERDICT -->|PRODUCT_ISSUE| CONFIDENCE_CHECK
    VERDICT -->|INCONCLUSIVE| CONFIDENCE_CHECK

    FIX_REC --> AGENTIC_CHECK{Agentic<br/>Repair Enabled?}

    AGENTIC_CHECK -->|Yes| ORCHESTRATOR
    AGENTIC_CHECK -->|No| SINGLE_SHOT["Single-Shot Repair<br/>simplified-repair-agent.ts"]

    SINGLE_SHOT --> FIX_RESULT
    ORCHESTRATOR --> FIX_RESULT

    FIX_RESULT{Fix<br/>Generated?}
    FIX_RESULT -->|Yes| AUTO_FIX_CHECK{Auto-Fix<br/>Enabled?}
    FIX_RESULT -->|No| CONFIDENCE_CHECK

    AUTO_FIX_CHECK -->|Yes| APPLY_FIX["Apply Fix<br/>fix-applier.ts"]
    AUTO_FIX_CHECK -->|No| CONFIDENCE_CHECK

    APPLY_FIX --> CREATE_BRANCH["Create Branch<br/>via GitHub API"]
    CREATE_BRANCH --> COMMIT["Commit Changes<br/>via GitHub API"]
    COMMIT --> VALIDATE_CHECK{Validation<br/>Enabled?}

    VALIDATE_CHECK -->|Yes| DISPATCH["Trigger Validation Workflow<br/>createWorkflowDispatch()"]
    VALIDATE_CHECK -->|No| CONFIDENCE_CHECK

    DISPATCH --> CONFIDENCE_CHECK

    CONFIDENCE_CHECK{Confidence ≥<br/>Threshold?}
    CONFIDENCE_CHECK -->|No| INCONCLUSIVE["Output: INCONCLUSIVE"]
    CONFIDENCE_CHECK -->|Yes| FINAL_OUTPUT["Set Success Output<br/>(verdict + fix + auto-fix results)"]
```

## Multi-Agent Orchestration Pipeline

```mermaid
flowchart TB
    START["AgentOrchestrator.orchestrate()<br/>agent-orchestrator.ts"] --> TIMEOUT["Start Timeout Timer<br/>(120s default)"]

    TIMEOUT --> STEP1

    subgraph STEP1["Step 1: Analysis Agent"]
        AA["analysis-agent.ts<br/>→ OpenAI Responses API"]
        AA --> AA_OUT["Output:<br/>• Root cause category<br/>• Confidence score<br/>• Selectors & elements<br/>• Detected patterns<br/>• Suggested approach"]
    end

    STEP1 -->|Pass analysis + selectors| STEP2

    subgraph STEP2["Step 2: Code Reading Agent"]
        CRA["code-reading-agent.ts<br/>→ GitHub API (file fetch)"]
        CRA --> CRA_OUT["Output:<br/>• Test file content<br/>• Related file contents<br/>• Custom commands<br/>• Page objects"]
    end

    STEP2 -->|Pass analysis + code context| STEP3

    subgraph STEP3["Step 3: Investigation Agent"]
        IA["investigation-agent.ts<br/>→ OpenAI Responses API"]
        IA --> IA_OUT["Output:<br/>• Findings list<br/>• isTestCodeFixable<br/>• Recommended approach<br/>• Selectors to update"]
    end

    STEP3 --> LOOP_START

    subgraph LOOP["Fix Generation / Review Loop (max 3 iterations)"]
        LOOP_START["Iteration Start"]
        LOOP_START --> STEP4

        subgraph STEP4["Step 4: Fix Generation Agent"]
            FGA["fix-generation-agent.ts<br/>→ OpenAI Responses API"]
            FGA --> DIFF_CHECK["PR Diff Consistency Check:<br/>Does fix reasoning match<br/>the actual diff?"]
            DIFF_CHECK --> FGA_OUT["Output:<br/>• Code changes (oldCode → newCode)<br/>• Confidence<br/>• Evidence & reasoning"]
        end

        STEP4 --> CONF_CHECK{Confidence ≥<br/>Min Threshold?}
        CONF_CHECK -->|No| FEEDBACK1["Feedback: Confidence too low"]
        FEEDBACK1 --> LOOP_START

        CONF_CHECK -->|Yes| AUTO_CORRECT["Step 4b: autoCorrectOldCode<br/>Validate oldCode against source<br/>Strip line prefixes / normalize WS /<br/>signature match near target line"]
        AUTO_CORRECT --> CHANGES_LEFT{Valid changes<br/>remain?}
        CHANGES_LEFT -->|No| FEEDBACK_AC["Feedback: oldCode did not<br/>match source — copy exactly"]
        FEEDBACK_AC --> LOOP_START

        CHANGES_LEFT -->|Yes| REVIEW_CHECK{Review<br/>Required?}
        REVIEW_CHECK -->|No| RETURN_FIX["Return Fix"]

        REVIEW_CHECK -->|Yes| STEP5

        subgraph STEP5["Step 5: Review Agent"]
            RA["review-agent.ts<br/>→ OpenAI Responses API"]
            RA --> RA_CHECKS["Review Checks:<br/>• oldCode matches source file?<br/>• newCode syntactically valid?<br/>• Fix addresses root cause?<br/>• No side effects?<br/>• Reasoning consistent with PR diff?"]
            RA_CHECKS --> RA_OUT["Output:<br/>• Approved (bool)<br/>• Issues (CRITICAL/WARNING)<br/>• Assessment"]
        end

        STEP5 --> APPROVED{Approved?}
        APPROVED -->|Yes| RETURN_FIX
        APPROVED -->|No| FEEDBACK2["Feedback: Review issues<br/>(fed back to Fix Gen)"]
        FEEDBACK2 --> LOOP_START
    end

    RETURN_FIX --> CONVERT["Convert to FixRecommendation"]
    CONVERT --> DONE["Return OrchestrationResult"]

    LOOP -->|Max iterations reached| BEST_FIX{Last Fix ≥<br/>Min Confidence?}
    BEST_FIX -->|Yes| RETURN_BEST["Return Last Fix<br/>(not review-approved)"]
    BEST_FIX -->|No| FALLBACK{Fallback<br/>Enabled?}
    FALLBACK -->|Yes| SINGLE["Fall Back to Single-Shot"]
    FALLBACK -->|No| FAIL["Return Failed"]
```

## Causal Consistency — PR Diff Cross-Reference (v1.21.0)

Shows how the PR diff is validated against the model's reasoning at every stage.

```mermaid
flowchart TB
    subgraph INPUT["Evidence Available"]
        ERR["Error: #password not found<br/>(timeout in login hook)"]
        SCREENSHOTS["Screenshots:<br/>Login page with email input"]
        DIFF["PR Diff:<br/>LessonRenderer.tsx<br/>content-parser.ts<br/>ContentFallback.tsx"]
    end

    INPUT --> ANALYSIS

    subgraph ANALYSIS["Analysis (openai-client.ts)"]
        direction TB
        HYPOTHESIS["Model forms hypothesis:<br/>'#password selector not found'"]
        CAUSAL_CHECK{"CAUSAL CONSISTENCY CHECK:<br/>Does the diff touch<br/>login/auth code?"}
        HYPOTHESIS --> CAUSAL_CHECK
        CAUSAL_CHECK -->|"No — diff only shows<br/>LMS rendering changes"| CORRECT["✅ Correct reasoning:<br/>'Login failure is unrelated to PR.<br/>Pre-existing environment issue<br/>or flaky test.'"]
        CAUSAL_CHECK -->|"Yes — diff shows<br/>auth changes"| INVESTIGATE["Investigate correlation<br/>between diff and failure"]
    end

    subgraph BAD_PATH["❌ OLD Behavior (pre-v1.21.0)"]
        direction TB
        BAD_THEORY["Model fabricates:<br/>'Login UI changed to passwordless'"]
        BAD_EVIDENCE["Cherry-picks evidence:<br/>'loginWithEmail endpoint<br/>confirms new flow'"]
        BAD_FIX["Generates fix:<br/>Rewrite login command for<br/>both auth UIs"]
        BAD_THEORY --> BAD_EVIDENCE --> BAD_FIX
    end

    subgraph GOOD_PATH["✅ NEW Behavior (v1.21.0+)"]
        direction TB
        GOOD_THEORY["Model cross-references diff:<br/>'No auth files in diff'"]
        GOOD_CONCLUSION["Concludes:<br/>'Pre-existing env issue.<br/>Login UI not changed by this PR.'"]
        GOOD_FIX["Fix addresses brittleness:<br/>Add fallback selectors or<br/>improve wait strategy"]
        GOOD_THEORY --> GOOD_CONCLUSION --> GOOD_FIX
    end

    CORRECT --> GOOD_PATH

    subgraph REVIEW_GATE["Review Agent Gate"]
        REVIEW_CHECK{"Does fix reasoning<br/>contradict the diff?"}
        REVIEW_CHECK -->|"Yes"| REJECT["❌ CRITICAL: Rejected<br/>'Fix claims login UI changed<br/>but diff shows no auth changes'"]
        REVIEW_CHECK -->|"No"| APPROVE["✅ Approved"]
    end

    GOOD_FIX --> REVIEW_GATE
    BAD_FIX -.->|"Now caught by"| REVIEW_GATE
```

## Repository Integration Map

```mermaid
flowchart LR
    subgraph TRIAGE["adept-triage-agent<br/>(GitHub Action)"]
        direction TB
        ACTION["action.yml<br/>Node.js 20 Runtime"]
        SRC["src/ TypeScript Source"]
        DIST["dist/ Compiled Bundle"]
    end

    subgraph CONSUMER_REPOS["Consumer Repositories"]
        direction TB

        subgraph LEARN["learn-webapp, lib-cypress-canary,<br/>lib-wdio-8-e2e-ts, lib-wdio-8-multi-remote<br/>(Consumer Repos)"]
            LW_WF["Test + triage-failed-tests.yml workflows"]
            LW_TESTS["E2E Tests<br/>• Cypress (learn-webapp, lib-cypress-canary)<br/>• WebDriverIO (lib-wdio-8-e2e-ts, multi-remote)"]
        end

        subgraph ANY_REPO["Any Repo<br/>(via examples)"]
            AR_INLINE["Inline Usage<br/>(same workflow, best-effort)"]
            AR_DISPATCH["Repository Dispatch<br/>(separate workflow)"]
            AR_WF_RUN["workflow_run Trigger<br/>(separate workflow)"]
        end
    end

    subgraph EXTERNAL["External Services"]
        OPENAI["OpenAI API<br/>gpt-5.3-codex<br/>Responses API"]
        GITHUB_API["GitHub REST API<br/>• Workflow logs<br/>• Artifacts<br/>• File content<br/>• PR diffs<br/>• Branch creation"]
        SLACK["Slack<br/>(via adept-common<br/>triage-slack-notify)"]
    end

    subgraph COMMON["adept-common<br/>(Shared Actions)"]
        DISPATCH["triage-dispatch<br/>GitHub Action"]
        TRIAGE_WF["triage-failed-tests.yml<br/>Reusable Workflow"]
        NOTIFY["triage-slack-notify<br/>GitHub Action"]
    end

    LEARN -->|"if: failure() uses triage-dispatch@main"| COMMON
    COMMON -->|"repository_dispatch: triage-failed-test"| LEARN
    LEARN -->|"all consumer repos use shared triage workflow"| COMMON
    LEARN -->|"uses: adept-at/adept-triage-agent@v1"| TRIAGE
    ANY_REPO -->|"uses: adept-at/adept-triage-agent@v1"| TRIAGE

    TRIAGE -->|"API calls"| OPENAI
    TRIAGE -->|"API calls"| GITHUB_API
    TRIAGE -->|"outputs (verdict, confidence, summary)"| COMMON
    COMMON -->|"webhook"| SLACK

    GITHUB_API -->|"logs, artifacts,<br/>screenshots, diffs"| TRIAGE
    OPENAI -->|"analysis JSON"| TRIAGE
```

## Data Flow Detail

```mermaid
flowchart LR
    subgraph INPUTS_LAYER["Inputs"]
        GH_TOKEN["GITHUB_TOKEN"]
        OAI_KEY["OPENAI_API_KEY"]
        WF_RUN_ID["WORKFLOW_RUN_ID"]
        JOB["JOB_NAME"]
        PR["PR_NUMBER + COMMIT_SHA"]
        REPO["REPOSITORY + BRANCH"]
        CONF_THRESH["CONFIDENCE_THRESHOLD"]
        FRAMEWORKS["TEST_FRAMEWORKS<br/>(cypress | webdriverio)"]
        AUTOFIX_IN["ENABLE_AUTO_FIX<br/>ENABLE_AGENTIC_REPAIR"]
    end

    subgraph COLLECTION["Data Collection Layer"]
        direction TB
        LOGS_RAW["Raw Workflow Logs"]
        SCREENSHOTS_RAW["Screenshots (PNG → base64)"]
        DIFF_RAW["PR/Branch/Commit Diff Patches"]
        ERROR_MSG["Error Messages + Stack Traces"]
        ARTIFACT_LOGS["Uploaded Test Artifact Logs"]
    end

    subgraph AI_LAYER["AI Analysis Layer"]
        direction TB
        PROMPT["Structured Prompt<br/>error + logs + screenshots + diff<br/>+ structured summary header"]
        MODEL["gpt-5.3-codex<br/>Responses API<br/>JSON output format<br/>max 16384 tokens"]
        RESPONSE["Structured JSON Response<br/>verdict + reasoning + indicators"]
    end

    subgraph OUTPUT_LAYER["Outputs"]
        direction TB
        VERDICT_OUT["verdict: TEST_ISSUE | PRODUCT_ISSUE | INCONCLUSIVE | PENDING | ERROR | NO_FAILURE"]
        CONF_OUT["confidence: 0-95"]
        REASON_OUT["reasoning: detailed explanation"]
        SUMMARY_OUT["summary: brief for PR comments"]
        JSON_OUT["triage_json: complete analysis"]
        FIX_OUT["fix_recommendation: proposed changes"]
        AUTOFIX_OUT["auto_fix_branch: branch name"]
        VALID_OUT["validation_status: pending | skipped"]
    end

    INPUTS_LAYER --> COLLECTION
    COLLECTION --> AI_LAYER
    AI_LAYER --> OUTPUT_LAYER
```

## Sub-Agent Architecture

```mermaid
flowchart TB
    subgraph AGENTS["Five Specialized Agents"]
        direction TB

        subgraph A1["AnalysisAgent"]
            A1_IN["Input: error, logs, screenshots, PR diff"]
            A1_WORK["Classifies root cause<br/>SELECTOR_MISMATCH | TIMING_ISSUE<br/>STATE_DEPENDENCY | NETWORK_ISSUE<br/>ELEMENT_VISIBILITY | ASSERTION_MISMATCH<br/>DATA_DEPENDENCY | ENVIRONMENT_ISSUE | UNKNOWN"]
            A1_OUT["Output: category, confidence,<br/>selectors, patterns"]
            A1_IN --> A1_WORK --> A1_OUT
        end

        subgraph A2["CodeReadingAgent"]
            A2_IN["Input: test file path, selectors"]
            A2_WORK["Fetches source via GitHub API<br/>Parses imports & helpers<br/>Finds page objects & commands<br/>(No LLM — deterministic)"]
            A2_OUT["Output: source file content,<br/>related files, custom commands"]
            A2_IN --> A2_WORK --> A2_OUT
        end

        subgraph A3["InvestigationAgent"]
            A3_IN["Input: analysis + code context"]
            A3_WORK["Deep investigation<br/>Correlates findings<br/>Identifies fixable selectors"]
            A3_OUT["Output: findings, isFixable,<br/>selectorsToUpdate, approach"]
            A3_IN --> A3_WORK --> A3_OUT
        end

        subgraph A4["FixGenerationAgent"]
            A4_IN["Input: analysis + investigation<br/>+ source + PR diff + feedback"]
            A4_WORK["Generates exact code changes<br/>oldCode → newCode<br/>Validates against PR diff"]
            A4_OUT["Output: CodeChange[],<br/>confidence, evidence"]
            A4_IN --> A4_WORK --> A4_OUT
        end

        subgraph A5["ReviewAgent"]
            A5_IN["Input: proposed fix + analysis<br/>+ source + PR diff"]
            A5_WORK["Validates fix quality<br/>Checks oldCode matches source<br/>Verifies diff consistency<br/>Flags CRITICAL/WARNING issues"]
            A5_OUT["Output: approved/rejected,<br/>issues[], assessment"]
            A5_IN --> A5_WORK --> A5_OUT
        end
    end

    A1 -->|analysis| A2
    A2 -->|code context| A3
    A3 -->|investigation| A4
    A4 -->|proposed fix| A5
    A5 -->|"rejected + feedback"| A4
```
