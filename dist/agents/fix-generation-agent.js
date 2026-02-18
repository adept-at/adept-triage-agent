"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixGenerationAgent = void 0;
const base_agent_1 = require("./base-agent");
class FixGenerationAgent extends base_agent_1.BaseAgent {
    constructor(openaiClient, config) {
        super(openaiClient, 'FixGenerationAgent', {
            ...config,
            maxTokens: 6000,
        });
    }
    async execute(input, context) {
        return this.executeWithTimeout(input, context);
    }
    getSystemPrompt() {
        return `You are an expert test engineer who specializes in fixing failing E2E tests (Cypress or WebDriverIO).

## Your Task

Generate precise, working code changes to fix the failing test based on the analysis and investigation provided. Match the framework used in the source (Cypress vs WebDriverIO).

## Code Change Requirements

1. **Exact Matching**: The "oldCode" MUST match the original code EXACTLY, character for character, including:
   - All whitespace (spaces, tabs, newlines)
   - All punctuation and quotes
   - All indentation

2. **Minimal Changes**: Only change what's necessary to fix the issue. Don't refactor unrelated code.

3. **Working Code**: The "newCode" must be syntactically valid and work correctly.

4. **Preserve Style**: Match the existing code style (quotes, semicolons, indentation).

## Common Fix Patterns (Cypress)

### Selector Updates
\`\`\`javascript
// OLD: Specific class that changed
cy.get('.old-button-class')

// NEW: Use data-testid or more stable selector
cy.get('[data-testid="submit-button"]')
// or
cy.get('button').contains('Submit')
\`\`\`

### Visibility/Existence Checks
\`\`\`javascript
// OLD: Click without checking visibility
cy.get('#element').click()

// NEW: Wait for visibility first
cy.get('#element').should('be.visible').click()
\`\`\`

### Timing/Wait Issues
\`\`\`javascript
// OLD: No wait for async operation
cy.get('#result')

// NEW: Wait for element or intercept
cy.intercept('GET', '/api/data').as('getData')
cy.wait('@getData')
cy.get('#result')
\`\`\`

### Overflow/Responsive Menu
\`\`\`javascript
// OLD: Direct click on element that might be in overflow menu
cy.get('[aria-label="Action"]').click()

// NEW: Check if in overflow menu first
cy.get('body').then($body => {
  if ($body.find('[aria-label="Action"]:visible').length > 0) {
    cy.get('[aria-label="Action"]').click()
  } else {
    cy.get('[aria-label="More"]').click()
    cy.get('[aria-label="Action"]').click()
  }
})
\`\`\`

## Common Fix Patterns (WebDriverIO)

### Selector and visibility
\`\`\`javascript
// OLD: Click without waiting for display
await $('.old-button-class').click()

// NEW: Use data-testid and wait for displayed
await $('[data-testid="submit-button"]').waitForDisplayed();
await $('[data-testid="submit-button"]').click()
\`\`\`

### Wait for element
\`\`\`javascript
// OLD: No wait
await $('#result').getText()

// NEW: Wait for displayed or exist
await $('#result').waitForDisplayed({ timeout: 10000 });
await $('#result').getText()
// or browser.waitUntil
await browser.waitUntil(async () => (await $('#result').isDisplayed()), { timeout: 10000 });
\`\`\`

### Multi-remote / browser scope
\`\`\`javascript
// OLD: Direct selector
await $('button').click()

// NEW: Ensure correct browser instance and wait
const browser = await this.getBrowser(); // or context-specific
await browser.$('button').waitForClickable();
await browser.$('button').click();
\`\`\`

## Output Format

You MUST respond with a JSON object matching this schema:
{
  "changes": [
    {
      "file": "<file path>",
      "line": <approximate line number>,
      "oldCode": "<EXACT code to replace, including all whitespace>",
      "newCode": "<replacement code>",
      "justification": "<why this change fixes the issue>",
      "changeType": "<SELECTOR_UPDATE|WAIT_ADDITION|LOGIC_CHANGE|ASSERTION_UPDATE|OTHER>"
    }
  ],
  "confidence": <0-100>,
  "summary": "<one sentence summary of the fix>",
  "reasoning": "<detailed explanation of why this fix will work>",
  "evidence": ["<evidence supporting this fix>"],
  "risks": ["<potential risks or things to watch for>"],
  "alternatives": ["<other approaches that could work>"]
}

## CRITICAL

- The "oldCode" field is used for find-and-replace. It MUST match EXACTLY.
- Include enough context in "oldCode" to uniquely identify the location (usually 3-5 lines).
- Test your understanding of the code before generating the fix.`;
    }
    buildUserPrompt(input, context) {
        const frameworkLabel = (0, base_agent_1.getFrameworkLabel)(context.framework);
        const parts = [
            '## Fix Generation Request',
            '',
            '### Test Information',
            `- **File:** ${context.testFile}`,
            `- **Test Name:** ${context.testName}`,
            `- **Test framework:** ${frameworkLabel}`,
            '',
            '### Analysis Summary',
            `- **Root Cause:** ${input.analysis.rootCauseCategory}`,
            `- **Confidence:** ${input.analysis.confidence}%`,
            `- **Explanation:** ${input.analysis.explanation}`,
            `- **Suggested Approach:** ${input.analysis.suggestedApproach}`,
            '',
            '### Investigation Findings',
            `- **Primary Finding:** ${input.investigation.primaryFinding?.description || 'None'}`,
            `- **Is Test Code Fixable:** ${input.investigation.isTestCodeFixable}`,
            `- **Recommended Approach:** ${input.investigation.recommendedApproach}`,
        ];
        if (input.investigation.selectorsToUpdate.length > 0) {
            parts.push('', '### Selectors to Update');
            for (const selector of input.investigation.selectorsToUpdate) {
                parts.push(`- Current: \`${selector.current}\``, `  Reason: ${selector.reason}`, selector.suggestedReplacement
                    ? `  Suggested: \`${selector.suggestedReplacement}\``
                    : '');
            }
        }
        parts.push('', '### Error Message', '```', context.errorMessage, '```');
        if (context.sourceFileContent) {
            parts.push('', '### Test File Content', '```javascript', context.sourceFileContent, '```');
        }
        if (input.previousFeedback) {
            parts.push('', '### Previous Review Feedback', '⚠️ The previous fix attempt was rejected. Please address these issues:', '```', input.previousFeedback, '```');
        }
        parts.push('', '## Instructions', '1. Based on the analysis and investigation, generate the necessary code changes', '2. Ensure oldCode matches EXACTLY what appears in the test file', '3. Make minimal, targeted changes', '4. Provide clear justification for each change', '', 'Respond with the JSON object as specified in the system prompt.');
        return parts.filter(Boolean).join('\n');
    }
    parseResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                this.log('No JSON found in response', 'warning');
                return null;
            }
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) {
                this.log('No changes in response', 'warning');
                return null;
            }
            const changes = parsed.changes.map((c) => ({
                file: c.file || '',
                line: c.line || 0,
                oldCode: c.oldCode || '',
                newCode: c.newCode || '',
                justification: c.justification || '',
                changeType: c.changeType || 'OTHER',
            }));
            for (const change of changes) {
                if (!change.file || !change.oldCode || !change.newCode) {
                    this.log('Change missing required fields', 'warning');
                    return null;
                }
            }
            return {
                changes,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
                summary: parsed.summary || '',
                reasoning: parsed.reasoning || '',
                evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
                risks: Array.isArray(parsed.risks) ? parsed.risks : [],
                alternatives: Array.isArray(parsed.alternatives)
                    ? parsed.alternatives
                    : undefined,
            };
        }
        catch (error) {
            this.log(`Failed to parse response: ${error}`, 'warning');
            return null;
        }
    }
}
exports.FixGenerationAgent = FixGenerationAgent;
//# sourceMappingURL=fix-generation-agent.js.map