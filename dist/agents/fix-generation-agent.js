"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixGenerationAgent = exports.WDIO_PATTERNS = exports.CYPRESS_PATTERNS = void 0;
const base_agent_1 = require("./base-agent");
const constants_1 = require("../config/constants");
const text_utils_1 = require("../utils/text-utils");
const CHANGE_TYPES = [
    'SELECTOR_UPDATE',
    'WAIT_ADDITION',
    'LOGIC_CHANGE',
    'ASSERTION_UPDATE',
    'OTHER',
];
const COMMON_PREAMBLE = `You are an expert test engineer who specializes in fixing failing E2E tests.

## Your Task

Generate precise, working code changes to fix the failing test based on the analysis and investigation provided.

## Code Change Requirements

1. **Exact Matching**: The "oldCode" MUST match the original code EXACTLY, character for character, including:
   - All whitespace (spaces, tabs, newlines)
   - All punctuation and quotes
   - All indentation

2. **Minimal Changes**: Only change what's necessary to fix the issue. Don't refactor unrelated code.

3. **Working Code**: The "newCode" must be syntactically valid and work correctly.

4. **Preserve Style**: Match the existing code style (quotes, semicolons, indentation).

`;
exports.CYPRESS_PATTERNS = `## Cypress Fix Patterns

### Chaining & Retry-ability
Cypress commands auto-retry, but \`.then()\` callbacks do not. Prefer assertion-based waits over arbitrary waits.

### Selector Updates
\`\`\`javascript
// OLD: Fragile class selector
cy.get('.old-button-class')

// NEW: Prefer data-testid, aria-label, or cy.contains
cy.get('[data-testid="submit-button"]')
cy.get('button').contains('Submit')
cy.findByRole('button', { name: 'Submit' })
\`\`\`

### Visibility/Existence Checks
\`\`\`javascript
// OLD: Click without checking visibility
cy.get('#element').click()

// NEW: Assert visible, then act
cy.get('#element').should('be.visible').click()
// For conditional elements:
cy.get('#element').should('exist').and('be.visible').click()
\`\`\`

### Timing/Wait Issues
\`\`\`javascript
// OLD: No wait for async operation
cy.get('#result')

// BEST: Intercept the API call
cy.intercept('GET', '/api/data').as('getData')
cy.wait('@getData')
cy.get('#result')

// ALT: Increase assertion timeout for slow renders
cy.get('#result', { timeout: 15000 }).should('contain', 'Expected')
\`\`\`

### Overflow/Responsive Menu
\`\`\`javascript
// OLD: Direct click on element that might be in overflow menu
cy.get('[aria-label="Action"]').click()

// NEW: Conditional interaction
cy.get('body').then($body => {
  if ($body.find('[aria-label="Action"]:visible').length > 0) {
    cy.get('[aria-label="Action"]').click()
  } else {
    cy.get('[aria-label="More"]').click()
    cy.get('[aria-label="Action"]').click()
  }
})
\`\`\`

### cy.session for Login
\`\`\`javascript
// Cache login across tests
cy.session('user', () => {
  cy.visit('/login')
  cy.get('#email').type(user.email)
  cy.get('#password').type(user.password)
  cy.get('button[type="submit"]').click()
  cy.url().should('not.include', '/login')
})
\`\`\`

### Iframe & Shadow DOM
\`\`\`javascript
// Access shadow DOM
cy.get('my-component').shadow().find('.inner-element')

// Switch into iframe
cy.get('iframe#editor').its('0.contentDocument.body').then(cy.wrap)
\`\`\`

### No-op Patterns to Avoid
\`\`\`javascript
// AVOID: wrapping Cypress chains in conditionals that re-check what
// Cypress already asserts. \`.should('not.exist')\` already waits until
// the element is gone (or times out).
// ❌ cy.get('body').then($body => {
//      if ($body.find('#snackbar').length > 0) {
//        cy.get('#snackbar').should('not.exist')  // already waits
//      }
//    })

// PREFER: just call the assertion — Cypress handles the absent case.
// ✅ cy.get('#snackbar').should('not.exist')

// Similarly, avoid adding \`cy.wait(1000)\` as a "safety buffer" before an
// assertion that already retries. Use an assertion-based wait or intercept.
\`\`\`

### Selector Form: Avoid Ambiguous Text Matches
\`\`\`javascript
// AVOID: mixing scope implicitly — \`cy.contains()\` returns the deepest
// matching element, which may not be the one you want when multiple
// elements contain the same text.
// ❌ cy.contains('Success')

// PREFER: scope contains() to a specific container, or use selector + text
// ✅ cy.get('[role="dialog"]').contains('Success')
// ✅ cy.findByRole('dialog').findByText('Success')  // @testing-library
\`\`\`

`;
exports.WDIO_PATTERNS = `## WebDriverIO Fix Patterns

### Selector Strategy
\`\`\`javascript
// OLD: Fragile class selector
await $('.old-button-class').click()

// NEW: Prefer data-testid or aria selectors
await $('[data-testid="submit-button"]').click()
await $('aria/Submit')  // WDIO aria selector strategy
\`\`\`

### waitForDisplayed / waitForClickable / waitForExist
\`\`\`javascript
// OLD: Click without waiting
await $('button').click()

// NEW: Wait for clickable state
await $('button').waitForClickable({ timeout: 15000 })
await $('button').click()

// For elements that load asynchronously
await $('[data-testid="result"]').waitForDisplayed({ timeout: 10000 })
const text = await $('[data-testid="result"]').getText()

// For elements that may not be in DOM yet
await $('[data-testid="modal"]').waitForExist({ timeout: 10000 })
\`\`\`

### browser.waitUntil for Complex Conditions
\`\`\`javascript
// OLD: Simple wait
await browser.pause(3000)

// NEW: Condition-based wait
await browser.waitUntil(
  async () => (await $('[data-testid="status"]').getText()) === 'Ready',
  { timeout: 15000, timeoutMsg: 'Status never became Ready' }
)
\`\`\`

### Multi-remote / Browser Scope
\`\`\`javascript
// OLD: Ambiguous browser reference in multi-remote
await $('button').click()

// NEW: Explicit browser instance
const elem = await browserA.$('[data-testid="start"]')
await elem.waitForClickable()
await elem.click()
\`\`\`

### Shadow DOM & Custom Elements
\`\`\`javascript
// Access shadow root
const host = await $('mux-player')
const shadowBtn = await host.shadow$('button.play')
await shadowBtn.waitForClickable({ timeout: 15000 })
await shadowBtn.click()
\`\`\`

### browser.execute for DOM Interaction
\`\`\`javascript
// Scroll element into view
await browser.execute((el) => el.scrollIntoView({ block: 'center' }), await $('button'))
await $('button').waitForClickable()
await $('button').click()
\`\`\`

### Stale Element Recovery
\`\`\`javascript
// OLD: Direct action on potentially stale element
const el = await $('button')
await el.click()

// NEW: Re-query before action
await $('button').waitForClickable({ timeout: 10000 })
await $('button').click()
\`\`\`

### Selector Form: Avoid Mixed Strategies
\`\`\`javascript
// AVOID: combining an attribute selector with partial-text matching on the
// SAME element. WDIO's docs call this "mixed strategies" and behavior
// depends on version; the \`*=\` text match may or may not scan descendant
// text of the attribute-matched element.
// ❌ await $("[role='dialog']*=Your success text")
// ❌ await $("header h1*=Welcome")   // explicitly forbidden in WDIO docs

// PREFER: chained element queries (guaranteed to scope correctly)
// ✅ const dialog = await $("[role='dialog']")
//    const success = await dialog.$("*=Your success text")
//    if (await success.isDisplayed()) { ... }

// OR: XPath with explicit descendant semantics (always unambiguous)
// ✅ await $("//*[@role='dialog']//*[contains(normalize-space(), 'Your success text')]")
\`\`\`

### No-op Patterns to Avoid
\`\`\`javascript
// AVOID: wrapping already-idempotent operations in existence guards.
// Most WDIO waits already handle the absent case cleanly — adding a guard
// creates a race window without adding safety.
// ❌ if (await el.isExisting()) {
//      await el.waitForExist({ reverse: true })   // already no-ops when absent
//    }
// The guarded form converts a real "appeared then didn't dismiss" signal
// into silence (if the element appears between the isExisting check and
// the wait, the wait is skipped).

// PREFER: call the wait directly — reverse: true returns immediately when
// the element doesn't exist, so no guard is needed.
// ✅ await el.waitForExist({ timeout: 120000, reverse: true })

// Similarly, don't wrap isDisplayed / isExisting in defensive try/catch
// that just returns false — these methods already return false on missing
// elements. Only catch when you need to distinguish stale-element errors.
\`\`\`

`;
const COMMON_SUFFIX = `## Output Format

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
  "alternatives": ["<other approaches that could work>"],
  "failureModeTrace": {
    "originalState": "<concrete runtime state at the moment of failure — reference specific values from the error message / logs (e.g., 'currentTime was 6.02s, pausedTime was 0.0s, drift 6.02 > tolerance 0.25'). Do NOT write generic phrases like 'timing issue' or 'flaky wait'.>",
    "rootMechanism": "<the specific causal chain that produced the failure. Describe WHY the runtime state above led to the assertion failing. Be concrete: 'pausedTime was captured immediately after clicking pause, but the player had not yet transitioned to paused, so pausedTime reflected the click moment (0s) not the actual pause moment'.>",
    "newStateAfterFix": "<what specifically is different in the runtime state after your fix runs. Tie this to the code change: 'After the fix, pausedTime is captured only after player.paused === true, so it reflects the actual pause moment and currentTime stays within tolerance of it'.>",
    "whyAssertionPassesNow": "<why the failing assertion will now succeed. If your new condition is logically STRONGER than the original (e.g., adds an AND-clause), you MUST explain why the added requirement is guaranteed to hold in the exact failure scenario. A fix that only tightens conditions will not make a failing test pass.>"
  }
}

## CRITICAL — failureModeTrace is REQUIRED

Your fix will be REJECTED by the review agent if failureModeTrace is missing, abstract, or if it doesn't demonstrably address the specific failure mode. Before writing the trace, ask yourself:

1. **Does my fix CHANGE the runtime state at the moment of failure, or just WRAP the existing check?**
   - Example of wrapping (bad): original \`|diff| <= 0.25\` fails → "fix" makes it \`paused && |diff| <= 0.5\`. The \`paused\` check is an AND-clause; if the original failed because \`paused\` wasn't true, the fix makes it harder to satisfy, not easier.
   - Example of changing state (good): original captures \`pausedTime\` before the pause event fires → "fix" adds \`waitUntil(() => paused)\` BEFORE capturing, so \`pausedTime\` reflects the actual pause.

2. **Is my new condition strictly stronger than the original?**
   - If yes, and the original was failing, the fix will not help unless the added requirement is guaranteed to hold in the failure scenario.
   - "Strictly stronger" means: every state that satisfies the new condition also satisfies the original, but not vice versa.
   - Examples of strictly stronger: AND-ing a new requirement, tightening a tolerance, adding an additional assertion.
   - Examples of weakening (often the right move): OR-ing a fallback, widening a tolerance, removing an overly-strict assertion.

3. **Does my trace reference CONCRETE values from the failure logs?**
   - Pull specific numbers and element states from the error message and log excerpts.
   - If you can't reference specifics, you probably don't understand the failure well enough to fix it — escalate by returning lower confidence.

## CRITICAL — oldCode MATCHING

- The "oldCode" field is used for find-and-replace. It MUST match EXACTLY.
- The test file content is provided with LINE NUMBERS (e.g., "  42: const x = 1;"). When copying oldCode, STRIP the line number prefixes — only include the actual code content.
- Include enough context in "oldCode" to uniquely identify the location (usually 3-5 lines).
- Reference the line numbers to locate code precisely, then copy the code portion VERBATIM (without the line number prefix).
- Example: if the source shows "  42:     const tolerance = Math.min(timer * 0.2, 0.75);", the oldCode should be "    const tolerance = Math.min(timer * 0.2, 0.75);" (preserving the indentation but NOT the line number).
- DO NOT invent, paraphrase, or reconstruct code from memory. Only copy from the provided source.
- Test your understanding of the code before generating the fix.

## PR DIFF CONSISTENCY (VERY IMPORTANT)

When PR changes are provided, your fix reasoning MUST be consistent with the diff:
- If the failure is in code NOT touched by the PR (e.g., login helpers, shared commands, auth flow), do NOT claim that code was "changed" or "updated" — the diff is the source of truth.
- If the error involves a selector or UI element that no PR file modified, the issue is likely pre-existing (environment drift, flaky test, or infrastructure change outside this PR).
- In such cases, your fix should address the actual brittleness (e.g., add fallback selectors, improve waits) rather than "adapt to a UI change" that the diff doesn't show.
- State clearly in your reasoning whether the failure area overlaps with PR changes or not.

## PRODUCT REPO DIFF ANALYSIS (MANDATORY)

When recent product repo changes are provided (e.g. from the learn-webapp), you MUST:
1. **Read every changed file** in the product diff before generating a fix.
2. **Correlate product changes with the failure**: If the product changed a component, selector, aria-label, layout, or behavior that the failing test relies on, your fix MUST account for the product change. State which product file/change caused the test to break.
3. **Distinguish root cause**: Clearly state whether the failure was caused by:
   - A product change (selector renamed, component restructured, new async behavior, etc.)
   - A pre-existing test brittleness (timing, flaky wait, environment drift)
   - A combination of both
4. **Adapt selectors and assertions**: If a product change renamed an aria-label, CSS class, or restructured DOM, update the test selectors to match the NEW product code — do NOT add fragile workarounds.
5. If no product diff is provided or the diff is unrelated, state that explicitly in your reasoning.`;
class FixGenerationAgent extends base_agent_1.BaseAgent {
    constructor(openaiClient, config) {
        super(openaiClient, 'FixGenerationAgent', {
            ...config,
            maxTokens: 6000,
        });
    }
    async execute(input, context, previousResponseId) {
        return this.executeWithTimeout(input, context, previousResponseId);
    }
    getSystemPrompt(framework) {
        switch (framework) {
            case 'cypress':
                return COMMON_PREAMBLE + exports.CYPRESS_PATTERNS + COMMON_SUFFIX;
            case 'webdriverio':
                return COMMON_PREAMBLE + exports.WDIO_PATTERNS + COMMON_SUFFIX;
            default:
                return COMMON_PREAMBLE + exports.CYPRESS_PATTERNS + exports.WDIO_PATTERNS + COMMON_SUFFIX;
        }
    }
    buildUserPrompt(input, context) {
        const frameworkLabel = (0, base_agent_1.getFrameworkLabel)(context.framework);
        const parts = [];
        if (context.delegationContext) {
            parts.push('### Orchestrator Briefing', context.delegationContext, '');
        }
        parts.push('## Fix Generation Request', '', '### Test Information', `- **File:** ${context.testFile}`, `- **Test Name:** ${context.testName}`, `- **Test framework:** ${frameworkLabel}`, '', '### Analysis Summary', `- **Root Cause:** ${input.analysis.rootCauseCategory}`, `- **Confidence:** ${input.analysis.confidence}%`, `- **Explanation:** ${input.analysis.explanation}`, `- **Suggested Approach:** ${input.analysis.suggestedApproach}`, '', '### Investigation Findings', `- **Primary Finding:** ${input.investigation.primaryFinding?.description || 'None'}`, `- **Is Test Code Fixable:** ${input.investigation.isTestCodeFixable}`, `- **Recommended Approach:** ${input.investigation.recommendedApproach}`);
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
        if (context.relatedFiles && context.relatedFiles.size > 0) {
            parts.push('', '### Related Files (page objects, helpers)');
            for (const [filePath, content] of context.relatedFiles) {
                if (!content)
                    continue;
                const lines = content.split('\n');
                const MAX_RELATED_LINES = 150;
                let displayLines;
                let rangeNote = '';
                if (lines.length > MAX_RELATED_LINES) {
                    const errorLineInFile = this.findErrorLineInFile(context.errorMessage, filePath, content);
                    if (errorLineInFile > 0) {
                        const enclosing = this.findEnclosingFunction(lines, errorLineInFile - 1);
                        const start = Math.max(0, Math.min(enclosing.fnStart, errorLineInFile - 30));
                        const end = Math.min(lines.length, Math.max(enclosing.fnEnd + 1, errorLineInFile + 30));
                        displayLines = lines.slice(start, end).map((line, i) => `${String(start + i + 1).padStart(4)}: ${line}`);
                        rangeNote = ` — showing lines ${start + 1}-${end} of ${lines.length} (around error at line ${errorLineInFile})`;
                    }
                    else {
                        const headLines = lines.slice(0, 30).map((line, i) => `${String(i + 1).padStart(4)}: ${line}`);
                        const tailStart = Math.max(30, lines.length - 60);
                        const tailLines = lines.slice(tailStart).map((line, i) => `${String(tailStart + i + 1).padStart(4)}: ${line}`);
                        displayLines = [...headLines, '    ...', `    ... (${lines.length - 90} lines omitted) ...`, '    ...', ...tailLines];
                        rangeNote = ` — showing first 30 and last 60 of ${lines.length} lines`;
                    }
                }
                else {
                    displayLines = lines.map((line, i) => `${String(i + 1).padStart(4)}: ${line}`);
                }
                parts.push('', `#### ${filePath} (${lines.length} lines${rangeNote})`, '⚠️ When proposing changes to this file, copy oldCode VERBATIM from the numbered lines below (strip the line number prefix).', '```javascript', displayLines.join('\n'), '```');
            }
        }
        if (context.prDiff && context.prDiff.files.length > 0) {
            parts.push('', '### Recent Changes in Test Repo', 'These files were changed in the test repository (commit/PR context). Use this to understand what recently changed in the test code.');
            for (const file of context.prDiff.files.slice(0, 5)) {
                parts.push(`\n**${file.filename}** (${file.status})`);
                if (file.patch) {
                    parts.push('```diff', file.patch.slice(0, 1000), '```');
                }
            }
        }
        if (context.productDiff && context.productDiff.files.length > 0) {
            parts.push('', `### ⚠️ MANDATORY: Recent Product Repo Changes (${constants_1.DEFAULT_PRODUCT_REPO})`, `These files were recently changed in the product codebase (${constants_1.DEFAULT_PRODUCT_REPO}). They are READ-ONLY — you may NOT modify them. However, you MUST review them to determine if a product change caused the test failure. If a product change renamed a selector, aria-label, component, or restructured layout, your test fix MUST match the new product code.`);
            for (const file of context.productDiff.files.slice(0, 10)) {
                parts.push(`\n**${file.filename}** (${file.status})`);
                if (file.patch) {
                    parts.push('```diff', file.patch.slice(0, 2000), '```');
                }
            }
            if (context.productDiff.files.length > 10) {
                parts.push(`\n... and ${context.productDiff.files.length - 10} more files`);
            }
        }
        else {
            parts.push('', '### Product Repo Changes', `No recent changes found in the product repo (${constants_1.DEFAULT_PRODUCT_REPO}). The failure is likely a test-side issue (timing, selector brittleness, environment drift).`);
        }
        if (input.previousFeedback) {
            parts.push('', '### Previous Review Feedback', '⚠️ The previous fix attempt was rejected. Please address these issues:', '```', input.previousFeedback, '```');
        }
        if (context.skillsPrompt) {
            parts.push('', context.skillsPrompt);
        }
        parts.push('', '## Instructions', '1. Review the product repo diff (if provided) FIRST — determine whether a product change caused this failure', '2. Based on the analysis, investigation, and product diff, generate the necessary code changes', '3. Ensure oldCode matches EXACTLY what appears in the test file', '4. Make minimal, targeted changes', '5. Provide clear justification for each change, explicitly noting if it adapts to a product change', '', 'Respond with the JSON object as specified in the system prompt.');
        return parts.filter(Boolean).join('\n');
    }
    findErrorLineInFile(errorMessage, filePath, _content) {
        const basename = filePath.split('/').pop() || '';
        const linePatterns = [
            new RegExp(`${basename.replace('.', '\\.')}:(\\d+)`),
            new RegExp(`${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`),
        ];
        for (const pat of linePatterns) {
            const match = errorMessage.match(pat);
            if (match)
                return parseInt(match[1], 10);
        }
        return 0;
    }
    findEnclosingFunction(lines, lineIndex) {
        const funcPattern = /^\s*(?:export\s+)?(?:public\s+)?(?:private\s+)?(?:protected\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))|^\s*(?:public\s+)?(?:private\s+)?(?:protected\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\w+[^{]*)?\s*\{/;
        let fnStart = lineIndex;
        for (let i = lineIndex; i >= 0; i--) {
            if (funcPattern.test(lines[i])) {
                fnStart = i;
                break;
            }
        }
        let braceDepth = 0;
        let fnEnd = lines.length - 1;
        let foundOpen = false;
        for (let i = fnStart; i < lines.length; i++) {
            for (const ch of lines[i]) {
                if (ch === '{') {
                    braceDepth++;
                    foundOpen = true;
                }
                else if (ch === '}') {
                    braceDepth--;
                }
            }
            if (foundOpen && braceDepth <= 0) {
                fnEnd = i;
                break;
            }
        }
        return { fnStart, fnEnd };
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
                changeType: (0, text_utils_1.coerceEnum)(c.changeType, CHANGE_TYPES, 'OTHER'),
            }));
            for (const change of changes) {
                if (!change.file || !change.oldCode || !change.newCode) {
                    this.log('Change missing required fields', 'warning');
                    return null;
                }
            }
            let failureModeTrace;
            if (parsed.failureModeTrace && typeof parsed.failureModeTrace === 'object') {
                const t = parsed.failureModeTrace;
                failureModeTrace = {
                    originalState: typeof t.originalState === 'string' ? t.originalState : '',
                    rootMechanism: typeof t.rootMechanism === 'string' ? t.rootMechanism : '',
                    newStateAfterFix: typeof t.newStateAfterFix === 'string' ? t.newStateAfterFix : '',
                    whyAssertionPassesNow: typeof t.whyAssertionPassesNow === 'string' ? t.whyAssertionPassesNow : '',
                };
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
                failureModeTrace,
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