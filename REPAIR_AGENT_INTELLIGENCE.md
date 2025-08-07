# Repair Agent Intelligence: Source Code Validation

## The Key Insight

When a test fails because a selector cannot be found, there are two fundamentally different root causes:

1. **The selector doesn't exist in the source code** → The test is wrong
2. **The selector exists but isn't visible/loaded** → The test timing is wrong

Our repair agent can now distinguish between these cases and provide the correct fix.

## How It Works

### 1. Test Fails with ELEMENT_NOT_FOUND

```javascript
AssertionError: Expected to find element: `[data-testid="skill-builder-container"]`, but never found it.
```

### 2. Repair Agent Validates Selector Existence

```javascript
const validator = new SourceValidator(appRepoClient, 'Adept/learn-webapp');
const validation = await validator.validateSelectorExists('[data-testid="skill-builder-container"]');

if (!validation.exists) {
  // Selector doesn't exist in source - test is wrong
  return "REMOVE_OR_UPDATE_TEST";
} else {
  // Selector exists - test needs timing fix
  return "FIX_TIMING_OR_VISIBILITY";  
}
```

### 3. Intelligent Recommendations

#### Case A: Selector Does NOT Exist (Our Example)
```markdown
## 🔧 Repair Recommendation: Remove or Update Test

### ❌ Selector Does Not Exist in Source Code

The selector `[data-testid="skill-builder-container"]` was NOT FOUND in the application.

**Recommended Fix:**
- Remove the test if feature is deprecated
- Update to correct selector if feature exists differently
- Make conditional if feature-flagged

**Confidence: 95%**
```

#### Case B: Selector EXISTS
```markdown
## 🔧 Repair Recommendation: Fix Timing Issue

### ✅ Selector EXISTS in Source Code

The selector exists in the application code.

**Recommended Fix:**
```javascript
cy.get('[data-testid="skill-builder-container"]', { timeout: 15000 })
  .should('exist')
  .should('be.visible');
```

**Confidence: 85%**
```

## Real-World Test Results

In our test with workflow run #16781824375:
- **Selector:** `[data-testid="skill-builder-container"]`
- **Source Repository:** Adept/learn-webapp
- **Result:** ❌ Selector NOT found
- **Recommendation:** Remove or update the test (95% confidence)

This is exactly right! The test is looking for something that doesn't exist.

## Implementation in RepairEngine

```typescript
// In repair-engine.ts
private async buildRepairPrompt(context: FullContext): string {
  // First, validate if selector exists
  if (context.minimal.errorType === 'ELEMENT_NOT_FOUND' && context.minimal.errorSelector) {
    const validator = new SourceValidator(this.appRepoClient, this.appRepo);
    const validation = await validator.validateSelectorExists(context.minimal.errorSelector);
    
    const recommendation = validator.generateRecommendation(
      validation, 
      context.minimal.errorSelector
    );

    // Add to prompt
    return `
## CRITICAL FINDING
${validation.exists ? '✅ SELECTOR EXISTS' : '❌ SELECTOR DOES NOT EXIST'} in source repository

Recommendation: ${recommendation.recommendation}
Reasoning: ${recommendation.reasoning}
Suggested Fix: ${recommendation.suggestedFix}

Based on this finding, propose the appropriate fix...
`;
  }
}
```

## Benefits of This Approach

1. **Prevents Wasted Effort**: No more trying to "fix" tests for non-existent features
2. **Higher Confidence**: Can be 95% confident when recommending test removal
3. **Cleaner Test Suite**: Removes obsolete tests automatically
4. **Better Developer Experience**: Clear, actionable recommendations
5. **Reduced False Positives**: Won't suggest timing fixes for missing elements

## Configuration

```javascript
const repairConfig = {
  // ... other config
  validateSourceCode: true,  // Enable source validation
  sourceRepo: 'Adept/learn-webapp',  // Repository being tested
  removeObsoleteTests: true,  // Allow recommending test removal
  minConfidenceForRemoval: 90  // High bar for test removal
};
```

## Metrics

From our test run:
- **Search Queries Executed**: 6
- **Source Files Checked**: 0 (selector not found)
- **Similar Selectors Found**: 0
- **Confidence Level**: 95%
- **Recommendation**: REMOVE_TEST

## Future Enhancements

1. **Historical Analysis**: Check if selector existed in previous commits
2. **PR Correlation**: Find the PR that removed the selector
3. **Bulk Updates**: Update all tests using obsolete selectors
4. **Learning**: Track which selectors frequently change
5. **Preventive**: Warn when creating tests with non-existent selectors

## Conclusion

This intelligence transforms the repair agent from a "test fixer" to a "test suite maintainer" that:
- Knows when tests are obsolete
- Recommends removal of dead code
- Keeps test suites aligned with application reality
- Provides high-confidence recommendations

This is exactly the kind of intelligent behavior that makes the repair agent truly valuable!

