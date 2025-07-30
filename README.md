# Adept Triage Agent

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Adept%20Triage%20Agent-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3Njape.org5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsKchIYeEduJhcuPNycJEilaKDSjXU8lgvOJW0qgTQz+YvR4CvbSHQ/hq2bI2V5sCIMZHxGYCYiaZJjkb0A9uviLBWagFHFxgm0PHu7EPHqF+OIvoGd/od5xO1iEYBY8KIPKMTnYHECTYhYILn2D9xzI63T+S67npZxNaiUZfh6+bPIqACFyh/TwlCkOvrPA7j1t0I8emXqM7ZXsFYM1UQCi90A7WgFMhVN5kfVSxkxfKC8lJY6sNStYjyIlYNGaKTxw6iMbDxiGRKKvqdDOtJ1H8+ujwJJWH8ve/wb/AWrxMZU1UAAAAaZmNUTAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2AAAAJJmZEFUAAAAACiRY/hXYmBAgAH0A94ABkYOAAAAGmZjVEwAAAABAAAADgAAAA4AAAAOAAAADgAAAAAAAAAAAPoAAAEKZmRBVAAAAAIok43SoQ0CMRTH8RtgrYJFIJg7MCBYABJhCSSEGcAjmEEYgoV4JITBCBiICQLxOXy9l7vevfvEJrd595Hf5b/8T5PPWAv+WRDNYwghXn6m02Rk/sGplthUi5HpJ/oB/6dC0ApU5J/xW4F0YcSYTNJlR5JJSaQYGh0k8Lgk8DE)](https://github.com/marketplace/actions/adept-triage-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered GitHub Action that automatically triages test failures to determine if they are test issues or product issues.

## 📚 Documentation

- **[Detailed Usage Guide](USAGE_GUIDE.md)** - Complete integration examples and best practices
- **[API Reference](#inputs)** - Input/output specifications
- **[Examples](examples/)** - Sample workflows for different scenarios

## 🎯 Features

- 🧠 **Intelligent Analysis**: Uses OpenAI GPT-4.1 to understand test failure context
- 🖼️ **Screenshot Analysis**: Automatically fetches and analyzes test screenshots when available
- 📊 **Confidence Scoring**: Provides confidence levels for each verdict
- 🔄 **Flexible Integration**: Works with various CI/CD workflows
- 📝 **PR Diff Analysis**: Analyzes code changes from pull requests to better determine if failures are related to the changes

### PR Diff Analysis (New!)

When PR information is provided, the agent will:

- Fetch the complete diff of changed files
- Analyze correlations between test failures and modified code
- Consider whether failing tests are related to the PR changes
- Provide more accurate verdicts based on code context

To enable PR diff analysis, provide these additional inputs:

```yaml
- uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
    PR_NUMBER: ${{ github.event.pull_request.number }}
    COMMIT_SHA: ${{ github.sha }}
    REPOSITORY: ${{ github.repository }}
```

## 🚀 Quick Start

### Important: Two-Workflow Architecture Required

⚠️ **The Adept Triage Agent must run in a separate workflow from your tests** to avoid circular dependencies.

### Step 1: Update Your Test Workflow

Add a dispatch trigger when tests fail:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run Cypress Tests
        run: npx cypress run

      - name: Upload artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: cypress-artifacts
          path: |
            cypress/screenshots/**
            cypress/videos/**

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
                job_name: '${{ github.job }}'
              }
            });
```

### Step 2: Create Triage Workflow

Create `.github/workflows/triage.yml`:

```yaml
name: Triage Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for workflow completion
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const workflowRunId = parseInt('${{ github.event.client_payload.workflow_run_id }}');

            // Wait for workflow to complete
            for (let i = 0; i < 60; i++) {
              const { data: run } = await github.rest.actions.getWorkflowRun({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: workflowRunId
              });
              
              if (run.status === 'completed') break;
              await new Promise(resolve => setTimeout(resolve, 10000));
            }

      - name: Analyze failure
        id: triage
        uses: adept-at/adept-triage-agent@v1
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'
          JOB_NAME: '${{ github.event.client_payload.job_name }}'

      - name: Comment on PR (if applicable)
        if: github.event.client_payload.pr_number
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const verdict = '${{ steps.triage.outputs.verdict }}';
            const confidence = '${{ steps.triage.outputs.confidence }}';
            const summary = '${{ steps.triage.outputs.summary }}';

            const emoji = verdict === 'TEST_ISSUE' ? '🧪' : '🐛';

            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: ${{ github.event.client_payload.pr_number }},
              body: `## ${emoji} AI Test Failure Analysis\n\n**Verdict:** ${verdict} (${confidence}% confidence)\n\n${summary}`
            });
```

### Matrix Job Example

For parallel test runs using matrix strategy:

```yaml
# Test workflow
jobs:
  test:
    strategy:
      matrix:
        containers: [spec1, spec2, spec3, spec4, spec5]
    steps:
      - name: Run Cypress Tests
        run: npx cypress run --spec ./cypress/e2e/${{ matrix.containers }}.cy.ts

      - name: Trigger triage on failure
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
                job_name: '${{ github.job }} (${{ matrix.containers }})',
                spec: '${{ matrix.containers }}'
              }
            });
```

The triage workflow will then analyze each failed matrix job individually.

### Alternative: Using workflow_run Event

Instead of repository dispatch, you can use the `workflow_run` event:

```yaml
name: Analyze Test Failures
on:
  workflow_run:
    workflows: ['E2E Tests']
    types: [completed]

jobs:
  triage:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest
    steps:
      - name: Triage Test Failures
        uses: adept-at/adept-triage-agent@v1
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
```

This approach automatically triggers when the specified workflow completes with a failure.

### With Slack Notification

Integrate AI triage results into your Slack notifications in the triage workflow:

```yaml
# In your triage workflow
- name: Analyze failure
  id: triage
  uses: adept-at/adept-triage-agent@v1  # Automatically gets v1.x.x updates
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'

- name: Send Slack notification with triage results
  run: |
    VERDICT="${{ steps.triage.outputs.verdict }}"
    SUMMARY="${{ steps.triage.outputs.summary }}"
    CONFIDENCE="${{ steps.triage.outputs.confidence }}"
    JOB_NAME="${{ github.event.client_payload.job_name }}"
    
    if [[ "$VERDICT" == "PRODUCT_ISSUE" ]]; then
      COLOR="danger"
      EMOJI="🚨"
      PRIORITY="<!channel> URGENT:"
    else
      COLOR="warning"
      EMOJI="🧪"
      PRIORITY="FYI:"
    fi
    
    # Use jq for proper JSON formatting and escaping
    PAYLOAD=$(jq -n \
      --arg text "$PRIORITY Test failure in $JOB_NAME" \
      --arg color "$COLOR" \
      --arg emoji "$EMOJI" \
      --arg verdict "$VERDICT" \
      --arg confidence "$CONFIDENCE%" \
      --arg summary "$SUMMARY" \
      '{
        text: $text,
        attachments: [{
          color: $color,
          fields: [
            {title: ($emoji + " Verdict"), value: $verdict, short: true},
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

## Inputs

| Input                  | Description                                                     | Required | Default                    |
| ---------------------- | --------------------------------------------------------------- | -------- | -------------------------- |
| `GITHUB_TOKEN`         | GitHub token for API access                                     | No       | `${{ github.token }}`      |
| `OPENAI_API_KEY`       | OpenAI API key for AI analysis                                  | Yes      | -                          |
| `ERROR_MESSAGE`        | Error message to analyze (optional if using workflow artifacts) | No       | -                          |
| `WORKFLOW_RUN_ID`      | Workflow run ID to fetch logs from                              | No       | -                          |
| `JOB_NAME`             | Specific job name to analyze                                    | No       | -                          |
| `CONFIDENCE_THRESHOLD` | Minimum confidence level for verdict (0-100)                    | No       | `70`                       |
| `PR_NUMBER`            | Pull request number to fetch diff from                          | No       | -                          |
| `COMMIT_SHA`           | Commit SHA associated with the test failure                     | No       | -                          |
| `REPOSITORY`           | Repository in owner/repo format                                 | No       | `${{ github.repository }}` |

## Outputs

| Output        | Description                                                                        |
| ------------- | ---------------------------------------------------------------------------------- |
| `verdict`     | Classification result: `TEST_ISSUE`, `PRODUCT_ISSUE`, `INCONCLUSIVE`, or `PENDING` |
| `confidence`  | Confidence score (0-100)                                                           |
| `reasoning`   | Detailed explanation of the decision                                               |
| `summary`     | Brief summary suitable for PR comments                                             |
| `triage_json` | Complete analysis as JSON string (includes all details)                            |

### Special Verdicts

- **`PENDING`**: The workflow is still running and cannot be analyzed yet
- **`INCONCLUSIVE`**: The analysis completed but confidence is below the threshold

### Example triage_json Output

```json
{
  "verdict": "TEST_ISSUE",
  "confidence": 95,
  "reasoning": "The test failed due to a timing issue...",
  "summary": "🧪 Test Issue: Timing issue with auto-save indicator",
  "indicators": ["timeout", "element not found", "async wait"],
  "metadata": {
    "analyzedAt": "2024-07-30T10:15:30.000Z",
    "hasScreenshots": true,
    "logSize": 145632
  }
}
```

## Setup

### Prerequisites

1. **OpenAI API Key**: Sign up at [OpenAI](https://openai.com) and create an API key
2. **GitHub Repository Secrets**: Add your OpenAI API key as a repository secret named `OPENAI_API_KEY`

### Installation

1. Add the action to your workflow file (see examples above)
2. Configure the inputs based on your needs
3. Run your workflow!

## How It Works

1. **Error Extraction**: The action extracts error messages, stack traces, and relevant context from test logs
2. **AI Analysis**: Uses GPT-4.1 with carefully crafted prompts to analyze the failure
3. **Classification**: Determines whether the failure is a test issue or product issue
4. **Confidence Scoring**: Calculates confidence based on the clarity of indicators
5. **Output Generation**: Provides structured output with verdict, confidence, and reasoning

## Example Classifications

### Test Issues

- Timeout waiting for elements in UI tests
- Mock function not being called as expected
- Test data file not found
- Race conditions in async test code
- Incorrect test assertions

### Product Issues

- 500 Internal Server Error from API calls
- Database connection failures
- Required field validation errors
- Method not implemented exceptions
- Business logic assertion failures

## Contributing

We welcome contributions!

### Development Setup

```bash
# Clone the repository
git clone https://github.com/adept-at/adept-triage-agent.git
cd adept-triage-agent

# Install dependencies
npm install

# Run tests
npm test

# Build the action
npm run build
```

## Security

- No source code is ever sent to OpenAI
- Only error messages and stack traces are analyzed
- All API keys should be stored as secrets
- The action runs in your GitHub Actions environment

## Versioning Strategy

We follow semantic versioning and provide multiple ways to reference this action:

- **`@v1`** - Recommended for production. Automatically updates to the latest v1.x.x release
- **`@v1.4.0`** - Pin to a specific version
- **`@main`** - Latest development version (use with caution)

Example:

```yaml
# Recommended - automatically gets backward-compatible updates
uses: adept-at/adept-triage-agent@v1

# Specific version - no automatic updates
uses: adept-at/adept-triage-agent@v1.4.0
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@adept.at
- 🐛 Issues: [GitHub Issues](https://github.com/adept-at/adept-triage-agent/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/adept-at/adept-triage-agent/discussions)

## Acknowledgments

Built with ❤️ by the Adept team.
