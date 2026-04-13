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
const constants_1 = require("./config/constants");
class OpenAIClient {
    openai;
    maxRetries = constants_1.OPENAI.MAX_RETRIES;
    retryDelay = constants_1.OPENAI.RETRY_DELAY_MS;
    constructor(apiKey) {
        this.openai = new openai_1.default({ apiKey });
    }
    async analyze(errorData, examples, skillContext) {
        const model = constants_1.OPENAI.MODEL;
        core.info(`🧠 Using ${model} model for analysis (Responses API)`);
        const systemPrompt = this.getSystemPrompt();
        const userContent = this.buildUserContent(errorData, examples, skillContext);
        const screenshotCount = errorData.screenshots?.length || 0;
        if (screenshotCount > 0) {
            core.info(`📸 Sending multimodal content to ${model}: ${screenshotCount} screenshot(s)`);
        }
        else {
            core.info(`📝 Sending text-only content to ${model}`);
        }
        const safeContent = this.ensureJsonMention(userContent);
        const input = this.convertToResponsesInput(safeContent);
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                core.info(`Analyzing with ${model} (attempt ${attempt}/${this.maxRetries})`);
                const response = await this.openai.responses.create({
                    model,
                    instructions: systemPrompt,
                    input,
                    max_output_tokens: constants_1.OPENAI.MAX_COMPLETION_TOKENS,
                    text: { format: { type: 'json_object' } },
                });
                const content = response.output_text;
                if (!content) {
                    throw new Error('Empty response from OpenAI');
                }
                const result = this.parseResponse(content);
                this.validateResponse(result);
                return { ...result, responseId: response.id };
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
    convertToResponsesInput(userContent) {
        if (typeof userContent === 'string') {
            return [{ role: 'user', content: userContent }];
        }
        const convertedParts = userContent.map((part) => {
            if (part.type === 'text') {
                return { type: 'input_text', text: part.text };
            }
            if (part.type === 'image_url') {
                const imageUrl = part.image_url;
                return {
                    type: 'input_image',
                    image_url: typeof imageUrl === 'string' ? imageUrl : imageUrl.url,
                    detail: (typeof imageUrl === 'string' ? 'auto' : (imageUrl.detail || 'auto')),
                };
            }
            return part;
        });
        return [{ role: 'user', content: convertedParts }];
    }
    buildUserContent(errorData, examples, skillContext) {
        if (errorData.screenshots && errorData.screenshots.length > 0) {
            const content = [];
            content.push({
                type: 'text',
                text: this.buildPrompt(errorData, examples, skillContext)
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
        return this.buildPrompt(errorData, examples, skillContext);
    }
    getSystemPrompt() {
        const basePrompt = `You are an expert at analyzing test failures and determining whether they are caused by issues in the test code itself (TEST_ISSUE), actual bugs in the product code (PRODUCT_ISSUE), or external execution/provider failures where the evidence is insufficient to blame either side (INCONCLUSIVE).

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
- Elements covered by overlays, tabs, modals, or other UI components
- Elements that exist but are not visible or accessible
- Viewport-specific rendering differences (mobile vs desktop)
- Long timeouts (>10s) that still fail, suggesting element state issues rather than missing functionality
- Tests checking visibility when elements may be legitimately obscured or conditionally rendered

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
- Login page or authentication flow completely failing to render (not just a slow load — the page content is wrong or missing)
- API endpoint misconfiguration causing all network requests to fail
- Environment/deployment issues where the app is deployed but non-functional (wrong API URL, missing env vars, broken build)

INCONCLUSIVE indicators:
- Sauce Labs / Selenium / WebDriver session termination
- Errors like "session is finished", "session has already finished", or "Requested session id ... is not known"
- Remote browser/provider idle timeouts, disconnections, or infrastructure collapse
- The runner loses the browser session before the app or test failure is proven
- Browser renderer crashes (e.g. "Chromium Renderer process just crashed")
- Cypress losing connection to the browser or the runner being force-killed
- Test runner process exiting unexpectedly before the test completed
- Logs show conflicting or incomplete evidence and the safest verdict is to avoid blame

When analyzing screenshots (if provided):
- PRIORITIZE looking for any error messages, alerts, or error dialogs visible in the UI
- Check for error states like "404 Not Found", "500 Internal Server Error", console errors displayed on screen
- Look for missing or broken UI elements that indicate application failures
- Identify loading spinners stuck, blank screens, or partially rendered pages
- Examine if expected UI elements are present but tests are using wrong selectors (TEST_ISSUE)
- Notice any validation errors, form submission failures, or API error responses shown in the UI
- Check if the application failed to load or render properly (PRODUCT_ISSUE)
- Look for visual bugs, layout issues, or incorrect rendering
- IMPORTANT: If the screenshot shows a login page WITHOUT a password field, username field, or login form, the app failed to render — this is a PRODUCT_ISSUE, not a selector problem
- If the screenshot shows an error page, blank page, or unexpected page instead of the expected page, this is a PRODUCT_ISSUE

Screenshots often contain crucial error information that logs might miss. If an error is visible in a screenshot, it should be a key factor in your analysis.

CROSS-BROWSER EVIDENCE (CRITICAL):
When the same test suite runs across multiple browsers in the same CI run:
- If ALL browsers fail with the same error: likely a real PRODUCT_ISSUE or a universal test problem
- If SOME browsers pass and others fail: almost always a TEST_ISSUE (timing, scroll behavior, intersection observer differences between browser engines) or a TRANSIENT issue (API timeout, cache miss that affected one browser's run but not another's). Modern JavaScript behaves identically across browsers — browser-specific product bugs are extremely rare.
- If one browser shows "No data" or empty state while another shows data: this is more likely a transient backend issue (API timeout, slow CDN) than a browser-specific rendering bug. Classify based on whether it reproduces, not on a single occurrence.
- Do NOT classify as PRODUCT_ISSUE solely because one browser fails — check if other browsers in the same run passed first.

COMMON MISCLASSIFICATION PATTERNS TO AVOID:
- Don't classify as TEST_ISSUE just because error happens in test file - check if it's exposing a real product bug
- Don't classify as PRODUCT_ISSUE just because of a timeout - many timeouts are test synchronization issues
- Don't classify as PRODUCT_ISSUE when one browser fails but others pass in the same run — this is almost always test timing or a transient issue
- GraphQL/API errors during tests often indicate real product issues, not test problems
- "Element not found" can be either - check if UI actually rendered correctly in screenshots

IMPORTANT — SHARED PRECONDITION FAILURES:
When tests fail during login, authentication, or other shared setup steps (e.g., "Expected to find element: #password" in a shared commands.js or login helper):
- This is almost NEVER a TEST_ISSUE. The login helper works for every other PR — it's a shared, stable dependency.
- If the login page fails to render its form fields, the APPLICATION is broken, not the test.
- Common root causes: wrong API endpoint configured, broken deployment, missing environment variables, authentication service down.
- If screenshots show a blank page, error page, or page without the login form, this is a PRODUCT_ISSUE.
- If the PR diff contains environment config changes, API URL changes, or build configuration changes, this strongly suggests PRODUCT_ISSUE.
- Only classify login failures as TEST_ISSUE if there is specific evidence that the login test code itself was recently changed and broken.
- When elements with alt text or aria-labels are "not found" but the screenshot shows the UI rendered correctly, the element is likely covered/obscured by overlays, tabs, or modals (TEST_ISSUE)
- Long timeouts (>10s) that still fail often indicate the element exists but isn't in the expected state (covered, not visible, or conditionally rendered) rather than actual missing functionality
- If placeholder content is visible instead of expected content, but no errors are shown, this may be normal application state rather than a bug
- Do not force provider/browser session termination or browser crashes into TEST_ISSUE or PRODUCT_ISSUE when the logs only prove the execution infrastructure failed; use INCONCLUSIVE instead
- Browser renderer crashes ("Chromium Renderer process just crashed"), Cypress runner force-kills, and unexpected test runner exits are infrastructure failures, not test or product defects

When PR changes are provided:
- Analyze if the test failure is related to the changed code
- If a test is failing and it tests functionality that was modified in the PR, determine whether the change was INTENTIONAL or a BUG:
  * PRODUCT_ISSUE (bug): null checks removed, broken logic, missing imports, accidental deletion, regressions — the code is wrong and needs to be fixed
  * TEST_ISSUE (intentional change): the PR deliberately changed rendering behavior, component lifecycle, lazy loading, conditional mounting, layout restructuring, or API contracts — the product is working as designed and the TEST needs to adapt to the new behavior (e.g., scroll to element before asserting, wait for lazy load, use new selectors)
- Signals that a product change is INTENTIONAL (lean TEST_ISSUE): the diff shows a coherent refactor with new logic replacing old logic, new hooks/observers controlling when elements render, performance optimizations that change when/where DOM elements appear, dependency upgrades with corresponding code adaptation
- Signals that a product change is a BUG (lean PRODUCT_ISSUE): removed null checks, deleted code without replacement, broken import paths, type errors, incomplete migrations where some callers weren't updated
- If a test is failing in an area unrelated to the PR changes, it's more likely a TEST_ISSUE or ENVIRONMENT_ISSUE
- Look for correlations between changed files and the failing test file/functionality

CAUSAL CONSISTENCY RULE (CRITICAL):
Your root cause explanation MUST be consistent with the PR diff evidence. Before finalizing your analysis:
1. State your hypothesis about what caused the failure
2. Check: does the diff actually show changes to the code/files your hypothesis requires?
3. If NOT — if your theory requires a change that does NOT appear in the diff — your theory is WRONG. Revise it.
4. If the failure is in code untouched by the PR (e.g., login flow, auth, shared infrastructure), the most likely causes are:
   - Pre-existing flaky test or environment drift (TEST_ISSUE)
   - Environment/infrastructure change outside this PR (TEST_ISSUE or INCONCLUSIVE)
   - Indirect side effect of PR changes (explain the causal chain specifically)
5. NEVER claim "the UI was changed" or "the code was modified" when the diff shows no such change
6. When the diff is unrelated to the failure area, say so explicitly in your reasoning

When determining a PRODUCT_ISSUE and PR changes are available:
- IMPORTANT: Identify specific files and line numbers from the PR diff that likely contain the bug
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
- verdict: "TEST_ISSUE", "PRODUCT_ISSUE", or "INCONCLUSIVE"
- reasoning: detailed explanation of your decision including what you observed in the screenshots (if any) and how PR changes influenced your decision (if applicable)
- indicators: array of specific indicators that led to your verdict
- suggestedSourceLocations: (ONLY for PRODUCT_ISSUE) array of objects with {file: "path/to/file", lines: "line range", reason: "why this location is suspicious"}. Return an empty array or omit this field for TEST_ISSUE and INCONCLUSIVE.`;
        return basePrompt;
    }
    buildPrompt(errorData, examples, skillContext) {
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
            if (summary.failureIndicators.hasVisibilityIssue) {
                indicators.push('Visibility/Overlay Issue');
            }
            if (summary.failureIndicators.hasLongTimeout) {
                indicators.push('Long Timeout (>10s)');
            }
            if (summary.failureIndicators.hasAltTextSelector) {
                indicators.push('Alt Text Selector Used');
            }
            if (summary.failureIndicators.hasElementExistenceCheck) {
                indicators.push('Element Existence Check');
            }
            if (summary.failureIndicators.hasViewportContext) {
                indicators.push('Viewport/Responsive Context');
            }
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
        const prompt = `${summaryHeader}Examples to learn from:
${examples.map(ex => `
Error: ${ex.error}
Verdict: ${ex.verdict}
Reasoning: ${ex.reasoning}
`).join('\n')}

Analyze the following test failure:

Error Context:
- Framework: ${errorData.framework || 'unknown'}
- Test Name: ${errorData.testName || 'unknown'}
- File: ${errorData.fileName || 'unknown'}
${errorData.context ? `- Additional Context: ${errorData.context}` : ''}

${errorData.prDiff ? this.formatPRDiffSection(errorData.prDiff) : ''}

${errorData.productDiff ? this.formatProductDiffSection(errorData.productDiff) : ''}

Full Logs and Context:
${this.capLogsForPrompt(errorData.logs)}

${errorData.screenshots?.length ? `\nScreenshots Available: ${errorData.screenshots.length} screenshot(s) captured` : ''}

Based on ALL the information provided (especially the PR changes if available), determine if this is a TEST_ISSUE, PRODUCT_ISSUE, or INCONCLUSIVE and explain your reasoning. Look carefully through the logs to find the actual error message and stack trace.

Respond with your analysis as a JSON object.`;
        if (skillContext) {
            return prompt + `\n\n### Prior Fix Patterns (from skill store)\nThese patterns were learned from previous fixes on similar failures. Consider them as additional evidence but do not let them override the current failure context. Each pattern shows the error, root cause category, fix approach, and confidence.\n${skillContext}`;
        }
        return prompt;
    }
    capLogsForPrompt(logs) {
        if (!logs || logs.length === 0)
            return 'No logs available';
        const joined = logs.join('\n\n');
        const max = constants_1.LOG_LIMITS.PROMPT_MAX_LOG_SIZE;
        if (joined.length <= max)
            return joined;
        core.warning(`Log payload (${joined.length} chars) exceeds PROMPT_MAX_LOG_SIZE (${max}). Truncating to tail.`);
        return (joined.substring(joined.length - max) +
            `\n\n[Logs truncated to last ${max} characters of ${joined.length} total]`);
    }
    formatPRDiffSection(prDiff) {
        let section = `\nPR Changes Analysis:
- Total files changed: ${prDiff.totalChanges}
- Lines added: ${prDiff.additions}
- Lines deleted: ${prDiff.deletions}

Changed Files Summary:
`;
        const maxFiles = constants_1.ARTIFACTS.MAX_PR_DIFF_FILES;
        const maxPatchLines = constants_1.ARTIFACTS.MAX_PATCH_LINES;
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
        section += `\n\nRULE: When analyzing test failures with PR changes:
1. Check if the failing test file or related files were modified in the PR
2. Look for changes that could break existing functionality
3. Consider if new code introduced bugs that tests are correctly catching
4. If test is failing in code areas NOT touched by the PR, it's more likely a TEST_ISSUE
5. NEVER hypothesize that code was "changed" or "updated" if the diff above does not show that change — the diff is the source of truth for what changed

REMINDER: Apply the Causal Consistency Rule from the system instructions — do NOT claim code was changed unless the diff above proves it.

FOR PRODUCT_ISSUES: You MUST analyze the diff patches above to:
- Identify the EXACT file paths and line numbers that likely contain the bug
- Match error symptoms to specific code changes
- Provide actionable source locations developers can investigate
- Example: "The null pointer error likely comes from the removed null check at src/components/UserForm.tsx lines 45-47"`;
        return section;
    }
    formatProductDiffSection(productDiff) {
        const maxFiles = constants_1.ARTIFACTS.MAX_PR_DIFF_FILES;
        const maxPatchLines = constants_1.ARTIFACTS.MAX_PATCH_LINES;
        let section = `\n⚠️ Recent Product Repo Changes (${constants_1.DEFAULT_PRODUCT_REPO}):
- Total files changed: ${productDiff.totalChanges}
- Lines added: ${productDiff.additions}
- Lines deleted: ${productDiff.deletions}

These are the most recent changes to the product codebase. If any of these changes affect selectors, components, layouts, or APIs that the failing test depends on, this is likely a PRODUCT_ISSUE — the test is correctly detecting that the product changed.

Changed Product Files:
`;
        for (const file of productDiff.files.slice(0, maxFiles)) {
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
        if (productDiff.files.length > maxFiles) {
            section += `\n... and ${productDiff.files.length - maxFiles} more files`;
        }
        return section;
    }
    parseResponse(content) {
        try {
            return JSON.parse(content);
        }
        catch (e) {
            core.info('Response is not JSON, attempting to parse structured text');
            const verdictMatch = content.match(/verdict[:\s]*["']?(TEST_ISSUE|PRODUCT_ISSUE|INCONCLUSIVE)["']?/i);
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
            const altMatch = content.match(/(?:verdict|conclusion):\s*(TEST_ISSUE|PRODUCT_ISSUE|INCONCLUSIVE)[\s\S]*?(?:reasoning|explanation):\s*([^\n]+)[\s\S]*?(?:indicators|factors):\s*([^\n]+)/i);
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
        if (!resp.verdict || !['TEST_ISSUE', 'PRODUCT_ISSUE', 'INCONCLUSIVE'].includes(resp.verdict)) {
            throw new Error('Invalid verdict in response');
        }
        if (!resp.reasoning || typeof resp.reasoning !== 'string') {
            throw new Error('Missing or invalid reasoning in response');
        }
        if (!resp.indicators || !Array.isArray(resp.indicators)) {
            resp.indicators = [];
        }
    }
    ensureJsonMention(content) {
        const hasJson = (text) => /json/i.test(text);
        if (typeof content === 'string') {
            return hasJson(content) ? content : content + '\n\nRespond with a JSON object.';
        }
        const alreadyMentions = content.some((part) => part.type === 'text' && hasJson(part.text));
        if (alreadyMentions)
            return content;
        return [...content, { type: 'text', text: 'Respond with a JSON object.' }];
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async generateWithCustomPrompt(params) {
        const model = constants_1.OPENAI.MODEL;
        const userContent = params.responseAsJson
            ? this.ensureJsonMention(params.userContent)
            : params.userContent;
        const input = this.convertToResponsesInput(userContent);
        const response = await this.openai.responses.create({
            model,
            instructions: params.systemPrompt,
            input,
            max_output_tokens: constants_1.OPENAI.MAX_COMPLETION_TOKENS,
            text: params.responseAsJson ? { format: { type: 'json_object' } } : undefined,
            ...(params.previousResponseId ? { previous_response_id: params.previousResponseId } : {}),
        });
        const content = response.output_text;
        if (!content) {
            throw new Error('Empty response from OpenAI');
        }
        return { text: content, responseId: response.id };
    }
}
exports.OpenAIClient = OpenAIClient;
//# sourceMappingURL=openai-client.js.map