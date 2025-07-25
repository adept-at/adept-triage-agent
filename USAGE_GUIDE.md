# Adept Triage Agent - Usage Guide

## Overview

The Adept Triage Agent is a GitHub Action that uses AI (GPT-4.1) to automatically analyze test failures and determine whether they are **test issues** (flaky tests, timing issues) or **product issues** (actual bugs).

The action returns a comprehensive JSON object containing the analysis results, which you can integrate into your existing notification systems, dashboards, or workflows.

## Quick Start

Simply add the Adept Triage Agent after your test steps. It will analyze failures and return a JSON object you can use however you need:

```yaml
- name: Analyze Test Failure
  if: failure()
  uses: adept-at/adept-triage-agent@v1.0.0
  id: triage
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: ${{ github.run_id }}
    JOB_NAME: ${{ github.job }}
```

## Inputs

| Input                  | Required | Default               | Description                                       |
| ---------------------- | -------- | --------------------- | ------------------------------------------------- |
| `OPENAI_API_KEY`       | ✅ Yes   | -                     | Your OpenAI API key for AI analysis               |
| `GITHUB_TOKEN`         | No       | `${{ github.token }}` | GitHub token for API access                       |
| `WORKFLOW_RUN_ID`      | No       | Current run           | The workflow run ID to analyze                    |
| `JOB_NAME`             | No       | All failed jobs       | Specific job name to analyze                      |
| `ERROR_MESSAGE`        | No       | From logs/artifacts   | Error message to analyze (if not using artifacts) |
| `CONFIDENCE_THRESHOLD` | No       | `70`                  | Minimum confidence level for verdict (0-100)      |

## Outputs

