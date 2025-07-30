# Release Notes - v1.5.0

## 🚀 Structured Error Summary Feature

### What's New

We've added a powerful new feature that significantly improves the accuracy and speed of test failure analysis by providing OpenAI with pre-analyzed, structured error information.

### Key Features

#### 1. **Structured Error Summary**
- Automatically extracts and categorizes error information before sending to OpenAI
- Identifies error type, location, and context
- Detects common failure patterns (network errors, null pointers, timeouts, DOM issues, assertions)

#### 2. **PR Relevance Analysis**
- Analyzes whether PR changes are related to test failures
- Calculates risk scores (high/medium/low/none)
- Identifies modified source files that might be causing failures

#### 3. **Enhanced OpenAI Prompts**
- Adds a structured summary header at the beginning of prompts
- Provides quick overview before detailed logs
- Improves AI's ability to make accurate TEST_ISSUE vs PRODUCT_ISSUE determinations

### Example Summary Header
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
```

### Benefits

1. **Faster Analysis** - Pre-extracted data reduces OpenAI processing time
2. **Better Accuracy** - Structured information helps AI make more consistent determinations
3. **PR Correlation** - Clear indication of whether code changes might be related to failures
4. **Improved Context** - All relevant information is categorized and easily scannable

### Testing

- ✅ All 78 unit tests passing
- ✅ 7 new tests added for structured summary functionality
- ✅ End-to-end testing with real workflow data
- ✅ Verified with actual GitHub Actions workflows

### Usage

No changes required to your workflow files! The structured summary feature is automatically enabled and works with all existing configurations.

### Compatibility

- Fully backward compatible
- Works with all test frameworks (Cypress focus)
- Supports both direct error messages and log extraction

### Upgrading

To use this version in your GitHub Actions workflow:

```yaml
- uses: adept-at/adept-triage-agent@v1.5.0
```

Or use the latest v1 tag:

```yaml
- uses: adept-at/adept-triage-agent@v1
```

### Documentation

See [STRUCTURED_SUMMARY_IMPLEMENTATION.md](STRUCTURED_SUMMARY_IMPLEMENTATION.md) for detailed implementation information.

---

*This release improves the core analysis capability of the triage agent, making it more accurate and efficient at distinguishing between test issues and product bugs.*