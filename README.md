# Adept Triage Agent

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Adept%20Triage%20Agent-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3Njape.org5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsKchIYeEduJhcuPNycJEilaKDSjXU8lgvOJW0qgTQz+YvR4CvbSHQ/hq2bI2V5sCIMZHxGYCYiaZJjkb0A9uviLBWagFHFxgm0PHu7EPHqF+OIvoGd/od5xO1iEYBY8KIPKMTnYHECTYhYILn2D9xzI63T+S67npZxNaiUZfh6+bPIqACFyh/TwlCkOvrPA7j1t0I8emXqM7ZXsFYM1UQCi90A7WgFMhVN5kfVSxkxfKC8lJY6sNStYjyIlYNGaKTxw6iMbDxiGRKKvqdDOtJ1H8+ujwJJWH8ve/wb/AWrxMZU1UAAAAaZmNUTAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2AAAAJJmZEFUAAAAACiRY/hXYmBAgAH0A94ABkYOAAAAGmZjVEwAAAABAAAADgAAAA4AAAAOAAAADgAAAAAAAAAAAPoAAAEKZmRBVAAAAAIok43SoQ0CMRTH8RtgrYJFIJg7MCBYABJhCSSEGcAjmEEYgoV4JITBCBiICQLxOXy9l7vevfvEJrd595Hf5b/8T5PPWAv+WRDNYwghXn6m02Rk/sGplthUi5HpJ/oB/6dC0ApU5J/xW4F0YcSYTNJlR5JJSaQYGh0k8Lgk8DE)](https://github.com/marketplace/actions/adept-triage-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered GitHub Action that automatically triages test failures to determine if they are test issues or product issues.

## 📚 Documentation

- **[Detailed Usage Guide](USAGE_GUIDE.md)** - Complete integration examples and best practices
- **[API Reference](#inputs)** - Input/output specifications
- **[Examples](examples/)** - Sample workflows for different scenarios

## 🎯 Features

- 🧠 **Intelligent Analysis**: Uses OpenAI GPT-5.3 Codex to understand test failure context
- 🖼️ **Screenshot Analysis**: Automatically fetches and analyzes test screenshots when available
- 📊 **Confidence Scoring**: Provides confidence levels for each verdict
- 🔄 **Flexible Integration**: Works with various CI/CD workflows
- 📝 **Change Diff Analysis**: Analyzes test-repo PR, branch, or commit diffs when provided, and recent commits in the default product repo (`adept-at/learn-webapp`) for classification

### Auto-Fix Feature

When a test failure is classified as `TEST_ISSUE`, the agent can automatically create a branch with the proposed fix:

- Creates a new branch with AI-generated code changes
- Commits and pushes the fix for engineer review
- Outputs branch name, commit SHA, and modified files
- **Opt-in only** - disabled by default for safety

#### Basic Auto-Fix (Single-Shot)

```yaml
- uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
    # Enable auto-fix
    ENABLE_AUTO_FIX: 'true'
    AUTO_FIX_BASE_BRANCH: 'main'
    AUTO_FIX_MIN_CONFIDENCE: '75'
```

#### Advanced: Multi-Agent Repair Pipeline

For higher quality fixes, enable the agentic repair pipeline. This uses 5 specialized AI agents that work together:

1. **Analysis Agent** - Deep error analysis to identify root cause
2. **Code Reading Agent** - Fetches relevant source files and helpers
3. **Investigation Agent** - Cross-references analysis with code context
4. **Fix Generation Agent** - Generates precise code changes
5. **Review Agent** - Validates fixes before applying them

The agents iterate up to 3 times, with the review agent providing feedback for improvements.

```yaml
- uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
    # Enable auto-fix with agentic pipeline
    ENABLE_AUTO_FIX: 'true'
    ENABLE_AGENTIC_REPAIR: 'true'      # Enable multi-agent pipeline
    AUTO_FIX_BASE_BRANCH: 'main'
    AUTO_FIX_MIN_CONFIDENCE: '70'       # Minimum confidence to apply fix
```

**Trade-offs:**

| Approach | API Calls | Quality | Speed |
|----------|-----------|---------|-------|
| Single-Shot | 1 | Good | ~5s |
| Agentic | 4-15 | Better | ~30-60s |

The agentic pipeline falls back to single-shot if it fails to produce a valid fix.

#### Fix Validation (Optional)

When `ENABLE_AUTO_FIX=true`, `ENABLE_VALIDATION=true`, and `VALIDATION_TEST_COMMAND` is set, the action validates fixes **locally** in the runner:

1. Clones the test repo (failing branch)
2. Installs dependencies (`npm ci`)
3. Generates a fix via the LLM and applies it to local files
4. Runs `VALIDATION_TEST_COMMAND` locally (`{spec}` and `{url}` are substituted from `VALIDATION_SPEC` and `VALIDATION_PREVIEW_URL` when set)
5. If the test passes: pushes the branch and opens a PR automatically
6. If the test fails: resets local changes, feeds failure logs back to the LLM, and retries (up to 3 iterations)

When `ENABLE_VALIDATION=true` but `VALIDATION_TEST_COMMAND` is **not** set, the action uses the **legacy** path: pushes the fix via the GitHub API and optionally dispatches `VALIDATION_WORKFLOW` (for example `validate-fix.yml`) for remote validation.

```yaml
- uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
    ENABLE_AUTO_FIX: 'true'
    ENABLE_AGENTIC_REPAIR: 'true'
    ENABLE_VALIDATION: 'true'
    VALIDATION_TEST_COMMAND: 'npx cypress run --spec {spec}'
    VALIDATION_PREVIEW_URL: '${{ github.event.client_payload.preview_url }}'
    VALIDATION_SPEC: '${{ github.event.client_payload.spec }}'
```

See [Architecture Documentation](docs/ARCHITECTURE.md#auto-fix-feature) for detailed configuration and safety guardrails.

### Change Diff Analysis

The agent always attempts to fetch a recent **product-repo** diff (default `adept-at/learn-webapp`); workflows do not need to pass `PRODUCT_REPO` unless you want a different repository.

When PR, branch, or commit information is provided for the **test repo** (`REPOSITORY`), the agent will:

- Fetch the complete diff of changed files in that repository
- Analyze correlations between test failures and modified code
- Consider whether failing tests are related to the recent changes
- Provide more accurate verdicts using both test-repo and product-repo change context

To enable **test-repo** diff lookup, provide these additional inputs:

```yaml
- uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    WORKFLOW_RUN_ID: ${{ github.event.workflow_run.id }}
    BRANCH: '<branch from the original test workflow>'
    COMMIT_SHA: '<commit SHA from the original test workflow>'
    REPOSITORY: 'owner/repo'
    # Add PR_NUMBER when your trigger payload includes it
```

When you use the recommended `repository_dispatch` pattern, pass `PR_NUMBER`, `BRANCH`, and `COMMIT_SHA` through `client_payload` from the original test workflow rather than reading them from the triage workflow's own GitHub context.

## 🚀 Quick Start

### Recommended: Separate Triage Workflow

⚠️ **For full workflow logs and uploaded artifacts, run the Adept Triage Agent in a separate workflow from your tests.**

### Note on Authentication

The default `GITHUB_TOKEN` is enough when the action only needs to read workflow runs, artifacts, diffs, and fix targets from the current repository. Use a Personal Access Token (PAT) or GitHub App token when `REPOSITORY` or `AUTO_FIX_TARGET_REPO` points to a different repository. See [Cross-Repository Access](./README_CROSS_REPO_PR.md) for details.

Repository roles:

- `github.context.repo`: the repository where the triage workflow is running. Workflow runs, job logs, screenshots, and uploaded test artifacts are fetched from here.
- `REPOSITORY`: the app/source repository used for PR, branch, or commit diff lookup.
- `AUTO_FIX_TARGET_REPO`: the repository where source files are fetched for repair and where fix branches are created.

Best-effort same-workflow analysis is still supported when you target the current job, but it has less complete context than the recommended separate-workflow pattern.

### Step 1: Add the Shared Dispatch Action to Your Test Workflow

When a test fails, use the shared dispatch action to trigger triage. This replaces inline `createDispatchEvent` scripts:

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

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }}
          pr-number: ${{ github.event.pull_request.number || '' }}
          commit-sha: ${{ github.event.pull_request.head.sha || github.sha }}
          branch: ${{ github.head_ref || github.ref_name }}
```

The shared action handles `workflow_run_id`, `repo_url`, error handling, and payload normalization automatically.

#### Matrix Jobs

For parallel test runs, pass the matrix value into `job-name` and `spec`:

```yaml
jobs:
  test:
    strategy:
      matrix:
        containers: [spec1, spec2, spec3, spec4, spec5]
    steps:
      - name: Run Cypress Tests
        run: npx cypress run --spec ./cypress/e2e/${{ matrix.containers }}.cy.ts

      - name: Trigger triage analysis
        if: failure()
        uses: adept-at/adept-common/.github/actions/triage-dispatch@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          job-name: ${{ github.job }} (${{ matrix.containers }})
          spec: ${{ matrix.containers }}
```

### Step 2: Add the Shared Triage Workflow

Create `.github/workflows/triage-failed-tests.yml` — a thin wrapper that calls the shared reusable workflow:

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

For same-repo setups (tests and source in the same repo), you can pass `${{ secrets.GITHUB_TOKEN }}` as `CROSS_REPO_PAT`. A PAT is only required when `REPOSITORY` or `AUTO_FIX_TARGET_REPO` points to a different repo.

### Shared Actions Reference

| Action | Purpose | Used in |
|--------|---------|---------|
| `adept-at/adept-common/.github/actions/triage-dispatch@main` | Dispatch `triage-failed-test` event on failure | Test workflows |
| `adept-at/adept-common/.github/workflows/triage-failed-tests.yml@main` | Reusable triage workflow (validate, wait, analyze, notify) | Triage wrapper |
| `adept-at/adept-common/.github/actions/triage-slack-notify@main` | Format and send Slack notification | Called by shared triage workflow |

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

This approach triggers automatically when the specified workflow completes with a failure, but does not use the shared actions.

## Inputs

| Input                  | Description                                                                                                                                                                                                                    | Required | Default                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------- |
| `GITHUB_TOKEN`         | GitHub token for API access. Use a PAT or GitHub App token when `REPOSITORY` or `AUTO_FIX_TARGET_REPO` points to a different repository. See [Cross-Repository Access](./README_CROSS_REPO_PR.md) for details. | No       | `${{ github.token }}`      |
| `OPENAI_API_KEY`       | OpenAI API key for AI analysis                                                                                                                                                                                                 | Yes      | -                          |
| `ERROR_MESSAGE`        | Error message to analyze (optional if using workflow artifacts)                                                                                                                                                                | No       | -                          |
| `WORKFLOW_RUN_ID`      | Workflow run ID to fetch logs from                                                                                                                                                                                             | No       | -                          |
| `JOB_NAME`             | Specific job name to analyze                                                                                                                                                                                                   | No       | -                          |
| `CONFIDENCE_THRESHOLD` | Minimum confidence level for verdict (0-100)                                                                                                                                                                                   | No       | `70`                       |
| `PR_NUMBER`            | Pull request number to fetch diff from                                                                                                                                                                                         | No       | -                          |
| `COMMIT_SHA`           | Commit SHA associated with the test failure                                                                                                                                                                                    | No       | -                          |
| `BRANCH`               | Branch being tested (used to fetch branch diff when no PR number available)                                                                                                                                                    | No       | -                          |
| `REPOSITORY`           | App/source repository in owner/repo format for PR, branch, or commit diff lookup. Workflow runs and artifacts are still read from the repository where this action executes.                                                 | No       | `${{ github.repository }}` |
| `PRODUCT_REPO`         | Product repository (owner/repo) for recent commit diff in classification. Defaults to `adept-at/learn-webapp` when unset (via action default and `getInputs()`); omit unless you need another repo.                                | No       | `adept-at/learn-webapp`    |
| `PRODUCT_DIFF_COMMITS` | Number of recent product commits to include in that diff                                                                                                                                                                       | No       | `5`                        |
| `TEST_FRAMEWORKS`      | Test framework: "cypress" or "webdriverio"                                                                                                                                                                                     | No       | cypress                    |
| **Auto-Fix Inputs** | | | |
| `ENABLE_AUTO_FIX`      | Enable automatic branch creation with fix (opt-in)                                                                                                                                                                             | No       | `false`                    |
| `AUTO_FIX_BASE_BRANCH` | Base branch to create fix branch from                                                                                                                                                                                          | No       | `main`                     |
| `AUTO_FIX_MIN_CONFIDENCE` | Minimum fix confidence required to apply auto-fix (0-100)                                                                                                                                                                   | No       | `70`                       |
| `AUTO_FIX_TARGET_REPO` | Repository where repair source files are fetched and fix branches are created (owner/repo format)                                                                                                                             | No       | `${{ github.repository }}` |
| `ENABLE_AGENTIC_REPAIR` | Enable multi-agent repair pipeline for higher quality fixes (uses more API calls). Enabled by default; set to `'false'` to use single-shot repair instead.                                                                   | No       | `true`                     |
| **Validation Inputs** | | | |
| `ENABLE_VALIDATION`    | Enable local validation before push when used with `VALIDATION_TEST_COMMAND`: clone repo, apply fix, run tests locally, push branch and open PR on success (up to 3 iterations on failure).                                                                                                        | No       | `false`                    |
| `VALIDATION_WORKFLOW`  | Validation workflow filename; used by the legacy remote path when `VALIDATION_TEST_COMMAND` is unset.                                                                                                                                                                                           | No       | `validate-fix.yml`         |
| `VALIDATION_PREVIEW_URL` | Replaces `{url}` in `VALIDATION_TEST_COMMAND`.                                                                                                                                                                                             | No       | -                          |
| `VALIDATION_SPEC`      | Replaces `{spec}` in `VALIDATION_TEST_COMMAND`.                                                                                                                                                                                                 | No       | -                          |
| `VALIDATION_TEST_COMMAND` | Test command template with `{spec}` and `{url}` placeholders; when set with `ENABLE_VALIDATION`, runs locally to validate fixes before push.                                                                                                                                                                                          | No       | -                          |
| **Cursor Validation Inputs** | | | |
| `ENABLE_CURSOR_VALIDATION` | Enable Cursor-based fix validation. Mutually exclusive with `ENABLE_VALIDATION`; if both are true, GitHub Actions validation takes precedence.                                                                             | No       | `false`                    |
| `CURSOR_API_KEY`       | API key for Cursor validation                                                                                                                                                                                                  | No       | -                          |
| `CURSOR_VALIDATION_MODE` | Cursor validation mode                                                                                                                                                                                                       | No       | `poll`                     |
| `CURSOR_VALIDATION_TIMEOUT` | Timeout for Cursor validation (ms)                                                                                                                                                                                        | No       | `300000`                   |

## Outputs

| Output        | Description                                                                        |
| ------------- | ---------------------------------------------------------------------------------- |
| `verdict`     | Classification result: `TEST_ISSUE`, `PRODUCT_ISSUE`, `NO_FAILURE`, `INCONCLUSIVE`, `PENDING`, or `ERROR` |
| `confidence`  | Confidence score (0-100)                                                           |
| `reasoning`   | Detailed explanation of the decision                                               |
| `summary`     | Brief summary suitable for PR comments                                             |
| `triage_json` | Complete analysis as JSON string (includes all details)                            |
| **Fix Recommendation Outputs** | |
| `has_fix_recommendation` | `true` or `false` - whether a fix recommendation was generated (TEST_ISSUE only) |
| `fix_recommendation` | Complete fix recommendation as JSON (when available)                          |
| `fix_summary` | Human-readable fix recommendation summary (when available)                         |
| `fix_confidence` | Confidence score for the fix recommendation (0-100)                             |
| **Auto-Fix Outputs** | |
| `auto_fix_applied` | `true` or `false` - whether auto-fix branch was created                        |
| `auto_fix_branch` | Name of the created branch (if auto-fix applied)                                |
| `auto_fix_commit` | Last commit SHA created while applying the fix (if auto-fix applied)            |
| `auto_fix_files` | JSON array of modified files (if auto-fix applied)                               |
| **Validation Outputs** | |
| `validation_run_id` | Workflow run ID of the validation workflow (legacy remote validation path only).                   |
| `validation_status` | `passed` (local test succeeded), `pending`, or `skipped`.            |
| `validation_url` | URL to the validation workflow run (legacy remote validation path only).        |
| **Cursor Validation Outputs** | |
| `cursor_agent_id` | Cursor agent ID (when Cursor validation enabled)                                  |
| `cursor_agent_url` | URL to Cursor agent run                                                          |
| `cursor_validation_summary` | Summary of Cursor validation results                                       |

### Special Verdicts

- **`PENDING`**: The workflow is still running and cannot be analyzed yet
- **`INCONCLUSIVE`**: The analysis completed but confidence is below the threshold
- **`ERROR`**: The action could not collect enough data or encountered a runtime failure

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
2. **AI Analysis**: Uses GPT-5.3 Codex with carefully crafted prompts to analyze the failure
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

- Analysis requests can include workflow logs, screenshots, structured summaries, test-repo PR/branch/commit diff patches when provided, and recent product-repo diff when the GitHub API returns it
- When repair is enabled, source files fetched from `AUTO_FIX_TARGET_REPO` may also be sent to OpenAI to generate a fix recommendation
- All API keys should be stored as secrets
- The action runs in your GitHub Actions environment

## Versioning Strategy

We follow semantic versioning and provide multiple ways to reference this action:

- **`@v1`** - Recommended for production. Automatically updates to the latest v1.x.x release
- **`@v1.21.2`** - Pin to a specific version for full reproducibility
- **`@main`** - Latest development version (use with caution)

Example:

```yaml
# Recommended - automatically gets backward-compatible updates
uses: adept-at/adept-triage-agent@v1

# Specific version - no automatic updates
uses: adept-at/adept-triage-agent@v1.21.2
```

## Development

### Building the Action

> ⚠️ **IMPORTANT**: The dist/index.js file MUST be properly bundled with ncc before committing. The pre-commit hooks handle this automatically, but if you bypass them, the action will fail when used.

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Package with ncc (REQUIRED - bundles all dependencies)
npm run package

# Or do both (recommended)
npm run all
```

**Note**: Simply running `npm run build` is NOT sufficient. You must run `npm run package` or `npm run all` to properly bundle the action with its dependencies.

### Git Hooks (Husky)

This project uses Husky to ensure code quality and build consistency:

**Pre-commit hook:**

- Runs linting (`npm run lint`)
- Builds the TypeScript code
- Packages the action and updates `dist/` if needed
- Automatically stages updated `dist/` files

**Pre-push hook:**

- Verifies `dist/` is up-to-date
- Runs all tests

These hooks prevent broken or unbuilt code from being committed or pushed to the repository.

### Creating a Release

> 📚 **See [RELEASE_PROCESS.md](RELEASE_PROCESS.md) for detailed release instructions**

**Quick Release Checklist:**

```bash
# 1. Verify release readiness (REQUIRED)
./scripts/verify-release-readiness.sh

# 2. If verification passes, bump version
npm version patch  # or minor/major

# 3. Push to main
git push origin main

# 4. Create release via GitHub UI or CLI
gh release create v$(node -p "require('./package.json').version") \
  --title "Release v$(node -p "require('./package.json').version")" \
  --notes "Release notes here"
```

**⚠️ Critical:** The dist/index.js file MUST be properly bundled (~2-3MB) before release. The verification script ensures this.

### Verification

The repository includes automatic checks to ensure `dist/` is always up-to-date:

- **check-dist.yml**: Verifies dist/ matches source on every push
- **npm run verify-dist**: Local verification command

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: <support@adept.at>
- 🐛 Issues: [GitHub Issues](https://github.com/adept-at/adept-triage-agent/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/adept-at/adept-triage-agent/discussions)

## Acknowledgments

Built with ❤️ by the Adept team.
