# Adept Triage Agent - Usage Guide

## Overview

The Adept Triage Agent is a GitHub Action that uses AI (GPT-5.3 Codex) to automatically analyze test failures and determine whether they are **test issues** (flaky tests, timing issues) or **product issues** (actual bugs).

The action returns a comprehensive JSON object containing the analysis results, which you can integrate into your existing notification systems, dashboards, or workflows.

## Important: Workflow Architecture

⚠️ **The most reliable setup is to run the Adept Triage Agent in a separate workflow from your tests.**

For full logs, uploaded artifacts, and completed workflow context, use a two-workflow architecture:

1. **Test Workflow**: Runs your tests and dispatches an event on failure
2. **Triage Workflow**: Listens for the dispatch event and runs the analysis

Best-effort same-workflow analysis is still supported when you target the current job, but it has less complete context than the recommended separate-workflow pattern.

## Version Compatibility

We recommend using the major version tag for automatic updates:

- **`@v1`** - Automatically gets backward-compatible updates (recommended)
- **`@v1.47.0`** - Pin to specific version for full reproducibility

## Quick Start

### Step 1: Create the Triage Workflow

Create `.github/workflows/triage-failed-tests.yml` — a thin wrapper that calls the shared reusable workflow from `adept-common`:

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

permissions:
  contents: write
  actions: read

jobs:
  triage:
    uses: adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main
    with:
      workflow-run-id: ${{ github.event.client_payload.workflow_run_id }}
      job-name: ${{ github.event.client_payload.job_name }}
      spec: ${{ github.event.client_payload.spec }}
      pr-number: ${{ github.event.client_payload.pr_number }}
      commit-sha: ${{ github.event.client_payload.commit_sha }}
      branch: ${{ github.event.client_payload.branch }}
      repository: ${{ github.event.client_payload.repo_url }}
      preview-url: ${{ github.event.client_payload.preview_url }}
      test-frameworks: 'cypress'
    secrets:
      CROSS_REPO_PAT: ${{ secrets.CROSS_REPO_PAT }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

The shared workflow handles input validation, workflow polling, running the triage agent, saving artifacts, and Slack notification.

For same-repo setups (tests and source in the same repo), pass `${{ secrets.GITHUB_TOKEN }}` as `CROSS_REPO_PAT`. A PAT is only required when `REPOSITORY` or `AUTO_FIX_TARGET_REPO` points to a different repo.

### Step 2: Update Your Test Workflow

In your test workflow, add the shared dispatch action to trigger triage on failure:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test: [test1, test2, test3]
    steps:
      - name: Run Tests
        run: npm test

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }} (${{ matrix.test }})
          spec: ${{ matrix.test }}
          branch: ${{ github.head_ref || github.ref_name }}
          commit-sha: ${{ github.event.pull_request.head.sha || github.sha }}
```

## Complete Example

Here's a full example showing how to integrate the triage agent with Slack notifications:

### Test Workflow (`.github/workflows/tests.yml`)

```yaml
name: Run Tests

on: [push, pull_request]

jobs:
  cypress:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        containers: [spec1.cy.ts, spec2.cy.ts, spec3.cy.ts]
    steps:
      - uses: actions/checkout@v4

      - name: Run Cypress tests
        run: npx cypress run --spec ./cypress/e2e/${{ matrix.containers }}

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }} (${{ matrix.containers }})
          spec: ${{ matrix.containers }}
          pr-number: ${{ github.event.pull_request.number || '' }}
          branch: ${{ github.head_ref || github.ref_name }}
