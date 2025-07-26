# OpenAI Payload Analysis - With PR Diff Feature

This document shows what is sent to OpenAI when the adept-triage-agent analyzes a test failure with PR diff information.

## Test Case Details

- **Test**: Pm test triage agent e2e (PR #3219)
- **Repository**: adept-at/learn-webapp
- **Failed Job**: previewUrlTest (lexical.mobile.preview.url.sca.js)
- **Timestamp**: 2025-07-26T14:41:27.149Z

## Payload Structure

### 1. Model Configuration

```json
{
  "model": "gpt-4.1",
  "temperature": 0.3,
  "max_tokens": 32768,
  "response_format": { "type": "json_object" }
}
```

### 2. System Instructions

The system message includes:

- Role definition as a test failure analyzer
- Guidelines for distinguishing TEST_ISSUE vs PRODUCT_ISSUE
- Special instructions for analyzing screenshots
- **NEW: Instructions for analyzing PR changes** ✨

Key PR analysis instructions:

```
When PR changes are provided:
- Analyze if the test failure is related to the changed code
- If a test is failing and it tests functionality that was modified in the PR, lean towards PRODUCT_ISSUE
- If a test is failing in an area unrelated to the PR changes, it's more likely a TEST_ISSUE
- Look for correlations between changed files and the failing test file/functionality
- Consider if the PR introduced breaking changes that the test correctly caught
```

### 3. User Message Content

The user message includes multiple parts:

#### a) Main Instructions & Examples

- Detailed analysis guidelines
- 8 example error patterns with verdicts
- Framework for analysis

#### b) Error Context

```
Error Context:
- Framework: cypress
- Test Name: Test that sca can open skill modal, create and delete a lexical skill...
- File: lexical.mobile.preview.url.sca.js
- Browser: Chrome 138 (headless)
- Execution Time: 2m
```

#### c) **PR Changes Analysis** ✨

```
PR Changes Analysis:
- Total files changed: 4
- Lines added: 393
- Lines deleted: 1

Changed Files Summary:
1. cypress/refactor/dispatch-invite-org-lms-labs-test.yml (+0/-1)
2. .github/workflows/triage-ag-grid-tests.yml (+185/-0)
3. .github/workflows/triage-tests.yml (+185/-0)
4. .github/workflows/cypress-ag-grid-sauce.yml (+23/-0)
```

Each file includes a diff snippet showing what changed.

#### d) Full Logs and Context

- Job information
- Extracted error (AssertionError about missing element)
- Cypress artifact logs
- Screenshot availability notice

#### e) Screenshot Data

- 1 screenshot attached as base64 image
- Screenshot metadata (name, timestamp)
- High detail setting for analysis

## Key Insights

### 1. Context Optimization

When PR diff is available, the agent uses "extracted error context only" instead of full GitHub logs, reducing the payload from ~55KB to ~5.7KB of text content.

### 2. PR Diff Integration

The PR changes are presented in a structured format:

- Summary statistics
- File-by-file breakdown
- Diff snippets for each file
- Files sorted by relevance

### 3. Analysis Impact

The AI can now correlate:

- Test failures with code changes
- Whether failing tests are in modified areas
- If the PR could have introduced the issue

In this example, the AI correctly identified that since only workflow files were changed (no product code), the test failure was unrelated to the PR, supporting a TEST_ISSUE verdict.

## Benefits of PR Diff Analysis

1. **Better Accuracy**: AI can determine if failures are related to recent changes
2. **Reduced False Positives**: Tests failing for unrelated reasons are correctly identified
3. **Developer Confidence**: Know whether a PR actually broke something or if it's a flaky test
4. **Optimized Context**: Smart truncation keeps token usage efficient while preserving critical information
