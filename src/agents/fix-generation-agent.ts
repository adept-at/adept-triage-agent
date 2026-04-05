/**
 * Fix Generation Agent
 * Generates concrete code fixes based on analysis and investigation results
 */

import {
  BaseAgent,
  AgentContext,
  AgentResult,
  AgentConfig,
  getFrameworkLabel,
} from './base-agent';
import { OpenAIClient } from '../openai-client';
import { DEFAULT_PRODUCT_REPO } from '../config/constants';
import { AnalysisOutput } from './analysis-agent';
import { InvestigationOutput } from './investigation-agent';

/**
 * A single code change
 */
export interface CodeChange {
  /** File to modify */
  file: string;
  /** Line number (approximate) */
  line: number;
  /** Code to replace */
  oldCode: string;
  /** Replacement code */
  newCode: string;
  /** Why this change is needed */
  justification: string;
  /** Change type */
  changeType:
    | 'SELECTOR_UPDATE'
    | 'WAIT_ADDITION'
    | 'LOGIC_CHANGE'
    | 'ASSERTION_UPDATE'
    | 'OTHER';
}

/**
 * Output from the Fix Generation Agent
 */
export interface FixGenerationOutput {
  /** All proposed changes */
  changes: CodeChange[];
  /** Overall confidence in the fix */
  confidence: number;
  /** Summary of what the fix does */
  summary: string;
  /** Detailed reasoning for the fix */
  reasoning: string;
  /** Evidence supporting the fix */
  evidence: string[];
  /** Potential risks or limitations */
  risks: string[];
  /** Alternative approaches considered */
  alternatives?: string[];
}

/**
 * Input for the Fix Generation Agent
 */
export interface FixGenerationInput {
  /** Analysis results */
  analysis: AnalysisOutput;
  /** Investigation results */
  investigation: InvestigationOutput;
  /** Feedback from previous review (for iterations) */
  previousFeedback?: string | null;
}

/**
 * Fix Generation Agent Implementation
 */
export class FixGenerationAgent extends BaseAgent<
  FixGenerationInput,
  FixGenerationOutput
