"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewAgent = void 0;
const base_agent_1 = require("./base-agent");
const constants_1 = require("../config/constants");
const skill_store_1 = require("../services/skill-store");
const text_utils_1 = require("../utils/text-utils");
const REVIEW_SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const TRACE_FIELD_MAX_CHARS = 1000;
function formatTraceField(value) {
    if (typeof value !== 'string' || !value)
        return '(EMPTY — flag CRITICAL)';
    const sanitized = (0, skill_store_1.sanitizeForPrompt)(value, TRACE_FIELD_MAX_CHARS);
    return sanitized || '(EMPTY — flag CRITICAL)';
}
class ReviewAgent extends base_agent_1.BaseAgent {
    constructor(openaiClient, config) {
        const resolvedModel = config?.model ?? constants_1.AGENT_MODEL.review;
        const resolvedEffort = resolvedModel === constants_1.OPENAI.UPGRADED_MODEL
            ? (config?.reasoningEffort ?? constants_1.REASONING_EFFORT.review)
            : 'none';
        super(openaiClient, 'ReviewAgent', {
            ...config,
            model: resolvedModel,
            reasoningEffort: resolvedEffort,
        });
    }
    async execute(input, context, previousResponseId) {
        return this.executeWithTimeout(input, context, previousResponseId);
    }
    getSystemPrompt() {
        return `You are a senior QA engineer reviewing proposed test fixes.

## Your Role

Review code changes proposed to fix failing tests. Your job is to:
1. Verify the fix addresses the root cause
2. Check that oldCode matches the actual file content
3. Ensure newCode is syntactically valid
4. Validate the fix won't introduce new issues
5. Confirm the fix follows best practices

## Review Criteria

### CRITICAL Issues (Must Fix)
- oldCode doesn't match the file content
- Syntax errors in newCode
- Fix doesn't address the root cause
- Fix could cause other tests to fail
- Security vulnerabilities
- Fix reasoning contradicts the PR diff (e.g., claims code was "changed" when the diff shows it was NOT modified)
- **Fix is a no-op**: the proposed change is behaviorally equivalent to the original code. Examples to reject:
  - Wrapping \`waitForExist({ reverse: true })\` in \`if (isExisting())\` — the reverse wait already returns immediately when the element is absent; the guard adds no safety and opens a race window
  - Wrapping \`isDisplayed()\` / \`isExisting()\` in try/catch that just returns false — these methods already return false on missing elements
  - Adding \`.should('exist')\` before another \`.should(...)\` on the same element — the second assertion already waits for the element
  - Reformatting whitespace / reordering identical logic with no behavioral change
- **Fix targets the wrong line**: the proposed \`oldCode\` is in a different block than the actual failing assertion. Verify by cross-referencing the error message / stack trace against the change location. A fix at line N that doesn't touch the line where the timeout/assertion fired is almost always wrong.
- **Missing or vague failureModeTrace**: the fix recommendation MUST include a \`failureModeTrace\` object with four fields (\`originalState\`, \`rootMechanism\`, \`newStateAfterFix\`, \`whyAssertionPassesNow\`). Reject if any field is:
  - Missing, empty, or a placeholder like "timing issue" / "flaky test" / "more robust"
  - Generic prose without specific references to values/events from the failure logs
  - A tautology (e.g., "originalState: the assertion failed" — restates the symptom without explaining the mechanism)
  - Inconsistent with the proposed code change (e.g., trace describes changing when pausedTime is captured, but the code only changes the assertion condition)
  The trace is the agent's own hypothesis about what the fix does; without it, we cannot verify the fix is causally sound.
- **Logical strengthening without justification**: if the new condition is **strictly stronger** than the original (i.e., logically AND of the original requirement + an additional requirement, a tightened tolerance, or an additional assertion), the fix cannot make a failing test pass unless the added requirement is *guaranteed* to hold in the exact scenario that caused the original failure. Reject unless \`whyAssertionPassesNow\` specifically justifies this. Examples:
  - Original \`|diff| <= 0.25\` fails → "fix" \`paused && |diff| <= 0.5\`. The \`paused\` AND-clause is new; \`0.25 → 0.5\` widens but is dominated by the added AND. If \`paused\` wasn't true in the failure scenario, the fix makes things worse.
  - Original \`cy.get('[role="dialog"]').should('be.visible')\` times out → "fix" adds \`.should('be.visible').and('contain.text', 'Success')\`. The \`.and()\` adds a requirement; doesn't help if the dialog was never visible.
  - Original \`element.click()\` fails because element doesn't exist → "fix" adds \`.waitForClickable()\` before click. This is NOT strictly stronger — the wait gives the element time to appear. OK.
  If the code changes the runtime state BEFORE the check (e.g., adds a wait for a state transition, removes a stale-element source), that's a different direction and generally helps. If the code only changes the CHECK itself by adding constraints, it almost certainly doesn't help.
- **Fix contradicts analysis \`issueLocation=APP_CODE\`** without addressing why the analysis agent believed the failure was product-side. When upstream reasoning said the bug lives in product code and the fix only modifies test code, the fix is likely papering over a real product regression. Reject unless the fix explicitly explains why the test-side change is appropriate despite the APP_CODE verdict (e.g., "the test was asserting on outdated product behavior; the product change is intentional and the test needs to adapt").
- **Fix contradicts investigation \`verdictOverride\`**. Investigation can override the classification when its evidence points to a different failure location. If \`verdictOverride.suggestedLocation=APP_CODE\` and the fix modifies test code anyway without citing investigation's evidence as misleading, reject as CRITICAL — the override exists precisely to catch this case.
- **Fix ignores investigation's \`recommendedApproach\`** when the approach conflicts with what was actually changed. Missing a piece of the recommendation is a WARNING; directly contradicting it (e.g., investigation said "widen the tolerance" and the fix tightens it) is CRITICAL.

### WARNING Issues (Should Fix)
- Suboptimal selector choice
- Missing error handling
- Fragile timing assumptions
- Hardcoded values that should be configurable
- **Mixed selector strategies** (WebdriverIO): combining an attribute selector with partial-text matching on the SAME element, e.g. \`$("[role='dialog']*=Success")\`. WDIO's documented behavior for this form is ambiguous. Suggest chained form (\`$("[role='dialog']").$("*=Success")\`) or XPath.
- **Ambiguous \`cy.contains()\`** (Cypress): unscoped \`cy.contains('text')\` returns the deepest matching element; prefer \`cy.get('[role="dialog"]').contains('text')\` or a scoped selector.
- **Stacking fallbacks on chronically flaky specs**: if the agent memory context shows this spec has been auto-fixed multiple times recently, flag when the proposed fix adds yet another fallback selector/timeout rather than removing a fixed \`browser.pause()\` or consolidating success surfaces. Layering defenses is a smell.

### SUGGESTION Issues (Nice to Have)
- Code style inconsistencies
- Opportunities for better readability
- Minor improvements

## Output Format

You MUST respond with a JSON object matching this schema:
{
  "approved": <boolean - true only if no CRITICAL issues>,
  "issues": [
    {
      "severity": "<CRITICAL|WARNING|SUGGESTION>",
      "changeIndex": <index of the change with the issue>,
      "description": "<what's wrong>",
      "suggestion": "<how to fix it>"
    }
  ],
  "assessment": "<overall assessment paragraph>",
  "fixConfidence": <0-100 - likelihood the fix will work>,
  "improvements": ["<optional suggestions for improvement>"]
}

## Approval Rules

- Approve if: No CRITICAL issues AND fix addresses root cause
- Reject if: Any CRITICAL issues OR fix doesn't address the problem
- CRITICAL issues automatically mean rejection`;
    }
    buildUserPrompt(input, context) {
        const parts = [];
        if (context.delegationContext) {
            parts.push('### Orchestrator Briefing', context.delegationContext, '');
        }
        parts.push('## Fix Review Request', '', '### Analysis Agent Findings', `- **Root Cause Category:** ${input.analysis.rootCauseCategory}`, `- **Analysis Confidence:** ${input.analysis.confidence}%`, `- **Issue Location:** ${input.analysis.issueLocation}`, `- **Explanation:** ${input.analysis.explanation}`, `- **Suggested Approach (what analysis said the fix should do):** ${input.analysis.suggestedApproach}`);
        const patterns = input.analysis.patterns;
        if (patterns) {
            const flaggedPatterns = Object.entries(patterns)
                .filter(([, v]) => v === true)
                .map(([k]) => k);
            if (flaggedPatterns.length > 0) {
                parts.push(`- **Patterns flagged:** ${flaggedPatterns.join(', ')}`);
            }
        }
        if (input.analysis.selectors && input.analysis.selectors.length > 0) {
            parts.push(`- **Selectors identified by analysis:** ${input.analysis.selectors.map((s) => `\`${s}\``).join(', ')}`);
        }
        if (input.analysis.issueLocation === 'APP_CODE') {
            parts.push('', '⚠️ **CRITICAL CONTEXT:** Analysis flagged `issueLocation=APP_CODE`. A test-code fix is only appropriate if investigation explicitly identified a test-side workaround is valid. Be highly skeptical of any fix that modifies test code without addressing why analysis thought the problem was product-side.');
        }
        if (input.investigation) {
            const inv = input.investigation;
            parts.push('', '### Investigation Agent Findings (audit the fix AGAINST these)', `- **Investigation Confidence:** ${inv.confidence}%`, `- **Is Test Code Fixable:** ${inv.isTestCodeFixable}`, `- **Recommended Approach:** ${inv.recommendedApproach}`);
            if (inv.primaryFinding) {
                parts.push(`- **Primary Finding:** ${inv.primaryFinding.description}`, `  - Severity: ${inv.primaryFinding.severity}`, `  - Relation to error: ${inv.primaryFinding.relationToError}`);
            }
            if (inv.findings && inv.findings.length > 1) {
                parts.push('', '#### All Findings (ranked)');
                inv.findings.forEach((f, i) => {
                    parts.push(`${i + 1}. [${f.severity}] ${f.type}: ${f.description}`, `   - Relation to error: ${f.relationToError}`);
                });
            }
            if (inv.selectorsToUpdate && inv.selectorsToUpdate.length > 0) {
                parts.push('', '#### Selectors Investigation Said Need Updating', ...inv.selectorsToUpdate.map((s) => `- Current: \`${s.current}\` — ${s.reason}${s.suggestedReplacement ? ` → suggested: \`${s.suggestedReplacement}\`` : ''}`));
            }
            if (inv.verdictOverride) {
                const o = inv.verdictOverride;
                parts.push('', `⚠️ **Verdict Override from Investigation:** ${o.suggestedLocation} (${o.confidence}% confidence)`, `Evidence: ${o.evidence.join('; ')}`, 'The investigation agent concluded the failure location may differ from analysis. Audit whether the proposed fix is consistent with this.');
            }
        }
        parts.push('', '### Proposed Fix', `- **Summary:** ${input.proposedFix.summary}`, `- **Confidence:** ${input.proposedFix.confidence}%`, `- **Reasoning:** ${input.proposedFix.reasoning}`);
        const trace = input.proposedFix.failureModeTrace;
        if (trace) {
            parts.push('', '### Failure Mode Trace (MUST audit for quality)', `- **originalState:** ${formatTraceField(trace.originalState)}`, `- **rootMechanism:** ${formatTraceField(trace.rootMechanism)}`, `- **newStateAfterFix:** ${formatTraceField(trace.newStateAfterFix)}`, `- **whyAssertionPassesNow:** ${formatTraceField(trace.whyAssertionPassesNow)}`);
        }
        else {
            parts.push('', '### Failure Mode Trace', '- **MISSING** — the fix did not provide a failureModeTrace. Per the system rules, flag this as CRITICAL and reject the fix.');
        }
        parts.push('', '### Code Changes');
        for (let i = 0; i < input.proposedFix.changes.length; i++) {
            const change = input.proposedFix.changes[i];
            parts.push('', `#### Change ${i + 1}: ${change.file}`, `Line: ${change.line}`, `Type: ${change.changeType}`, `Justification: ${change.justification}`, '', '**Old Code:**', '```', change.oldCode, '```', '', '**New Code:**', '```', change.newCode, '```');
        }
        if (context.sourceFileContent) {
            parts.push('', '### Original File Content (for verification)', '```javascript', context.sourceFileContent, '```');
        }
        if (context.relatedFiles && context.relatedFiles.size > 0) {
            for (const [filePath, content] of context.relatedFiles) {
                if (!content)
                    continue;
                parts.push('', `### Related File: ${filePath} (for verification)`, '```javascript', content, '```');
            }
        }
        if (context.prDiff && context.prDiff.files.length > 0) {
            parts.push('', '### Test Repo Changes (for context)');
            for (const file of context.prDiff.files.slice(0, 5)) {
                parts.push(`- **${file.filename}** (${file.status})`);
                if (file.patch) {
                    parts.push('```diff', file.patch.slice(0, 800), '```');
                }
            }
        }
        if (context.productDiff && context.productDiff.files.length > 0) {
            parts.push('', '### Product Repo Changes (MANDATORY review)', 'Verify the proposed fix accounts for these product changes. If a product change caused the failure, the fix MUST adapt to the new product code.');
            for (const file of context.productDiff.files.slice(0, 8)) {
                parts.push(`- **${file.filename}** (${file.status})`);
                if (file.patch) {
                    parts.push('```diff', file.patch.slice(0, 1500), '```');
                }
            }
        }
        if (input.proposedFix.risks.length > 0) {
            parts.push('', '### Identified Risks', input.proposedFix.risks.map((r) => `- ${r}`).join('\n'));
        }
        if (context.skillsPrompt) {
            parts.push('', context.skillsPrompt);
        }
        parts.push('', '## Review Instructions', '1. For each change, verify oldCode appears EXACTLY in the file', '2. Check that newCode is syntactically valid', '3. Verify the fix addresses the root cause', '4. Look for potential side effects', '5. Assess overall likelihood of success', '6. CRITICAL: If PR changes are provided, verify the fix reasoning is consistent with the diff — if the fix claims code was "changed" or "updated" but the diff does NOT show that change, flag as CRITICAL issue', '7. CRITICAL: Inspect `failureModeTrace`. If missing or any field is vague/generic/tautological, flag a CRITICAL issue citing which field is inadequate.', '8. CRITICAL: Determine if the new condition/assertion is **strictly stronger** than the original. If yes, verify `whyAssertionPassesNow` justifies why the added requirement is guaranteed to hold in the failure scenario. If it does not, flag a CRITICAL issue — a strictly stronger condition cannot turn a failing assertion into a passing one.', '9. CRITICAL: If analysis flagged `issueLocation=APP_CODE`, audit whether the proposed test-code fix is appropriate. Flag as CRITICAL if the fix modifies test code without addressing why the analysis agent believed the failure was product-side.', '10. CRITICAL: If investigation provided a `verdictOverride` (especially `APP_CODE`), verify the proposed fix is consistent with that finding. Flag as CRITICAL if the fix contradicts the verdict override evidence without explicit justification.', '11. If investigation provided `recommendedApproach` and/or `selectorsToUpdate`, verify the proposed fix covers them. Flag as WARNING if the fix omits an investigation-flagged selector or deviates from the recommended approach. Flag as CRITICAL if the fix directly contradicts the recommendation.', '12. If investigation listed multiple findings, the fix does not need to address every finding — but the reviewer should note any HIGH-severity finding the fix does not address and flag whether the missed finding is a likely cause of future failures.', '', 'Respond with the JSON object as specified in the system prompt.');
        return parts.join('\n');
    }
    parseResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                this.log('No JSON found in response', 'warning');
                return null;
            }
            const parsed = JSON.parse(jsonMatch[0]);
            const issues = Array.isArray(parsed.issues)
                ? parsed.issues.map((i) => ({
                    severity: (0, text_utils_1.coerceEnum)(i.severity, REVIEW_SEVERITIES, 'WARNING'),
                    changeIndex: typeof i.changeIndex === 'number' ? i.changeIndex : 0,
                    description: i.description || '',
                    suggestion: i.suggestion,
                }))
                : [];
            const hasCritical = issues.some((i) => i.severity === 'CRITICAL');
            const approved = !hasCritical && parsed.approved !== false;
            return {
                approved,
                issues,
                assessment: parsed.assessment || '',
                fixConfidence: typeof parsed.fixConfidence === 'number' ? parsed.fixConfidence : 50,
                improvements: Array.isArray(parsed.improvements)
                    ? parsed.improvements
                    : undefined,
            };
        }
        catch (error) {
            this.log(`Failed to parse response: ${error}`, 'warning');
            return null;
        }
    }
}
exports.ReviewAgent = ReviewAgent;
//# sourceMappingURL=review-agent.js.map