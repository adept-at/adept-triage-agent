# Structured Error Summary Implementation

## Overview

We've successfully implemented a structured error summary feature that provides OpenAI with pre-analyzed, well-organized information about test failures to improve the accuracy of TEST_ISSUE vs PRODUCT_ISSUE determinations.

## What Was Implemented

### 1. **StructuredErrorSummary Interface** (`src/types.ts`)

```typescript
export interface StructuredErrorSummary {
  primaryError: {
    type: string; // AssertionError, NetworkError, etc.
    message: string;
    location?: {
      file: string;
      line: number;
      isTestCode: boolean;
      isAppCode: boolean;
    };
  };
  testContext: {
    testName: string;
    testFile: string;
    duration?: string;
    browser?: string;
    framework: string;
  };
  failureIndicators: {
    hasNetworkErrors: boolean;
    hasNullPointerErrors: boolean;
    hasTimeoutErrors: boolean;
    hasDOMErrors: boolean;
    hasAssertionErrors: boolean;
  };
  prRelevance?: {
    testFileModified: boolean;
    relatedSourceFilesModified: string[];
    riskScore: 'high' | 'medium' | 'low' | 'none';
  };
  keyMetrics: {
    totalCypressCommands?: number;
    lastCommand?: string;
    hasScreenshots: boolean;
    logSize: number;
  };
}
```

### 2. **createStructuredErrorSummary Function** (`src/analyzer.ts`)

- Extracts and categorizes error information
- Analyzes stack traces to identify error location
- Detects common failure patterns (network, null pointer, timeout, DOM, assertion errors)
- Calculates PR relevance if diff is available
- Extracts key metrics from test execution

### 3. **Enhanced Prompt with Summary Header** (`src/openai-client.ts`)

The prompt now includes a structured summary header:

```
## QUICK ANALYSIS SUMMARY

**Error Type:** AssertionError
**Error Message:** Timed out retrying after 15000ms: Expected to find element: #email
**Error Location:** src/tests/login.spec.js:45 (Test Code)

**Test Context:**
- Test: SCA can create a lexical skill
- File: lexical.preview.url.sca.js
- Framework: cypress
- Browser: Chrome 127
- Duration: 2.5s

**Failure Indicators:**
- Detected: Timeout Errors, Assertion Errors

**PR Impact Analysis:**
- Test File Modified: NO
- Related Source Files Modified: None
- Risk Score: NONE

**Key Metrics:**
- Screenshots Available: YES
- Last Cypress Command: assert
- Log Size: 54398 characters

---
[Rest of the prompt...]
```

## Benefits

1. **Faster Analysis**: OpenAI can quickly scan the summary to understand the failure
2. **Better Context**: All relevant information is pre-extracted and categorized
3. **Improved Accuracy**: Structured data helps the AI make more consistent determinations
4. **PR Correlation**: Clear indication of whether PR changes might be related to the failure

## Test Results

### End-to-End Test with Real Workflow

- **Workflow**: https://github.com/adept-at/lib-cypress-canary/actions/runs/16482069953
- **Result**: ✅ PRODUCT_ISSUE correctly identified (blank login page)
- **Confidence**: 100%
- **Structured Summary**: ✅ Successfully created and included in prompt

### Unit Tests

- **28 tests**: All passing
- **New tests added** for structured summary creation covering:
  - Basic error info extraction
  - Network error detection
  - Null pointer error detection
  - Stack trace analysis
  - PR relevance calculation
  - Cypress command metrics
  - Graceful handling of missing data

## How It Works

1. When logs are extracted or direct error message is provided, `createStructuredErrorSummary` is called
2. The function analyzes the error data and creates a structured summary
3. The summary is attached to the `ErrorData` object
4. When building the OpenAI prompt, if a structured summary exists, it's formatted as a header
5. This gives OpenAI immediate access to key information before diving into detailed logs

## Future Enhancements

1. **Add test history**: Include whether this test has been flaky in the past
2. **Environment context**: Add more details about the test environment (preview URL, branch, etc.)
3. **Error pattern matching**: Expand the library of known error patterns
4. **Confidence scoring matrix**: Use the structured data to pre-calculate confidence scores
