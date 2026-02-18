"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestigationAgent = void 0;
const base_agent_1 = require("./base-agent");
class InvestigationAgent extends base_agent_1.BaseAgent {
    constructor(openaiClient, config) {
        super(openaiClient, 'InvestigationAgent', config);
    }
    async execute(input, context) {
        return this.executeWithTimeout(input, context);
    }
    getSystemPrompt() {
        return `You are an expert investigator for test failures. Your job is to cross-reference error analysis with actual code to identify the specific cause of failures.

## Investigation Process

1. **Compare Selectors**: Check if selectors in the test exist in the codebase
2. **Trace Changes**: Look for recent changes that might have caused the issue
3. **Check Timing**: Identify potential timing issues between test expectations and app behavior
4. **Validate State**: Verify if test assumptions about state are correct
5. **Cross-Reference**: Match error patterns with code patterns

## Finding Types

- SELECTOR_CHANGE: A selector in the test no longer matches elements in the app
- MISSING_ELEMENT: An element the test expects doesn't exist
- TIMING_GAP: Test is too fast/slow for the app's behavior
- STATE_ISSUE: Test depends on state that isn't set up correctly
- CODE_CHANGE: Recent code changes broke the test
- OTHER: Something else

## Output Format

You MUST respond with a JSON object matching this schema:
{
  "findings": [
    {
      "type": "<finding type>",
      "severity": "<HIGH|MEDIUM|LOW>",
      "description": "<what was found>",
      "evidence": ["<supporting evidence>"],
      "location": {
        "file": "<file path>",
        "line": <line number>,
        "code": "<relevant code snippet>"
      },
      "relationToError": "<how this finding explains the error>"
    }
  ],
  "primaryFinding": <the most important finding object>,
  "isTestCodeFixable": <boolean - can this be fixed by changing test code?>,
  "recommendedApproach": "<one paragraph describing the fix approach>",
  "selectorsToUpdate": [
    {
      "current": "<current selector>",
      "reason": "<why it needs updating>",
      "suggestedReplacement": "<suggested new selector if known>"
    }
  ],
  "confidence": <0-100>
}`;
    }
    buildUserPrompt(input, context) {
        const frameworkLabel = (0, base_agent_1.getFrameworkLabel)(context.framework);
        const parts = [
            '## Investigation Request',
            '',
            `**Test framework:** ${frameworkLabel}`,
            '',
            '### Error Analysis Results',
            `- **Root Cause Category:** ${input.analysis.rootCauseCategory}`,
            `- **Analysis Confidence:** ${input.analysis.confidence}%`,
            `- **Issue Location:** ${input.analysis.issueLocation}`,
            `- **Explanation:** ${input.analysis.explanation}`,
            '',
            '### Identified Selectors',
            input.analysis.selectors.length > 0
                ? input.analysis.selectors.map((s) => `- \`${s}\``).join('\n')
                : '- No selectors identified',
            '',
            '### Detected Patterns',
            `- Timeout: ${input.analysis.patterns.hasTimeout}`,
            `- Visibility Issue: ${input.analysis.patterns.hasVisibilityIssue}`,
            `- Network Call: ${input.analysis.patterns.hasNetworkCall}`,
            `- State Assertion: ${input.analysis.patterns.hasStateAssertion}`,
            `- Dynamic Content: ${input.analysis.patterns.hasDynamicContent}`,
            `- Responsive Issue: ${input.analysis.patterns.hasResponsiveIssue}`,
        ];
        if (input.codeContext) {
            parts.push('', '### Test File Content', '```javascript', input.codeContext.testFileContent.slice(0, 4000), '```');
            if (input.codeContext.relatedFiles.length > 0) {
                parts.push('', '### Related Files');
                for (const file of input.codeContext.relatedFiles.slice(0, 3)) {
                    parts.push('', `#### ${file.path}`, `Relevance: ${file.relevance}`, '```', file.content.slice(0, 1500), '```');
                }
            }
            if (input.codeContext.customCommands.length > 0) {
                const cmdPrefix = context.framework === 'webdriverio' ? 'browser' : 'cy';
                parts.push('', '### Custom Commands', input.codeContext.customCommands
                    .map((c) => `- \`${cmdPrefix}.${c.name}()\` in ${c.file}`)
                    .join('\n'));
            }
        }
        if (context.prDiff && context.prDiff.files.length > 0) {
            parts.push('', '### Recent Changes (PR Diff)');
            for (const file of context.prDiff.files.slice(0, 5)) {
                parts.push(`- **${file.filename}** (${file.status})`);
                if (file.patch) {
                    parts.push('```diff', file.patch.slice(0, 1000), '```');
                }
            }
        }
        if (context.screenshots && context.screenshots.length > 0) {
            parts.push('', '### Screenshots', `${context.screenshots.length} screenshot(s) are attached. Analyze them to see:`, '- What elements are visible', '- What the actual DOM state looks like', '- Any visual clues about the failure');
        }
        parts.push('', '## Instructions', 'Based on all the information above:', '1. Identify all findings that explain or contribute to the failure', '2. Determine the primary cause', '3. Check if the issue can be fixed in test code', '4. List any selectors that need to be updated', '5. Provide a recommended fix approach', '', 'Respond with the JSON object as specified in the system prompt.');
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
            const findings = Array.isArray(parsed.findings)
                ? parsed.findings.map((f) => ({
                    type: f.type || 'OTHER',
                    severity: f.severity || 'MEDIUM',
                    description: f.description || '',
                    evidence: Array.isArray(f.evidence) ? f.evidence : [],
                    location: f.location,
                    relationToError: f.relationToError || '',
                }))
                : [];
            const selectorsToUpdate = Array.isArray(parsed.selectorsToUpdate)
                ? parsed.selectorsToUpdate.map((s) => ({
                    current: s.current || '',
                    reason: s.reason || '',
                    suggestedReplacement: s.suggestedReplacement,
                }))
                : [];
            return {
                findings,
                primaryFinding: parsed.primaryFinding || findings[0],
                isTestCodeFixable: parsed.isTestCodeFixable !== false,
                recommendedApproach: parsed.recommendedApproach || '',
                selectorsToUpdate,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
            };
        }
        catch (error) {
            this.log(`Failed to parse response: ${error}`, 'warning');
            return null;
        }
    }
}
exports.InvestigationAgent = InvestigationAgent;
//# sourceMappingURL=investigation-agent.js.map