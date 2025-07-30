# Adept Triage Agent - Usage Guide

## Overview

The Adept Triage Agent is a GitHub Action that uses AI (GPT-4.1) to automatically analyze test failures and determine whether they are **test issues** (flaky tests, timing issues) or **product issues** (actual bugs).

The action returns a comprehensive JSON object containing the analysis results, which you can integrate into your existing notification systems, dashboards, or workflows.

## Important: Workflow Architecture

⚠️ **The Adept Triage Agent must be run in a separate workflow from your tests.**

Running the triage agent within the same workflow that it's trying to analyze creates a circular dependency - the workflow can't be analyzed until it's complete, but it can't complete until the analysis is done. To solve this, use a two-workflow architecture:

1. **Test Workflow**: Runs your tests and dispatches an event on failure
2. **Triage Workflow**: Listens for the dispatch event and runs the analysis

## Version Compatibility

We recommend using the major version tag for automatic updates:

- **`@v1`** - Automatically gets backward-compatible updates (recommended)
- **`@v1.3.1`** - Pin to specific version if needed

## Quick Start

### Step 1: Create the Triage Workflow

First, create a separate workflow file (e.g., `.github/workflows/triage-failed-tests.yml`):

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for workflow to complete
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const workflowRunId = parseInt('${{ github.event.client_payload.workflow_run_id }}');

            // Poll for workflow completion (max 10 minutes)
            let attempts = 0;
            const maxAttempts = 60; // 60 * 10 seconds = 10 minutes

            while (attempts < maxAttempts) {
              const { data: run } = await github.rest.actions.getWorkflowRun({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: workflowRunId
              });
              
              if (run.status === 'completed') {
                console.log('Workflow completed');
                break;
              }
              
              attempts++;
              if (attempts < maxAttempts) {
                console.log(`Waiting 10 seconds... (attempt ${attempts}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 10000));
              }
            }

      - name: Run triage analysis
        id: triage
        uses: adept-at/adept-triage-agent@v1.3.1
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'
          JOB_NAME: '${{ github.event.client_payload.job_name }}'

      - name: Use triage results
        run: |
          echo "Verdict: ${{ steps.triage.outputs.verdict }}"
          echo "Confidence: ${{ steps.triage.outputs.confidence }}"
          echo "Summary: ${{ steps.triage.outputs.summary }}"
```

### Step 2: Update Your Test Workflow

In your test workflow, add a step to trigger the triage workflow on failure:

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

      - name: Trigger triage workflow
        if: failure()
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            await github.rest.repos.createDispatchEvent({
              owner: context.repo.owner,
              repo: context.repo.repo,
              event_type: 'triage-failed-test',
              client_payload: {
                workflow_run_id: context.runId.toString(),
                job_name: '${{ github.job }} (${{ matrix.test }})',
                // Include any other context you want to pass
                spec: '${{ matrix.test }}',
                branch: context.ref.replace('refs/heads/', ''),
                commit_sha: context.sha
              }
            });
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

      - name: Send initial failure notification
        if: failure()
        run: |
          # Use jq for consistent JSON formatting
          PAYLOAD=$(jq -n \
            --arg text "❌ Test Failed: ${{ github.job }} - ${{ matrix.containers }}" \
            '{ text: $text }')

          curl -X POST \
            -H 'Content-type: application/json' \
            -d "$PAYLOAD" \
            ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Trigger triage analysis
        if: failure()
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            await github.rest.repos.createDispatchEvent({
              owner: context.repo.owner,
              repo: context.repo.repo,
              event_type: 'triage-failed-test',
              client_payload: {
                workflow_run_id: context.runId.toString(),
                job_name: '${{ github.job }}',
                spec: '${{ matrix.containers }}',
                pr_number: '${{ github.event.pull_request.number }}',
                branch: context.ref.replace('refs/heads/', '')
              }
            });
```

### Triage Workflow (`.github/workflows/triage.yml`)

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for workflow completion
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const workflowRunId = parseInt('${{ github.event.client_payload.workflow_run_id }}');

            // Wait for workflow to complete
            let attempts = 0;
            while (attempts < 60) {
              const { data: run } = await github.rest.actions.getWorkflowRun({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: workflowRunId
              });
              
              if (run.status === 'completed') break;
              
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 10000));
            }

      - name: Run triage analysis
        id: triage
        uses: adept-at/adept-triage-agent@v1.3.1
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'
          JOB_NAME: '${{ github.event.client_payload.job_name }}'

      - name: Send triage results to Slack
        run: |
          VERDICT="${{ steps.triage.outputs.verdict }}"
          CONFIDENCE="${{ steps.triage.outputs.confidence }}"
          SUMMARY="${{ steps.triage.outputs.summary }}"
          SPEC="${{ github.event.client_payload.spec }}"

          # Determine emoji based on verdict
          if [ "$VERDICT" = "TEST_ISSUE" ]; then
            EMOJI="⚠️"
          elif [ "$VERDICT" = "PRODUCT_ISSUE" ]; then
            EMOJI="🚨"
          else
            EMOJI="❓"
          fi

          # Use jq for proper JSON formatting and escaping
          PAYLOAD=$(jq -n \
            --arg emoji "$EMOJI" \
            --arg spec "$SPEC" \
            --arg verdict "$VERDICT" \
            --arg confidence "$CONFIDENCE%" \
            --arg summary "$SUMMARY" \
            '{
              text: ($emoji + " AI Triage Result for " + $spec),
              attachments: [{
                color: "warning",
                fields: [
                  {title: "Verdict", value: $verdict, short: true},
                  {title: "Confidence", value: $confidence, short: true},
                  {title: "Summary", value: $summary}
                ]
              }]
            }')

          curl -X POST \
            -H 'Content-type: application/json' \
            -d "$PAYLOAD" \
            ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Why Separate Workflows?

The triage agent needs to analyze the complete workflow run, including:

- All job logs
- Test artifacts
- Screenshots
- Timing information

This information is only available after the workflow completes. Running the triage agent within the same workflow creates a deadlock:

- The workflow can't complete until all steps (including triage) finish
- The triage can't run until the workflow completes

By using separate workflows with repository dispatch events, we ensure the test workflow completes fully before analysis begins.

## Inputs

| Input                  | Required | Default               | Description                                                                                                                                                                                                                                       |
| ---------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`       | ✅ Yes   | -                     | Your OpenAI API key for AI analysis                                                                                                                                                                                                               |
| `GITHUB_TOKEN`         | No       | `${{ github.token }}` | GitHub token for API access. **Note**: A Personal Access Token (PAT) is only needed when the triage agent runs in a different repository than the source code being tested. See [Cross-Repository Access](./README_CROSS_REPO_PR.md) for details. |
| `WORKFLOW_RUN_ID`      | No       | Current run           | The workflow run ID to analyze                                                                                                                                                                                                                    |
| `JOB_NAME`             | No       | All failed jobs       | Specific job name to analyze                                                                                                                                                                                                                      |
| `ERROR_MESSAGE`        | No       | From logs/artifacts   | Error message to analyze (if not using artifacts)                                                                                                                                                                                                 |
| `CONFIDENCE_THRESHOLD` | No       | `70`                  | Minimum confidence level for verdict (0-100)                                                                                                                                                                                                      |

## Outputs

| Output        | Description                      | Example                                                     |
| ------------- | -------------------------------- | ----------------------------------------------------------- |
| `verdict`     | Classification of the failure    | `TEST_ISSUE`, `PRODUCT_ISSUE`, `INCONCLUSIVE`, or `PENDING` |
| `confidence`  | Confidence score (0-100)         | `95`                                                        |
| `reasoning`   | Detailed explanation             | "The test failed due to a timing issue..."                  |
| `summary`     | Brief summary for notifications  | "🧪 Test Issue: Timing issue with auto-save indicator"      |
| `triage_json` | Complete triage analysis as JSON | See [Output Format](#output-format)                         |

### Special Verdicts

- **`PENDING`**: The workflow is still running and analysis cannot be performed yet
- **`INCONCLUSIVE`**: The analysis completed but confidence is below the threshold

## Complete Integration Example

The triage agent requires a two-workflow approach for proper integration:

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

      - name: Send failure notification
        if: failure()
        run: |
          # Use jq for consistent JSON formatting
          PAYLOAD=$(jq -n \
            --arg text "❌ Test Failed: ${{ matrix.containers }} on branch ${{ github.ref }}" \
            '{ text: $text }')

          curl -X POST \
            -H 'Content-type: application/json' \
            -d "$PAYLOAD" \
            ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Trigger triage workflow
        if: failure()
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            await github.rest.repos.createDispatchEvent({
              owner: context.repo.owner,
              repo: context.repo.repo,
              event_type: 'triage-failed-test',
              client_payload: {
                workflow_run_id: context.runId.toString(),
                job_name: '${{ github.job }}',
                spec: '${{ matrix.containers }}',
                pr_number: '${{ github.event.client_payload.pr_number }}',
                preview_url: '${{ github.event.client_payload.target_url }}'
              }
            });
```

### Corresponding Triage Workflow

```yaml
name: AI Test Failure Triage

on:
  repository_dispatch:
    types: [triage-failed-test]

jobs:
  analyze-and-notify:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for workflow completion
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const workflowRunId = parseInt('${{ github.event.client_payload.workflow_run_id }}');

            // Wait up to 10 minutes for workflow to complete
            for (let i = 0; i < 60; i++) {
              const { data: run } = await github.rest.actions.getWorkflowRun({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: workflowRunId
              });
              
              if (run.status === 'completed') break;
              await new Promise(resolve => setTimeout(resolve, 10000));
            }

      - name: Run AI triage analysis
        id: triage
        uses: adept-at/adept-triage-agent@v1.3.1
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'
          JOB_NAME: '${{ github.event.client_payload.job_name }}'

      - name: Parse triage results
        id: parse
        run: |
          TRIAGE_JSON='${{ steps.triage.outputs.triage_json }}'
          echo "verdict=$(echo "$TRIAGE_JSON" | jq -r '.verdict')" >> $GITHUB_OUTPUT
          echo "confidence=$(echo "$TRIAGE_JSON" | jq -r '.confidence')" >> $GITHUB_OUTPUT
          echo "summary=$(echo "$TRIAGE_JSON" | jq -r '.summary')" >> $GITHUB_OUTPUT

      - name: Send enriched Slack notification
        run: |
          VERDICT="${{ steps.parse.outputs.verdict }}"
          CONFIDENCE="${{ steps.parse.outputs.confidence }}"
          SUMMARY="${{ steps.parse.outputs.summary }}"
          SPEC="${{ github.event.client_payload.spec }}"
          WORKFLOW_URL="https://github.com/${{ github.repository }}/actions/runs/${{ github.event.client_payload.workflow_run_id }}"

          # Choose color based on verdict
          COLOR="warning"
          if [ "$VERDICT" = "PRODUCT_ISSUE" ]; then
            COLOR="danger"
          fi

          # Use jq for proper JSON formatting and escaping
          PAYLOAD=$(jq -n \
            --arg color "$COLOR" \
            --arg spec "$SPEC" \
            --arg verdict "$VERDICT" \
            --arg confidence "$CONFIDENCE%" \
            --arg summary "$SUMMARY" \
            --arg workflow_url "$WORKFLOW_URL" \
            '{
              attachments: [{
                color: $color,
                title: ("AI Triage Results for " + $spec),
                fields: [
                  {title: "Verdict", value: $verdict, short: true},
                  {title: "Confidence", value: $confidence, short: true},
                  {title: "Summary", value: $summary}
                ],
                actions: [{
                  type: "button",
                  text: "View Workflow",
                  url: $workflow_url
                }]
              }]
            }')

          curl -X POST \
            -H 'Content-type: application/json' \
            -d "$PAYLOAD" \
            ${{ secrets.SLACK_WEBHOOK_URL }}
```

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
  uses: adept-at/adept-triage-agent@v1.3.1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    # Omit JOB_NAME to analyze all failed jobs
```

### Using with Different Test Frameworks

The action works with any test framework that produces logs and screenshots:

```yaml
# Jest/Playwright example
- name: Run Tests
  run: npm test

- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: test-results
    path: |
      test-results/
      screenshots/

- name: AI Triage
  if: failure()
  uses: adept-at/adept-triage-agent@v1.3.1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Custom Confidence Thresholds

Adjust the confidence threshold for more or less strict verdicts:

```yaml
- name: Strict Analysis
  uses: adept-at/adept-triage-agent@v1.3.1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    CONFIDENCE_THRESHOLD: '90' # Require 90% confidence
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
        uses: adept-at/adept-triage-agent@v1.3.1
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

- **No PR_NUMBER**: PR diff analysis is skipped
- **No JOB_NAME**: Automatically finds the first failed job
- **No COMMIT_SHA**: Not required for analysis
- **No REPOSITORY**: Uses current repository context

Even if some data collection fails (e.g., screenshots unavailable), the agent will proceed with whatever data it can gather.

## How It Works

1. **Log Collection**: The action fetches all logs from the failed job(s)
2. **Artifact Analysis**: Downloads and analyzes screenshots and test artifacts
3. **AI Analysis**: Sends logs + screenshots to GPT-4.1 for multimodal analysis
4. **Verdict Generation**: Determines if the failure is a test or product issue
5. **Confidence Scoring**: Provides a confidence score based on evidence

## Best Practices

1. **Always use separate workflows** - Never run the triage agent in the same workflow it's analyzing
2. **Pass meaningful context** - Include job names, test specs, PR numbers, etc. in your dispatch payload
3. **Handle timeouts gracefully** - The wait step should have a reasonable timeout (10 minutes is usually sufficient)
4. **Don't block on triage** - Let your test workflow complete even if triage dispatch fails
5. **Enrich notifications** - Use the triage results to make your existing notifications more informative

## Requirements

- **OpenAI API Key**: Required for AI analysis
- **GitHub Token**: Usually available as `${{ github.token }}`
- **Node.js 20**: The action runs on Node.js 20

## Troubleshooting

### No Screenshots Found

- Ensure artifacts are uploaded before the triage action runs
- Check that screenshot paths match your test framework's output

### Low Confidence Scores

- Provide more context via artifacts
- Ensure logs contain the actual error messages
- Screenshots greatly improve confidence

### API Rate Limits

- The action uses GPT-4.1 which has generous rate limits
- Each analysis typically uses 1-2 API calls

## Support

For issues or questions:

- Open an issue on [GitHub](https://github.com/adept-at/adept-triage-agent)
- Check the [example workflows](https://github.com/adept-at/adept-triage-agent/tree/main/examples)

## License

MIT License - see [LICENSE](LICENSE) file for details.