```

### Triage Workflow (`.github/workflows/triage-failed-tests.yml`)

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

permissions:
  contents: write
  actions: read

jobs:
  triage:
    uses: adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main
    with:
      workflow-run-id: ${{ github.event.client_payload.workflow_run_id }}
      job-name: ${{ github.event.client_payload.job_name }}
      spec: ${{ github.event.client_payload.spec }}
      pr-number: ${{ github.event.client_payload.pr_number }}
      commit-sha: ${{ github.event.client_payload.commit_sha }}
      branch: ${{ github.event.client_payload.branch }}
      repository: ${{ github.event.client_payload.repo_url }}
      preview-url: ${{ github.event.client_payload.preview_url }}
      test-frameworks: 'cypress'
    secrets:
      CROSS_REPO_PAT: ${{ secrets.CROSS_REPO_PAT }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

The shared workflow handles input validation, workflow polling, running the triage agent, saving artifacts, and Slack notification. No local logic needed.

## Why Separate Workflows?

The triage agent needs to analyze the complete workflow run, including:

- All job logs
- Test artifacts
- Screenshots
- Timing information

This information is only fully available after the workflow completes. Running the triage agent in a separate workflow avoids partial context and timing issues:

- The workflow can't complete until all steps (including triage) finish
- The triage can't run until the workflow completes

By using separate workflows with repository dispatch events, we ensure the test workflow completes fully before analysis begins.

If you point the action at the current in-progress job, it can still do a best-effort analysis from available logs, but that mode is intentionally less complete.

## Inputs

| Input                  | Required | Default                    | Description                                                                                                                                                                                                                                       |
| ---------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`       | ✅ Yes   | -                          | Your OpenAI API key for AI analysis                                                                                                                                                                                                               |
| `GITHUB_TOKEN`         | No       | `${{ github.token }}`      | GitHub token for API access. Use a PAT or GitHub App token when `REPOSITORY` or `AUTO_FIX_TARGET_REPO` points to a different repository. See [Cross-Repository Access](./README_CROSS_REPO_PR.md) for details. |
| `WORKFLOW_RUN_ID`      | No       | Current run                | The workflow run ID to analyze                                                                                                                                                                                                                    |
| `JOB_NAME`             | No       | All failed jobs            | Specific job name to analyze                                                                                                                                                                                                                      |
| `ERROR_MESSAGE`        | No       | From logs/artifacts        | Error message to analyze (if not using artifacts)                                                                                                                                                                                                 |
| `CONFIDENCE_THRESHOLD` | No       | `70`                       | Minimum confidence level for verdict (0-100)                                                                                                                                                                                                      |
| `PR_NUMBER`            | No       | -                          | Pull request number to fetch diff from (enables PR diff analysis)                                                                                                                                                                                 |
| `COMMIT_SHA`           | No       | -                          | Commit SHA associated with the test failure                                                                                                                                                                                                       |
| `BRANCH`               | No       | -                          | Branch being tested, used for branch diff lookup when no PR number is available                                                                                                                                                                  |
| `REPOSITORY`           | No       | `${{ github.repository }}` | App/source repository in owner/repo format for PR, branch, or commit diff lookup. Workflow runs and artifacts are still read from the repository where the action executes.                                                                    |
| `PRODUCT_REPO`         | No       | `adept-at/learn-webapp`    | Product repository (owner/repo) for recent commit diff used in classification. Empty input resolves to this default; workflows do not need to pass it unless targeting another repo.                                                              |
| `PRODUCT_DIFF_COMMITS` | No       | `5`                        | Number of recent product commits to include in that diff                                                                                                                                                                                          |
| `TEST_FRAMEWORKS`      | No       | `cypress`                  | Test framework: "cypress" or "webdriverio"                                                                                                                                                                                                         |
| `ENABLE_AUTO_FIX` | No | `false` | Enable automatic branch creation with fix |
| `AUTO_FIX_BASE_BRANCH` | No | `main` | Base branch to create fix branch from |
| `AUTO_FIX_MIN_CONFIDENCE` | No | `70` | Minimum fix confidence (0-100) to apply auto-fix |
| `AUTO_FIX_TARGET_REPO` | No | `${{ github.repository }}` | Repository for fix branches (owner/repo format) |
| `ENABLE_VALIDATION` | No | `false` | With `ENABLE_AUTO_FIX` and `VALIDATION_TEST_COMMAND`, runs local validation before push (clone, `npm ci`, apply fix, run command; push + PR on pass; up to 3 iterations). |
| `VALIDATION_WORKFLOW` | No | `validate-fix.yml` | Used only when `VALIDATION_TEST_COMMAND` is unset (legacy remote dispatch). |
| `VALIDATION_PREVIEW_URL` | No | - | Replaces `{url}` in `VALIDATION_TEST_COMMAND`. |
| `VALIDATION_SPEC` | No | - | Replaces `{spec}` in `VALIDATION_TEST_COMMAND`. |
| `VALIDATION_TEST_COMMAND` | No | - | Local test command template; `{spec}` and `{url}` placeholders. Primary validation path when set. |
| `ENABLE_AGENTIC_REPAIR` | No | `true` | Enable multi-agent repair pipeline (enabled by default; set `'false'` to use single-shot) |
| `NPM_TOKEN` | No | - | NPM token for private registry authentication during local validation `npm ci` |
| **Skill Store Inputs** | | | |
| `TRIAGE_AWS_REGION` | No | `us-east-1` | AWS region for DynamoDB skill store |
| `TRIAGE_DYNAMO_TABLE` | No | `triage-skills-v1-live` | DynamoDB table name for skill store |

