# Adept Triage Agent

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Adept%20Triage%20Agent-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3Njape.org5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsKchIYeEduJhcuPNycJEilaKDSjXU8lgvOJW0qgTQz+YvR4CvbSHQ/hq2bI2V5sCIMZHxGYCYiaZJjkb0A9uviLBWagFHFxgm0PHu7EPHqF+OIvoGd/od5xO1iEYBY8KIPKMTnYHECTYhYILn2D9xzI63T+S67npZxNaiUZfh6+bPIqACFyh/TwlCkOvrPA7j1t0I8emXqM7ZXsFYM1UQCi90A7WgFMhVN5kfVSxkxfKC8lJY6sNStYjyIlYNGaKTxw6iMbDxiGRKKvqdDOtJ1H8+ujwJJWH8ve/wb/AWrxMZU1UAAAAaZmNUTAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2AAAAJJmZEFUAAAAACiRY/hXYmBAgAH0A94ABkYOAAAAGmZjVEwAAAABAAAADgAAAA4AAAAOAAAADgAAAAAAAAAAAPoAAAEKZmRBVAAAAAIok43SoQ0CMRTH8RtgrYJFIJg7MCBYABJhCSSEGcAjmEEYgoV4JITBCBiICQLxOXy9l7vevfvEJrd595Hf5b/8T5PPWAv+WRDNYwghXn6m02Rk/sGplthUi5HpJ/oB/6dC0ApU5J/xW4F0YcSYTNJlR5JJSaQYGh0k8Lgk8DE)](https://github.com/marketplace/actions/adept-triage-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered GitHub Action that automatically triages test failures to determine if they are test issues or product issues.

## 📚 Documentation

- **[Detailed Usage Guide](USAGE_GUIDE.md)** - Complete integration examples and best practices
- **[API Reference](#inputs)** - Input/output specifications
- **[Examples](examples/)** - Sample workflows for different scenarios

## Features

- 🤖 Uses OpenAI GPT-4.1 to analyze test failures intelligently
- 🔍 Automatically extracts error messages from workflow logs
- 🎯 Distinguishes between test flakiness and real product bugs
- 📊 Provides confidence scores and detailed reasoning
- 🔧 Framework-aware parsing (Jest, Cypress, Mocha, Playwright)
- 📸 **Multimodal Analysis: Analyzes screenshots with logs for better accuracy**
- 📁 Automatically downloads and processes all test artifacts
- 🚀 Drop-in solution - minimal configuration required
- 🧠 Support for o1-preview/o1-mini models via environment variable

## Multimodal Analysis

The triage agent uses GPT-4.1's multimodal capabilities to analyze both logs and screenshots together:
- 📸 Automatically fetches screenshots from test artifacts
- 🔍 Analyzes visual UI state alongside error logs
- 🎯 Provides more accurate verdicts with visual evidence
- 📈 Boosts confidence scores by 10% when screenshots are available
- 🧩 Correlates visual bugs (overlapping elements, missing UI) with log errors

For best results, ensure your workflow uploads artifacts:

```yaml
- name: Upload Test Artifacts
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: cypress-artifacts
    path: |
      cypress/screenshots/**
      cypress/videos/**
```

## Usage

### Basic Usage (Drop-in Solution)

Add this action after your test steps. It will automatically detect the current workflow and analyze failures:

```yaml
- name: Run Cypress Tests
  run: npx cypress run
  # ... your existing test configuration

- name: Triage Test Failures
  if: failure()
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

That's it! The action will:
- Automatically detect the current workflow run ID
- Find the failed job
- Extract and parse Cypress error logs
- Provide a verdict: `TEST_ISSUE` or `PRODUCT_ISSUE`

### Matrix Job Example

For parallel test runs using matrix strategy:

```yaml
jobs:
  test:
    strategy:
      matrix:
        containers: [1, 2, 3, 4, 5]
    steps:
      - name: Run Cypress Tests
        run: npx cypress run --spec ./cypress/e2e/${{ matrix.containers }}/**/*

      - name: Triage Test Failures
        if: failure()
        uses: adept-at/adept-triage-agent@v1
        with:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Using in a Separate Workflow

You can also analyze failures from another workflow:

```yaml
name: Analyze Test Failures
on:
  workflow_run:
    workflows: ["E2E Tests"]
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

### With Slack Notification

Integrate with your existing notifications:

```yaml
- name: Run Tests
  id: tests
  run: npm test
  continue-on-error: true

- name: Triage Test Failures
  id: triage
  if: steps.tests.outcome == 'failure'
  uses: adept-at/adept-triage-agent@v1
  with:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

- name: Notify Slack
  if: steps.tests.outcome == 'failure'
  run: |
    if [[ "${{ steps.triage.outputs.verdict }}" == "PRODUCT_ISSUE" ]]; then
      echo "🚨 Product issue detected!"
      # Send urgent Slack notification
    else
      echo "🧪 Test issue detected"
      # Send lower priority notification
    fi
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `GITHUB_TOKEN` | GitHub token for API access | No | `${{ github.token }}` |
| `OPENAI_API_KEY` | OpenAI API key for AI analysis | Yes | - |
| `ERROR_MESSAGE` | Error message to analyze (optional if using workflow artifacts) | No | - |
| `WORKFLOW_RUN_ID` | Workflow run ID to fetch logs from | No | - |
| `JOB_NAME` | Specific job name to analyze | No | - |
| `CONFIDENCE_THRESHOLD` | Minimum confidence level for verdict (0-100) | No | `70` |

## Outputs

| Output | Description |
|--------|-------------|
| `verdict` | Classification result: `TEST_ISSUE` or `PRODUCT_ISSUE` |
| `confidence` | Confidence score (0-100) |
| `reasoning` | Detailed explanation of the decision |
| `summary` | Brief summary suitable for PR comments |
| `triage_json` | Complete analysis as JSON string (includes all details) |

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
2. **AI Analysis**: Uses GPT-4 with carefully crafted prompts to analyze the failure
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

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@adept.at
- 🐛 Issues: [GitHub Issues](https://github.com/adept-at/adept-triage-agent/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/adept-at/adept-triage-agent/discussions)

## Acknowledgments

Built with ❤️ by the Adept team. 