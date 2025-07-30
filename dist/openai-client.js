"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIClient = void 0;
const openai_1 = __importDefault(require("openai"));
const core = __importStar(require("@actions/core"));
class OpenAIClient {
    openai;
    maxRetries = 3;
    retryDelay = 1000;
    constructor(apiKey) {
        this.openai = new openai_1.default({ apiKey });
    }
    async analyze(errorData, examples) {
        const model = 'gpt-4.1';
        core.info('🧠 Using GPT-4.1 model for analysis');
        const messages = this.buildMessages(errorData, examples);
        if (messages[1] && messages[1].role === 'user') {
            const userMessage = messages[1].content;
            if (typeof userMessage === 'string') {
                if (userMessage.includes('QUICK ANALYSIS SUMMARY')) {
                    core.info('📊 Structured summary header included in prompt!');
                    const summaryStart = userMessage.indexOf('QUICK ANALYSIS SUMMARY');
                    const summarySection = userMessage.substring(summaryStart, summaryStart + 500);
                    core.info(`Summary preview:\n${summarySection}...`);
                }
                else {
                    core.info('⚠️  Structured summary header NOT found in prompt');
                }
            }
        }
        if (errorData.screenshots && errorData.screenshots.length > 0) {
            core.info(`📸 Sending multimodal content to ${model}:`);
            core.info(`  - Text context: ${errorData.logs?.[0]?.length || 0} characters`);
            core.info(`  - Screenshots: ${errorData.screenshots.length} image(s)`);
            errorData.screenshots.forEach((screenshot, idx) => {
                core.info(`    ${idx + 1}. ${screenshot.name} (${screenshot.base64Data ? 'with data' : 'no data'})`);
            });
        }
        else {
            core.info(`📝 Sending text-only content to ${model}`);
        }
        if (errorData.structuredSummary) {
            core.info('📊 ErrorData contains structured summary!');
            core.info(`  - Error Type: ${errorData.structuredSummary.primaryError.type}`);
            core.info(`  - Test File: ${errorData.structuredSummary.testContext.testFile}`);
        }
        else {
            core.info('⚠️  ErrorData does NOT contain structured summary');
        }
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                core.info(`Analyzing with ${model} (attempt ${attempt}/${this.maxRetries})`);
                const requestParams = {
                    model,
                    messages,
                    temperature: 0.3,
                    max_tokens: 32768,
                    response_format: { type: 'json_object' }
                };
                const response = await this.openai.chat.completions.create(requestParams);
                const content = response.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('Empty response from OpenAI');
                }
                const result = this.parseResponse(content);
                this.validateResponse(result);
                return result;
            }
            catch (error) {
                core.warning(`OpenAI API attempt ${attempt} failed: ${error}`);
                if (attempt === this.maxRetries) {
                    throw new Error(`Failed to get analysis from OpenAI after ${this.maxRetries} attempts: ${error}`);
                }
                await this.delay(this.retryDelay * attempt);
            }
        }
        throw new Error('Failed to get analysis from OpenAI after all retries');
    }
    buildMessages(errorData, examples) {
        const messages = [
            {
                role: 'system',
                content: this.getSystemPrompt()
            }
        ];
        const userContent = this.buildUserContent(errorData, examples);
        if (errorData.screenshots && errorData.screenshots.length > 0) {
            messages.push({
                role: 'user',
                content: userContent
            });
        }
        else {
            messages.push({
                role: 'user',
                content: userContent
            });
        }
        return messages;
    }
    buildUserContent(errorData, examples) {
        if (errorData.screenshots && errorData.screenshots.length > 0) {
            const content = [];
            content.push({
                type: 'text',
                text: this.buildPrompt(errorData, examples)
            });
            content.push({
                type: 'text',
                text: `\n📸 IMPORTANT: ${errorData.screenshots.length} screenshot(s) attached. Please carefully analyze each screenshot for:
- Any visible error messages, alerts, or error dialogs
- Application state at the time of failure
- Missing or broken UI elements
- Any visual indicators of what went wrong\n`
            });
            for (const screenshot of errorData.screenshots) {
                if (screenshot.base64Data) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:image/png;base64,${screenshot.base64Data}`,
                            detail: 'high'
                        }
                    });
                    content.push({
                        type: 'text',
                        text: `Screenshot: ${screenshot.name}${screenshot.timestamp ? ` (taken at ${screenshot.timestamp})` : ''}`
                    });
                }
            }
            return content;
        }
        return this.buildPrompt(errorData, examples);
    }
    getSystemPrompt() {
        const basePrompt = `You are an expert at analyzing test failures and determining whether they are caused by issues in the test code itself (TEST_ISSUE) or actual bugs in the product code (PRODUCT_ISSUE).

Your task is to analyze the complete test execution context including:
- Full error messages and failure details
- Stack traces showing where the error occurred
- Test execution logs showing what happened before the failure
- Console errors or warnings during test execution
- Screenshots showing the state when the test failed (if provided)
- Test environment and browser information

Use all available context to make an informed determination.

TEST_ISSUE indicators:
- Timing issues (timeouts, race conditions)
- Test environment setup problems
- Mock/stub configuration errors
- Test data issues
- Flaky test behavior
- Incorrect assertions
- Test framework errors
- Element not found due to incorrect selectors
- Test synchronization issues

PRODUCT_ISSUE indicators:
- Application errors (500, 404, etc.)
- Database/service connection failures
- Missing implementations
- Business logic errors
- Validation failures in product code
- Null reference exceptions in product code
- API contract violations
- UI components not rendering correctly
- Missing or broken functionality

When analyzing screenshots (if provided):
- PRIORITIZE looking for any error messages, alerts, or error dialogs visible in the UI
- Check for error states like "404 Not Found", "500 Internal Server Error", console errors displayed on screen
- Look for missing or broken UI elements that indicate application failures
- Identify loading spinners stuck, blank screens, or partially rendered pages
- Examine if expected UI elements are present but tests are using wrong selectors (TEST_ISSUE)
- Notice any validation errors, form submission failures, or API error responses shown in the UI
- Check if the application failed to load or render properly (PRODUCT_ISSUE)
- Look for visual bugs, layout issues, or incorrect rendering

Screenshots often contain crucial error information that logs might miss. If an error is visible in a screenshot, it should be a key factor in your analysis.

COMMON MISCLASSIFICATION PATTERNS TO AVOID:
- Don't classify as TEST_ISSUE just because error happens in test file - check if it's exposing a real product bug
- Don't classify as PRODUCT_ISSUE just because of a timeout - many timeouts are test synchronization issues
- GraphQL/API errors during tests often indicate real product issues, not test problems
- "Element not found" can be either - check if UI actually rendered correctly in screenshots

When PR changes are provided:
- Analyze if the test failure is related to the changed code
- If a test is failing and it tests functionality that was modified in the PR, lean towards PRODUCT_ISSUE
- If a test is failing in an area unrelated to the PR changes, it's more likely a TEST_ISSUE
- Look for correlations between changed files and the failing test file/functionality
- Consider if the PR introduced breaking changes that the test correctly caught

When determining a PRODUCT_ISSUE and PR changes are available:
- CRITICALLY IMPORTANT: Identify specific files and line numbers from the PR diff that likely contain the bug
- Correlate error stack traces with changed code locations
- Match error messages and symptoms to specific code changes in the diff
- Suggest which modified functions, methods, or components should be investigated
- Look for patterns like:
  * New null checks missing → NullPointerException
  * Changed API calls → Network errors
  * Modified component logic → Rendering issues
  * Updated validation → Form submission failures
- Include these source code locations in your reasoning with specific file paths and line numbers

CONFIDENCE LEVELS:
- HIGH (90-100%): Clear error patterns, obvious indicators, or explicit messages
- MEDIUM (60-89%): Multiple indicators pointing same direction but some ambiguity
- LOW (0-59%): Conflicting indicators or insufficient information

Always respond with a JSON object containing:
- verdict: "TEST_ISSUE" or "PRODUCT_ISSUE"
- reasoning: detailed explanation of your decision including what you observed in the screenshots (if any) and how PR changes influenced your decision (if applicable)
- indicators: array of specific indicators that led to your verdict
- suggestedSourceLocations: (ONLY for PRODUCT_ISSUE) array of objects with {file: "path/to/file", lines: "line range", reason: "why this location is suspicious"}`;
        return basePrompt;
    }
    buildPrompt(errorData, examples) {
        let summaryHeader = '';
        if (errorData.structuredSummary) {
            const summary = errorData.structuredSummary;
            summaryHeader = `## QUICK ANALYSIS SUMMARY

`;
            summaryHeader += `**Error Type:** ${summary.primaryError.type}\n`;
            summaryHeader += `**Error Message:** ${summary.primaryError.message}\n`;
            if (summary.primaryError.location) {
                const loc = summary.primaryError.location;
                summaryHeader += `**Error Location:** ${loc.file}:${loc.line} (${loc.isTestCode ? 'Test Code' : loc.isAppCode ? 'App Code' : 'Other'})\n`;
            }
            summaryHeader += `\n**Test Context:**\n`;
            summaryHeader += `- Test: ${summary.testContext.testName}\n`;
            summaryHeader += `- File: ${summary.testContext.testFile}\n`;
            summaryHeader += `- Framework: ${summary.testContext.framework}\n`;
            if (summary.testContext.browser) {
                summaryHeader += `- Browser: ${summary.testContext.browser}\n`;
            }
            if (summary.testContext.duration) {
                summaryHeader += `- Duration: ${summary.testContext.duration}\n`;
            }
            summaryHeader += `\n**Failure Indicators:**\n`;
            const indicators = [];
            if (summary.failureIndicators.hasNetworkErrors)
                indicators.push('Network Errors');
            if (summary.failureIndicators.hasNullPointerErrors)
                indicators.push('Null Pointer Errors');
            if (summary.failureIndicators.hasTimeoutErrors)
                indicators.push('Timeout Errors');
            if (summary.failureIndicators.hasDOMErrors)
                indicators.push('DOM Errors');
            if (summary.failureIndicators.hasAssertionErrors)
                indicators.push('Assertion Errors');
            summaryHeader += `- Detected: ${indicators.length > 0 ? indicators.join(', ') : 'None'}\n`;
            if (summary.prRelevance) {
                summaryHeader += `\n**PR Impact Analysis:**\n`;
                summaryHeader += `- Test File Modified: ${summary.prRelevance.testFileModified ? 'YES' : 'NO'}\n`;
                summaryHeader += `- Related Source Files Modified: ${summary.prRelevance.relatedSourceFilesModified.length > 0 ? summary.prRelevance.relatedSourceFilesModified.join(', ') : 'None'}\n`;
                summaryHeader += `- Risk Score: ${summary.prRelevance.riskScore.toUpperCase()}\n`;
            }
            summaryHeader += `\n**Key Metrics:**\n`;
            summaryHeader += `- Screenshots Available: ${summary.keyMetrics.hasScreenshots ? 'YES' : 'NO'}\n`;
            if (summary.keyMetrics.lastCommand) {
                summaryHeader += `- Last Cypress Command: ${summary.keyMetrics.lastCommand}\n`;
            }
            summaryHeader += `- Log Size: ${summary.keyMetrics.logSize} characters\n`;
            summaryHeader += `\n---\n\n`;
        }
        const prompt = `${summaryHeader}You are an expert test failure analyzer. Your task is to determine whether a test failure is a TEST_ISSUE (problem with the test code) or a PRODUCT_ISSUE (bug in the product being tested).

IMPORTANT: Carefully analyze the FULL LOGS provided to find the actual error. Look for patterns like:
- TypeError: Cannot read properties of null (reading 'isValid')
- ReferenceError: variable is not defined
- AssertionError: expected X but got Y
- Network errors, timeouts, connection issues
- GraphQL errors or API failures
- Any stack traces or error messages

The error message field may just say "see full context" - you MUST examine the logs section to find the real error.

Guidelines:
- TEST_ISSUE: Flaky tests, timing issues, incorrect selectors, mock/stub problems, test environment issues
- PRODUCT_ISSUE: Actual bugs, crashes, network failures, incorrect behavior, data issues

Examples to learn from:
${examples.map(ex => `
Error: ${ex.error}
Verdict: ${ex.verdict}
Reasoning: ${ex.reasoning}
`).join('\n')}

Now analyze this test failure:

Error Context:
- Framework: ${errorData.framework || 'unknown'}
- Test Name: ${errorData.testName || 'unknown'}
- File: ${errorData.fileName || 'unknown'}
${errorData.context ? `- Additional Context: ${errorData.context}` : ''}

${errorData.prDiff ? this.formatPRDiffSection(errorData.prDiff) : ''}

Full Logs and Context:
${errorData.logs ? errorData.logs.join('\n\n') : 'No logs available'}

${errorData.screenshots?.length ? `\nScreenshots Available: ${errorData.screenshots.length} screenshot(s) captured` : ''}

Based on ALL the information provided (especially the PR changes if available), determine if this is a TEST_ISSUE or PRODUCT_ISSUE and explain your reasoning. Look carefully through the logs to find the actual error message and stack trace.`;
        return prompt;
    }
    formatPRDiffSection(prDiff) {
        let section = `\nPR Changes Analysis:
- Total files changed: ${prDiff.totalChanges}
- Lines added: ${prDiff.additions}
- Lines deleted: ${prDiff.deletions}

Changed Files Summary:
`;
        const maxFiles = 30;
        const maxPatchLines = 20;
        const relevantFiles = prDiff.files.slice(0, maxFiles);
        for (const file of relevantFiles) {
            section += `\n${file.filename} (+${file.additions}/-${file.deletions})`;
            if (file.patch && file.patch.length > 0) {
                const patchLines = file.patch.split('\n');
                if (patchLines.length <= maxPatchLines) {
                    section += '\n```diff\n' + file.patch + '\n```\n';
                }
                else {
                    const addedLines = patchLines.filter(line => line.startsWith('+') && !line.startsWith('+++'));
                    const removedLines = patchLines.filter(line => line.startsWith('-') && !line.startsWith('---'));
                    const contextLines = patchLines.filter(line => line.startsWith('@@'));
                    let condensedPatch = [];
                    if (contextLines.length > 0) {
                        condensedPatch.push(contextLines[0]);
                    }
                    const changedLinesToShow = Math.min(10, addedLines.length + removedLines.length);
                    condensedPatch = condensedPatch.concat(removedLines.slice(0, Math.floor(changedLinesToShow / 2)), addedLines.slice(0, Math.ceil(changedLinesToShow / 2)));
                    if (condensedPatch.length > 0) {
                        section += '\n```diff\n' + condensedPatch.join('\n') + '\n... (patch truncated)\n```\n';
                    }
                }
            }
        }
        if (prDiff.files.length > maxFiles) {
            section += `\n... and ${prDiff.files.length - maxFiles} more files`;
        }
        section += `\n\nCRITICAL: When analyzing test failures with PR changes:
1. Check if the failing test file or related files were modified in the PR
2. Look for changes that could break existing functionality
3. Consider if new code introduced bugs that tests are correctly catching
4. If test is failing in code areas NOT touched by the PR, it's more likely a TEST_ISSUE

FOR PRODUCT_ISSUES: You MUST analyze the diff patches above to:
- Identify the EXACT file paths and line numbers that likely contain the bug
- Match error symptoms to specific code changes
- Provide actionable source locations developers can investigate
- Example: "The null pointer error likely comes from the removed null check at src/components/UserForm.tsx lines 45-47"`;
        return section;
    }
    parseResponse(content) {
        try {
            return JSON.parse(content);
        }
        catch (e) {
            core.info('Response is not JSON, attempting to parse structured text');
            const verdictMatch = content.match(/verdict[:\s]*["']?(TEST_ISSUE|PRODUCT_ISSUE)["']?/i);
            const reasoningMatch = content.match(/reasoning[:\s]*["']?([^"'\n]+)["']?/i);
            const indicatorsMatch = content.match(/indicators[:\s]*(?:\[([^\]]+)\]|([^\n]+))/i);
            if (verdictMatch && reasoningMatch) {
                const verdict = verdictMatch[1];
                const reasoning = reasoningMatch[1].trim();
                let indicators = [];
                if (indicatorsMatch) {
                    const indicatorString = indicatorsMatch[1] || indicatorsMatch[2];
                    indicators = indicatorString.split(',').map(i => i.trim().replace(/["'[\]]/g, ''));
                }
                return {
                    verdict,
                    reasoning,
                    indicators
                };
            }
            const altMatch = content.match(/(?:verdict|conclusion):\s*(TEST_ISSUE|PRODUCT_ISSUE)[\s\S]*?(?:reasoning|explanation):\s*([^\n]+)[\s\S]*?(?:indicators|factors):\s*([^\n]+)/i);
            if (altMatch) {
                return {
                    verdict: altMatch[1],
                    reasoning: altMatch[2].trim(),
                    indicators: altMatch[3].split(/[,;]/).map(i => i.trim()).filter(i => i.length > 0)
                };
            }
            throw new Error('Could not parse response in any expected format');
        }
    }
    validateResponse(response) {
        const resp = response;
        if (!resp.verdict || !['TEST_ISSUE', 'PRODUCT_ISSUE'].includes(resp.verdict)) {
            throw new Error('Invalid verdict in response');
        }
        if (!resp.reasoning || typeof resp.reasoning !== 'string') {
            throw new Error('Missing or invalid reasoning in response');
        }
        if (!resp.indicators || !Array.isArray(resp.indicators)) {
            resp.indicators = [];
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.OpenAIClient = OpenAIClient;
//# sourceMappingURL=openai-client.js.map