| Output        | Description                      | Example                                                |
| ------------- | -------------------------------- | ------------------------------------------------------ |
| `verdict`     | Classification of the failure    | `TEST_ISSUE` or `PRODUCT_ISSUE`                        |
| `confidence`  | Confidence score (0-100)         | `95`                                                   |
| `reasoning`   | Detailed explanation             | "The test failed due to a timing issue..."             |
| `summary`     | Brief summary for notifications  | "🧪 Test Issue: Timing issue with auto-save indicator" |
| `triage_json` | Complete triage analysis as JSON | See [Output Format](#output-format)                    |

## Complete Integration Example

The triage agent is designed to seamlessly integrate with your existing workflows. Just add the action after your test steps, and use the returned JSON however you need.

### Key Integration Points:

1. **Add the triage action** after your test steps (with `if: failure()`)
2. **Get the triage JSON** from `${{ steps.triage.outputs.triage_json }}`
3. **Add it to your existing systems** - Slack, Discord, JIRA, dashboards, etc.

Here's a real-world example showing integration with an existing Slack notification:

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
          DIRECTORY="cypress/skills-preview-url"
          FILES=$(ls -1 "$DIRECTORY" | jq -R -s -c 'split("\n")[:-1]')
          echo "matrix=$FILES" >> $GITHUB_OUTPUT

  previewUrlTest:
    needs: generate-matrix
    runs-on: ubuntu-latest
    timeout-minutes: 7
    strategy:
      fail-fast: false
      matrix:
        containers: ${{ fromJson(needs.generate-matrix.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          registry-url: https://npm.pkg.github.com
          scope: '@adept-at'
      - name: Cache node_modules
        id: cache-node-modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
      - name: NPM CI
        if: steps.cache-node-modules.outputs.cache-hit != 'true'
        run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.READ_GH_PACKAGES }}
      - name: Cache Cypress Binary
        id: cache-cypress
        uses: actions/cache@v4
        with:
          path: ~/.cache/Cypress
          key: ${{ runner.os }}-cypress-${{ hashFiles('**/package-lock.json') }}
      - name: Run Cypress Install
        if: steps.cache-cypress.outputs.cache-hit != 'true'
        run: npx cypress install
      - name: run cypress
        run: >
          npx cypress run --spec ./cypress/skills-preview-url/${{ matrix.containers }}
          -C cypress.skillbuilder-vercel.sauce.config.ts
          -c baseUrl=${{ github.event.client_payload.target_url }}
          -b chrome
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          SAUCE_ACCESS_KEY: ${{ secrets.SAUCE_ACCESS_KEY }}
          SAUCE_USERNAME: ${{ secrets.SAUCE_USERNAME }}

      # Upload artifacts for triage analysis
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cy-logs-${{ matrix.containers }}-${{ github.run_id }}
          path: |
            cypress/logs/*
            cypress/videos/*
            cypress/screenshots/*
          if-no-files-found: ignore

      # ========== ADD THIS SECTION ==========
      # Run AI Triage Analysis
      - name: Analyze Test Failure with AI
        if: failure()
        uses: adept-at/adept-triage-agent@v1.0.0
        id: triage
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          WORKFLOW_RUN_ID: ${{ github.run_id }}
          JOB_NAME: '${{ github.job }} (${{ matrix.containers }})'
      # ======================================

      # Update your existing notification to include triage results
      - name: Notify on failure
        if: failure()
        run: |
          PR_NUMBER=$(echo ${{ github.event.client_payload.pr_number }})
          COMMIT_SHA=${{ github.event.client_payload.sha }}
          REPO_URL=${{ github.event.client_payload.repo }}

          # Get the branch name associated with the commit
          BRANCH_NAME=${{ github.event.client_payload.branch }}

          if [ -n "$PR_NUMBER" ]; then
            LINK_TEXT="PR #$PR_NUMBER"
            LINK_URL="https://github.com/$REPO_URL/pull/$PR_NUMBER"
          else
            LINK_TEXT="GitHub Actions Run"
            LINK_URL="https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          fi
          LINK="<$LINK_URL|$LINK_TEXT>"

          PREVIEW_URL="${{ github.event.client_payload.target_url }}"

          # Get the complete triage JSON
          TRIAGE_JSON='${{ steps.triage.outputs.triage_json }}'

          curl -X POST -H 'Content-type: application/json' --data '{
            "text": ":exclamation: Job Failed in skillbuilder preview url Workflow | 
              Repo: '${GITHUB_REPOSITORY}' | 
              Message: ${{ job.status }} | 
              Job: ${{ github.job }} | 
              Spec: ${{ matrix.containers }} | 
              Branch: '"$BRANCH_NAME"' | 
              PR_NUMBER: '"$PR_NUMBER"' | 
              Commit: '"${COMMIT_SHA:0:7}"' | 
              Preview URL: '"$PREVIEW_URL"' | 
              Action URL: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }} | 
              Details: '"$LINK"'",
            "triage": '"$TRIAGE_JSON"'
          }' ${{ secrets.CYPRESS_SLACK_WEBHOOK_URL }}
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
    "aiModel": "gpt-4.1",
    "analyzedAt": "2025-07-25T18:56:27.148Z",
    "hasScreenshots": true,
    "logSize": 143246
  }
}
```

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
  uses: adept-at/adept-triage-agent@v1.0.0
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
  uses: adept-at/adept-triage-agent@v1.0.0
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Custom Confidence Thresholds

Adjust the confidence threshold for more or less strict verdicts:

```yaml
- name: Strict Analysis
  uses: adept-at/adept-triage-agent@v1.0.0
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    CONFIDENCE_THRESHOLD: '90' # Require 90% confidence
```

## How It Works

1. **Log Collection**: The action fetches all logs from the failed job(s)
2. **Artifact Analysis**: Downloads and analyzes screenshots and test artifacts
3. **AI Analysis**: Sends logs + screenshots to GPT-4.1 for multimodal analysis
4. **Verdict Generation**: Determines if the failure is a test or product issue
5. **Confidence Scoring**: Provides a confidence score based on evidence

## Best Practices

1. **Always Upload Artifacts**: Screenshots significantly improve analysis accuracy

   ```yaml
   - uses: actions/upload-artifact@v4
     if: failure()
     with:
       path: |
         cypress/screenshots/
         test-results/
   ```

2. **Use Matrix Strategy Names**: Include matrix values in job names for better tracking

   ```yaml
   JOB_NAME: '${{ github.job }} (${{ matrix.browser }} - ${{ matrix.container }})'
   ```

3. **Integrate with Alerting**: Use different alert levels based on verdict
   ```yaml
   if: steps.triage.outputs.verdict == 'PRODUCT_ISSUE'
   run: echo "<!channel> Production bug detected!"
   ```

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
