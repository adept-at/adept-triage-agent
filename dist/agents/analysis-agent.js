"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisAgent = void 0;
const base_agent_1 = require("./base-agent");
class AnalysisAgent extends base_agent_1.BaseAgent {
    constructor(openaiClient, config) {
        super(openaiClient, 'AnalysisAgent', config);
    }
    async execute(input, context) {
        return this.executeWithTimeout(input, context);
    }
    getSystemPrompt() {
        return `You are an expert test failure analyst specializing in Cypress and end-to-end tests.

Your job is to analyze test failures and identify the root cause with high precision.

## Root Cause Categories

- SELECTOR_MISMATCH: The selector used in the test doesn't match any element or matches the wrong element. This includes:
  - Changed class names, IDs, or data attributes
  - Missing elements
  - Elements moved to different locations in the DOM
  - Responsive design changes affecting element presence

- TIMING_ISSUE: The test has timing problems. This includes:
  - Race conditions between test and application
  - Insufficient waits for async operations
  - Animation timing
  - Network request timing

- STATE_DEPENDENCY: The test depends on application state that isn't properly set up. This includes:
  - Missing login state
  - Incorrect initial data
  - Previous test side effects

- NETWORK_ISSUE: Problems with network requests. This includes:
  - Failed API calls
  - Timeout on network requests
  - Unexpected response data

- ELEMENT_VISIBILITY: Element exists but isn't visible or interactable. This includes:
  - Element hidden behind another element
  - Element outside viewport
  - Element with visibility: hidden or display: none
  - Element covered by modal/overlay

- ASSERTION_MISMATCH: The assertion logic is incorrect. This includes:
  - Wrong expected values
  - Incorrect assertion method
  - Partial match needed instead of exact match

- DATA_DEPENDENCY: Test depends on specific data that has changed or doesn't exist.

- ENVIRONMENT_ISSUE: Problems with test environment, not the test or app itself.

- UNKNOWN: Cannot determine root cause from available information.

## Output Format

You MUST respond with a JSON object matching this schema:
{
  "rootCauseCategory": "<one of the categories above>",
  "contributingFactors": ["<additional categories that may contribute>"],
  "confidence": <number 0-100>,
  "explanation": "<detailed explanation>",
  "selectors": ["<list of all selectors found in the error>"],
  "elements": ["<list of element descriptions mentioned>"],
  "issueLocation": "<TEST_CODE|APP_CODE|BOTH|UNKNOWN>",
  "patterns": {
    "hasTimeout": <boolean>,
    "hasVisibilityIssue": <boolean>,
    "hasNetworkCall": <boolean>,
    "hasStateAssertion": <boolean>,
    "hasDynamicContent": <boolean>,
    "hasResponsiveIssue": <boolean>
  },
  "suggestedApproach": "<one sentence describing the likely fix>"
}`;
    }
    buildUserPrompt(input, context) {
        const frameworkLabel = context.framework === 'webdriverio' ? 'WebDriverIO' : context.framework === 'cypress' ? 'Cypress' : 'unknown';
        const parts = [
            '## Error Analysis Request',
            '',
            '### Test Information',
            `- **Test File:** ${context.testFile}`,
            `- **Test Name:** ${context.testName}`,
            `- **Test framework:** ${frameworkLabel}`,
            context.errorType ? `- **Error Type:** ${context.errorType}` : '',
            context.errorSelector
                ? `- **Failed Selector:** ${context.errorSelector}`
                : '',
            '',
            '### Error Message',
            '```',
            context.errorMessage,
            '```',
        ];
        if (context.stackTrace) {
            parts.push('', '### Stack Trace', '```', context.stackTrace.slice(0, 2000), '```');
        }
        if (context.logs && context.logs.length > 0) {
            const logsText = context.logs.join('\n').slice(0, 3000);
            parts.push('', '### Relevant Logs', '```', logsText, '```');
        }
        if (context.prDiff && context.prDiff.files.length > 0) {
            const changedFiles = context.prDiff.files
                .map((f) => `- ${f.filename} (${f.status})`)
                .join('\n');
            parts.push('', '### Recent Changes (PR Diff)', changedFiles);
        }
        if (input.additionalContext) {
            parts.push('', '### Additional Context', input.additionalContext);
        }
        if (context.screenshots && context.screenshots.length > 0) {
            parts.push('', '### Screenshots', `${context.screenshots.length} screenshot(s) attached. Analyze them for visual cues about the failure.`);
        }
        parts.push('', '## Instructions', 'Analyze the above information and provide your root cause analysis in the required JSON format.', 'Consider all available evidence including error messages, stack traces, logs, and screenshots.', 'Be specific about which selectors are problematic and why.');
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
            if (!parsed.rootCauseCategory || typeof parsed.confidence !== 'number') {
                this.log('Missing required fields in response', 'warning');
                return null;
            }
            const selectors = Array.isArray(parsed.selectors) ? parsed.selectors : [];
            const elements = Array.isArray(parsed.elements) ? parsed.elements : [];
            const contributingFactors = Array.isArray(parsed.contributingFactors)
                ? parsed.contributingFactors
                : [];
            return {
                rootCauseCategory: parsed.rootCauseCategory,
                contributingFactors: contributingFactors,
                confidence: parsed.confidence,
                explanation: parsed.explanation || '',
                selectors,
                elements,
                issueLocation: parsed.issueLocation || 'UNKNOWN',
                patterns: {
                    hasTimeout: !!parsed.patterns?.hasTimeout,
                    hasVisibilityIssue: !!parsed.patterns?.hasVisibilityIssue,
                    hasNetworkCall: !!parsed.patterns?.hasNetworkCall,
                    hasStateAssertion: !!parsed.patterns?.hasStateAssertion,
                    hasDynamicContent: !!parsed.patterns?.hasDynamicContent,
                    hasResponsiveIssue: !!parsed.patterns?.hasResponsiveIssue,
                },
                suggestedApproach: parsed.suggestedApproach || '',
            };
        }
        catch (error) {
            this.log(`Failed to parse response: ${error}`, 'warning');
            return null;
        }
    }
}
exports.AnalysisAgent = AnalysisAgent;
//# sourceMappingURL=analysis-agent.js.map