## Outputs

| Output        | Description                      | Example                                                     |
| ------------- | -------------------------------- | ----------------------------------------------------------- |
| `verdict`     | Classification of the failure    | `TEST_ISSUE`, `PRODUCT_ISSUE`, `NO_FAILURE`, `INCONCLUSIVE`, `PENDING`, or `ERROR` |
| `confidence`  | Confidence score (0-100)         | `95`                                                        |
| `reasoning`   | Detailed explanation             | "The test failed due to a timing issue..."                  |
| `summary`     | Brief summary for notifications  | "🧪 Test Issue: Timing issue with auto-save indicator"      |
| `triage_json` | Complete triage analysis as JSON | See [Output Format](#output-format)                         |
| `has_fix_recommendation` | Boolean: fix recommendation generated (TEST_ISSUE only) | - |
| `fix_recommendation` | Complete fix recommendation as JSON | - |
| `fix_summary` | Human-readable fix summary | - |
| `fix_confidence` | Fix recommendation confidence (0-100) | - |
| `auto_fix_applied` | Whether auto-fix branch was created (true/false) | - |
| `auto_fix_branch` | Created branch name | - |
| `auto_fix_commit` | Last commit SHA from auto-fix | - |
| `auto_fix_files` | JSON array of modified file paths | - |
| `validation_run_id` | Validation workflow run ID (legacy remote path only) | - |
| `validation_status` | `passed`, `pending`, or `skipped` | - |
| `validation_url` | URL to validation workflow run (legacy remote path only) | - |

### Special Verdicts

- **`PENDING`**: The workflow is still running and analysis cannot be performed yet
- **`INCONCLUSIVE`**: Evidence is insufficient or ambiguous — confidence fell below the threshold, the AI concluded the evidence was inconclusive, or an infrastructure failure (browser crash, session termination) was detected
- **`ERROR`**: The action could not collect enough data or encountered a runtime failure

## Complete Integration Example

The recommended integration pattern uses two workflows:

1. **Test Workflow**: Runs tests and dispatches events on failure
2. **Triage Workflow**: Analyzes failures and sends notifications

### Key Integration Points:

1. **Test workflow dispatches an event** on failure with workflow context
2. **Triage workflow waits** for the test workflow to complete
3. **Triage analysis runs** and returns structured JSON results
4. **Results are sent** to your notification systems (Slack, Discord, JIRA, etc.)

Here's a real-world example with matrix strategy and Slack notifications:

### Test Workflow Example

```yaml
name: preview-url-saucelabs

on:
  repository_dispatch:
    types: [trigger-skill-preview-sauce]

jobs:
  generate-matrix:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.set-matrix.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - name: Generate matrix
        id: set-matrix
        run: |
          DIRECTORY="cypress/preview"
          FILES=$(ls -1 "$DIRECTORY" | jq -R -s -c 'split("\n")[:-1]')
          echo "matrix=$FILES" >> $GITHUB_OUTPUT

  previewUrlTest:
    needs: generate-matrix
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        containers: ${{ fromJson(needs.generate-matrix.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v4
      - name: Run Cypress
        run: |
          npx cypress run --spec ./cypress/preview/${{ matrix.containers }}
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }} (${{ matrix.containers }})
          spec: ${{ matrix.containers }}
          pr-number: ${{ github.event.client_payload.pr_number }}
          preview-url: ${{ github.event.client_payload.target_url }}
```

### Corresponding Triage Workflow

Uses the same shared reusable workflow pattern shown in the Complete Example above.

## Output Format

The `triage_json` output contains the complete analysis as a JSON string. This is designed to be easily added as a property to your existing notification payloads, monitoring dashboards, or any other systems.

### Example JSON Structure:

```json
{
  "verdict": "PRODUCT_ISSUE",
  "confidence": 95,
  "reasoning": "The test failed because a dropdown button is not visible due to being covered by another element. The CSS shows position:fixed being overlapped by a div with class 'css-gya850'. This is a z-index/layering bug in the product.",
  "summary": "🐛 Product Issue: Dropdown button covered by overlay element",
  "indicators": [
    "Element has position:fixed but is covered",
    "Cypress error: 'element is not visible'",
    "Screenshot shows UI rendered but button not interactable"
  ],
  "suggestedSourceLocations": [
    {
      "file": "src/components/Dropdown.tsx",
      "lines": "45-67",
      "reason": "Component with z-index issue causing overlay problem"
    }
  ],
  "metadata": {
    "analyzedAt": "2025-07-25T18:56:27.148Z",
    "hasScreenshots": true,
    "logSize": 143246
  }
}
```

Additional fields in metadata for special cases:

- **INCONCLUSIVE verdict**: includes `confidenceThreshold` field
- **PENDING verdict**: includes `workflowStatus` field

The `suggestedSourceLocations` field is only included for `PRODUCT_ISSUE` verdicts and provides hints about which source files might contain the bug.

### Integration Example:

In the workflow example above, we add the triage JSON as a property to the existing Slack notification:

```json
{
  "text": "Your existing notification text...",
  "triage": {
    "verdict": "PRODUCT_ISSUE",
    "confidence": 95
    // ... rest of triage analysis
  }
}
```

This allows you to maintain your existing notification structure while enriching it with AI-powered triage insights.

## Advanced Usage

### Analyzing Multiple Jobs

To analyze all failed jobs in a workflow:

```yaml
- name: Analyze All Failures
  if: failure()
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    # Omit JOB_NAME to analyze all failed jobs
```

### Change Diff Analysis

The agent always attempts to fetch a **recent product-repo diff** (default repository `adept-at/learn-webapp`, last few commits). You do not need to pass `PRODUCT_REPO` unless you want a different product repository; `getInputs()` and the action default already resolve to that repo when the input is empty.

When you provide a `PR_NUMBER`, `BRANCH`, or `COMMIT_SHA`, the triage agent can also:

1. Fetch the relevant **test-repo** PR, branch, or commit diff from `REPOSITORY`
2. Analyze if those changes are related to the test failure
3. Calculate a risk score (high/medium/low/none)
4. Use **both** test-repo and product-repo diff context in the classification prompt for more accurate `TEST_ISSUE` vs `PRODUCT_ISSUE` verdicts

This is especially useful for determining if a test failure is caused by recent code changes:

```yaml
- name: Run AI triage analysis
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'
    PR_NUMBER: '${{ github.event.client_payload.pr_number }}' # Or use BRANCH / COMMIT_SHA for non-PR runs
```

### Using with Different Test Frameworks

The action supports both Cypress and WebdriverIO test frameworks with optimized error extraction:

```yaml
# Cypress example with artifacts
- name: Run Cypress Tests
  run: npm run cypress:run

- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: cypress-artifacts
    path: |
      cypress/screenshots/
      cypress/videos/

- name: AI Triage
  if: failure()
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    TEST_FRAMEWORKS: 'cypress' # or 'webdriverio'
```

### Custom Confidence Thresholds

Adjust the confidence threshold for more or less strict verdicts:

```yaml
- name: Strict Analysis
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    CONFIDENCE_THRESHOLD: '90' # Require 90% confidence
```

### Error Extraction

The action supports both Cypress and WebdriverIO, while still recognizing many Cypress-specific error patterns:

```yaml
- name: Analyze Cypress Tests
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    TEST_FRAMEWORKS: 'cypress'
```

### Minimal Usage (Only Workflow ID)

If you only have a workflow run ID and want the agent to automatically find the failed job:

```yaml
name: Minimal Triage
on:
  workflow_dispatch:
    inputs:
      workflow_run_id:
        description: 'Workflow run ID to analyze'
        required: true

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Analyze Test Failure
        uses: adept-at/adept-triage-agent@v1
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: ${{ github.event.inputs.workflow_run_id }}
          # No PR_NUMBER, COMMIT_SHA, or JOB_NAME needed
          # Agent will automatically:
          # - Find the first failed job
          # - Collect all available logs
          # - Fetch screenshots and artifacts
          # - Analyze with whatever data is available
```

The agent handles missing optional inputs gracefully:

- **No PR_NUMBER / BRANCH / COMMIT_SHA**: Test-repo PR/branch/commit diff lookup is skipped; recent **product-repo** diff is still fetched using the default product repository (or `PRODUCT_REPO` when set), subject to GitHub API access
- **No JOB_NAME**: Automatically finds the first failed job
- **No COMMIT_SHA**: Not required for analysis
- **No REPOSITORY**: Uses the current repository for diff lookup as well

Even if some data collection fails (e.g., screenshots unavailable), the agent will proceed with whatever data it can gather.

## How It Works

1. **Data Collection**: Fetches workflow logs, screenshots, test artifacts, test-repo PR/branch/commit diff, and recent product-repo diff (default `adept-at/learn-webapp`) in parallel
2. **Skill Memory Loading**: When `AUTO_FIX_TARGET_REPO` resolves (defaults to the current repo), loads historical fix patterns from DynamoDB and checks for flakiness signals. This happens *before* classification so skill context can feed the classifier prompt as well as repair agents
3. **Infrastructure Check**: Short-circuits to `INCONCLUSIVE` if a browser crash or session termination is detected (no LLM call)
4. **AI Classification**: Sends structured error summary, logs, screenshots, diffs, and any injected skill + flakiness context to GPT-5.3 Codex via the Responses API to classify as `TEST_ISSUE`, `PRODUCT_ISSUE`, or `INCONCLUSIVE`
5. **Confidence Gating**: If confidence is below `CONFIDENCE_THRESHOLD`, returns `INCONCLUSIVE` without attempting repair
6. **Fix Generation**: For `TEST_ISSUE` verdicts, uses either the multi-agent pipeline (Analysis → Code Reading → Investigation → Fix/Review loop with skill memory injected) or single-shot repair
7. **Fix Application**: Depending on configuration, applies the fix via the local validation loop (clone → apply → test → push/PR) or via the GitHub API (legacy path). All fix attempts (both validated successes and failed trajectories) are saved as skills for future runs.

### Structured Error Summary (v1.5.0+)

The triage agent automatically creates a structured summary of the error before sending it to OpenAI, improving accuracy and speed. This includes:

- **Error Classification**: Type (AssertionError, NetworkError, etc.) and location
- **Test Context**: Test name, file, framework, browser, and duration
- **Failure Indicators**: Detects network errors, null pointers, timeouts, DOM issues, assertions
- **PR Impact Analysis**: Calculates risk score based on modified files
- **Key Metrics**: Screenshot availability, last command, log size

This pre-analysis helps GPT-5.3 Codex make more accurate determinations between test issues and product bugs.

### Skill Memory and Flakiness Detection

When `AUTO_FIX_TARGET_REPO` resolves (defaults to the current repo), the agent loads historical fix patterns from a DynamoDB skill store using AWS credentials supplied to the action (e.g. via OIDC). These "skills" are injected into the classifier prompt and every repair agent so the multi-agent pipeline can reuse proven patterns rather than re-deriving fixes from scratch. If the DynamoDB load fails, the run continues with an empty in-memory cache and skips the pruning step to avoid deleting unknown entries.

Skills are saved for all fix attempts — both validated successes and failed trajectories. This allows the pipeline to learn from every attempt, not just successful ones.

The agent also detects **flakiness** by counting how many times a given spec has been auto-fixed recently:
- **>1 fix in 3 days**: flagged as chronically flaky
- **>2 fixes in 7 days**: flagged as recurring instability

Flakiness signals are included in the `triage_json` output and injected into agent prompts so the pipeline can account for known instability.

## Best Practices

1. **Prefer separate workflows** - Same-workflow analysis is best-effort only and has less complete context
2. **Pass meaningful context** - Include job names, test specs, PR numbers, etc. in your dispatch payload
3. **Handle timeouts gracefully** - The wait step should have a reasonable timeout (10 minutes is usually sufficient)
4. **Don't block on triage** - Let your test workflow complete even if triage dispatch fails
5. **Enrich notifications** - Use the triage results to make your existing notifications more informative

## Requirements

- **OpenAI API Key**: Required for AI analysis
- **GitHub Token**: Usually available as `${{ github.token }}`
- **Node.js 24**: The action runs on Node.js 24

## Troubleshooting

### No Screenshots Found

- Ensure artifacts are uploaded before the triage action runs
- Check that screenshot paths match your test framework's output

### Low Confidence Scores

- Provide more context via artifacts
- Ensure logs contain the actual error messages
- Screenshots greatly improve confidence

### API Rate Limits

- The action uses GPT-5.3 Codex which has generous rate limits
- Classification typically uses 1 API call
- Agentic repair adds 4-15 API calls depending on fix/review iterations
- Local validation iterations multiply the repair call count (up to 3x)

## Support

For issues or questions:

- Open an issue on [GitHub](https://github.com/adept-at/adept-triage-agent)
- Check the [example workflows](https://github.com/adept-at/adept-triage-agent/tree/main/examples)

## License

MIT License - see [LICENSE](LICENSE) file for details.