> {
  constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>) {
    super(openaiClient, 'FixGenerationAgent', {
      ...config,
      maxTokens: 6000, // Need more tokens for code generation
    });
  }

  /**
   * Execute fix generation
   */
  async execute(
    input: FixGenerationInput,
    context: AgentContext,
    previousResponseId?: string
  ): Promise<AgentResult<FixGenerationOutput>> {
    return this.executeWithTimeout(input, context, previousResponseId);
  }

  /**
   * Get the system prompt
   */
  protected getSystemPrompt(): string {
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
  }

  /**
   * Build the user prompt
   */
  protected buildUserPrompt(
    input: FixGenerationInput,
    context: AgentContext
  ): string {
    const frameworkLabel = getFrameworkLabel(context.framework);
    const parts: string[] = [
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
      `- **Primary Finding:** ${
        input.investigation.primaryFinding?.description || 'None'
      }`,
      `- **Is Test Code Fixable:** ${input.investigation.isTestCodeFixable}`,
      `- **Recommended Approach:** ${input.investigation.recommendedApproach}`,
    ];

    // Add selectors that need updating
    if (input.investigation.selectorsToUpdate.length > 0) {
      parts.push('', '### Selectors to Update');
      for (const selector of input.investigation.selectorsToUpdate) {
        parts.push(
          `- Current: \`${selector.current}\``,
          `  Reason: ${selector.reason}`,
          selector.suggestedReplacement
            ? `  Suggested: \`${selector.suggestedReplacement}\``
            : ''
        );
      }
    }

    // Add error message
    parts.push('', '### Error Message', '```', context.errorMessage, '```');

    // Add source file content
    if (context.sourceFileContent) {
      parts.push(
        '',
        '### Test File Content',
        '```javascript',
        context.sourceFileContent,
        '```'
      );
    }

    // Add related files (page objects, helpers) — these are where fixes often need to go
    if (context.relatedFiles && context.relatedFiles.size > 0) {
      parts.push('', '### Related Files (page objects, helpers)');
      for (const [filePath, content] of context.relatedFiles) {
        if (!content) continue;
        const lines = content.split('\n');
        const MAX_RELATED_LINES = 150;

        let displayLines: string[];
        let rangeNote = '';
        if (lines.length > MAX_RELATED_LINES) {
          // For large files, extract the relevant section around the error location
          const errorLineInFile = this.findErrorLineInFile(context.errorMessage, filePath, content);
          if (errorLineInFile > 0) {
            const enclosing = this.findEnclosingFunction(lines, errorLineInFile - 1);
            const start = Math.max(0, Math.min(enclosing.fnStart, errorLineInFile - 30));
            const end = Math.min(lines.length, Math.max(enclosing.fnEnd + 1, errorLineInFile + 30));
            displayLines = lines.slice(start, end).map(
              (line, i) => `${String(start + i + 1).padStart(4)}: ${line}`
            );
            rangeNote = ` — showing lines ${start + 1}-${end} of ${lines.length} (around error at line ${errorLineInFile})`;
          } else {
            // No error line found — show first and last sections
            const headLines = lines.slice(0, 30).map((line, i) => `${String(i + 1).padStart(4)}: ${line}`);
            const tailStart = Math.max(30, lines.length - 60);
            const tailLines = lines.slice(tailStart).map((line, i) => `${String(tailStart + i + 1).padStart(4)}: ${line}`);
            displayLines = [...headLines, '    ...', `    ... (${lines.length - 90} lines omitted) ...`, '    ...', ...tailLines];
            rangeNote = ` — showing first 30 and last 60 of ${lines.length} lines`;
          }
        } else {
          displayLines = lines.map((line, i) => `${String(i + 1).padStart(4)}: ${line}`);
        }

        parts.push(
          '',
          `#### ${filePath} (${lines.length} lines${rangeNote})`,
          '⚠️ When proposing changes to this file, copy oldCode VERBATIM from the numbered lines below (strip the line number prefix).',
          '```javascript',
          displayLines.join('\n'),
          '```'
        );
      }
    }

    if (context.prDiff && context.prDiff.files.length > 0) {
      parts.push(
        '',
        '### Recent Changes in Test Repo',
        'These files were changed in the test repository (commit/PR context). Use this to understand what recently changed in the test code.'
      );
      for (const file of context.prDiff.files.slice(0, 5)) {
        parts.push(`\n**${file.filename}** (${file.status})`);
        if (file.patch) {
          parts.push('```diff', file.patch.slice(0, 1000), '```');
        }
      }
    }

    if (context.productDiff && context.productDiff.files.length > 0) {
      parts.push(
        '',
        `### ⚠️ MANDATORY: Recent Product Repo Changes (${DEFAULT_PRODUCT_REPO})`,
        `These files were recently changed in the product codebase (${DEFAULT_PRODUCT_REPO}). They are READ-ONLY — you may NOT modify them. However, you MUST review them to determine if a product change caused the test failure. If a product change renamed a selector, aria-label, component, or restructured layout, your test fix MUST match the new product code.`
      );
      for (const file of context.productDiff.files.slice(0, 10)) {
        parts.push(`\n**${file.filename}** (${file.status})`);
        if (file.patch) {
          parts.push('```diff', file.patch.slice(0, 2000), '```');
        }
      }
      if (context.productDiff.files.length > 10) {
        parts.push(`\n... and ${context.productDiff.files.length - 10} more files`);
      }
    } else {
      parts.push(
        '',
        '### Product Repo Changes',
        `No recent changes found in the product repo (${DEFAULT_PRODUCT_REPO}). The failure is likely a test-side issue (timing, selector brittleness, environment drift).`
      );
    }

    // Add previous feedback if this is an iteration
    if (input.previousFeedback) {
      parts.push(
        '',
        '### Previous Review Feedback',
        '⚠️ The previous fix attempt was rejected. Please address these issues:',
        '```',
        input.previousFeedback,
        '```'
      );
    }

    parts.push(
      '',
      '## Instructions',
      '1. Review the product repo diff (if provided) FIRST — determine whether a product change caused this failure',
      '2. Based on the analysis, investigation, and product diff, generate the necessary code changes',
      '3. Ensure oldCode matches EXACTLY what appears in the test file',
      '4. Make minimal, targeted changes',
      '5. Provide clear justification for each change, explicitly noting if it adapts to a product change',
      '',
      'Respond with the JSON object as specified in the system prompt.'
    );

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Try to find which line in a related file corresponds to the error
   */
  private findErrorLineInFile(errorMessage: string, filePath: string, _content: string): number {
    const basename = filePath.split('/').pop() || '';
    // Look for patterns like "file.ts:448" or "file.ts:448:5"
    const linePatterns = [
      new RegExp(`${basename.replace('.', '\\.')}:(\\d+)`),
      new RegExp(`${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`),
    ];
    for (const pat of linePatterns) {
      const match = errorMessage.match(pat);
      if (match) return parseInt(match[1], 10);
    }
    return 0;
  }

  /**
   * Find the enclosing function boundaries around a line index
   */
  private findEnclosingFunction(lines: string[], lineIndex: number): { fnStart: number; fnEnd: number } {
    const funcPattern =
      /^\s*(?:export\s+)?(?:public\s+)?(?:private\s+)?(?:protected\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))|^\s*(?:public\s+)?(?:private\s+)?(?:protected\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\w+[^{]*)?\s*\{/;
    let fnStart = lineIndex;
    for (let i = lineIndex; i >= 0; i--) {
      if (funcPattern.test(lines[i])) { fnStart = i; break; }
    }
    let braceDepth = 0;
    let fnEnd = lines.length - 1;
    let foundOpen = false;
    for (let i = fnStart; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { braceDepth++; foundOpen = true; }
        else if (ch === '}') { braceDepth--; }
      }
      if (foundOpen && braceDepth <= 0) { fnEnd = i; break; }
    }
    return { fnStart, fnEnd };
  }

  /**
   * Parse the response
   */
  protected parseResponse(response: string): FixGenerationOutput | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.log('No JSON found in response', 'warning');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate changes
      if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) {
        this.log('No changes in response', 'warning');
        return null;
      }

      // Normalize changes
      const changes: CodeChange[] = parsed.changes.map((c: CodeChange) => ({
        file: c.file || '',
        line: c.line || 0,
        oldCode: c.oldCode || '',
        newCode: c.newCode || '',
        justification: c.justification || '',
        changeType: c.changeType || 'OTHER',
      }));

      // Validate that all changes have required fields
      for (const change of changes) {
        if (!change.file || !change.oldCode || !change.newCode) {
          this.log('Change missing required fields', 'warning');
          return null;
        }
      }

      return {
        changes,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 50,
        summary: parsed.summary || '',
        reasoning: parsed.reasoning || '',
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        alternatives: Array.isArray(parsed.alternatives)
          ? parsed.alternatives
          : undefined,
      };
    } catch (error) {
      this.log(`Failed to parse response: ${error}`, 'warning');
      return null;
    }
  }
}
