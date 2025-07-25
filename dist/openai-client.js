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
        const modelOverride = process.env.OPENAI_MODEL_OVERRIDE;
        const useO1Model = modelOverride === 'o1-preview' || modelOverride === 'o1-mini';
        let model;
        if (useO1Model && (!errorData.screenshots || errorData.screenshots.length === 0)) {
            model = modelOverride;
            core.info(`🧠 Using ${model} reasoning model (no vision support)`);
        }
        else if (errorData.screenshots && errorData.screenshots.length > 0) {
            model = 'gpt-4.1';
            if (useO1Model) {
                core.warning('o1 models do not support vision. Falling back to GPT-4.1 for screenshot analysis.');
            }
        }
        else {
            model = modelOverride || 'gpt-4';
        }
        const messages = useO1Model
            ? this.buildMessagesForO1(errorData, examples)
            : this.buildMessages(errorData, examples);
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
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                core.info(`Analyzing with ${model} (attempt ${attempt}/${this.maxRetries})`);
                const requestParams = {
                    model,
                    messages,
                    temperature: 0.3,
                    max_tokens: 1500
                };
                if (!useO1Model) {
                    requestParams.response_format = { type: 'json_object' };
                }
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
                    return this.fallbackToGPT35(errorData, examples);
                }
                await this.delay(this.retryDelay * attempt);
            }
        }
        throw new Error('Failed to get analysis from OpenAI after all retries');
    }
    async fallbackToGPT35(errorData, examples) {
        core.info('Falling back to GPT-3.5-turbo');
        const fallbackErrorData = { ...errorData, screenshots: undefined };
        const messages = this.buildMessages(fallbackErrorData, examples);
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo-0125',
                messages,
                temperature: 0.3,
                max_tokens: 1500,
                response_format: { type: 'json_object' }
            });
            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('Empty response from OpenAI GPT-3.5');
            }
            const result = this.parseResponse(content);
            this.validateResponse(result);
            return result;
        }
        catch (error) {
            throw new Error(`Fallback to GPT-3.5 also failed: ${error}`);
        }
    }
    buildMessages(errorData, examples) {
        const messages = [
            {
                role: 'system',
                content: this.getSystemPrompt(errorData.screenshots && errorData.screenshots.length > 0)
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
    buildMessagesForO1(errorData, examples) {
        const systemPrompt = this.getSystemPrompt(false);
        const userContent = this.buildUserContent(errorData, examples);
        const combinedContent = `${systemPrompt}\n\n${userContent}\n\nIMPORTANT: Respond with a valid JSON object containing verdict, reasoning, and indicators fields.`;
        return [
            {
                role: 'user',
                content: combinedContent
            }
        ];
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
    getSystemPrompt(hasScreenshots = false) {
        const basePrompt = `You are an expert at analyzing test failures and determining whether they are caused by issues in the test code itself (TEST_ISSUE) or actual bugs in the product code (PRODUCT_ISSUE).

Your task is to analyze the complete test execution context including:
- Full error messages and failure details
- Stack traces showing where the error occurred
- Test execution logs showing what happened before the failure
- Console errors or warnings during test execution${hasScreenshots ? '\n- Screenshots showing the state when the test failed' : ''}
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
- Missing or broken functionality`;
        if (hasScreenshots) {
            return basePrompt + `

When analyzing screenshots:
- PRIORITIZE looking for any error messages, alerts, or error dialogs visible in the UI
- Check for error states like "404 Not Found", "500 Internal Server Error", console errors displayed on screen
- Look for missing or broken UI elements that indicate application failures
- Identify loading spinners stuck, blank screens, or partially rendered pages
- Examine if expected UI elements are present but tests are using wrong selectors (TEST_ISSUE)
- Notice any validation errors, form submission failures, or API error responses shown in the UI
- Check if the application failed to load or render properly (PRODUCT_ISSUE)
- Look for visual bugs, layout issues, or incorrect rendering

Screenshots often contain crucial error information that logs might miss. If an error is visible in a screenshot, it should be a key factor in your analysis.

Always respond with a JSON object containing:
- verdict: "TEST_ISSUE" or "PRODUCT_ISSUE"
- reasoning: detailed explanation of your decision including what you observed in the screenshots
- indicators: array of specific indicators that led to your verdict`;
        }
        return basePrompt + `

Always respond with a JSON object containing:
- verdict: "TEST_ISSUE" or "PRODUCT_ISSUE"
- reasoning: detailed explanation of your decision
- indicators: array of specific indicators that led to your verdict`;
    }
    buildPrompt(errorData, examples) {
        let prompt = `You are an expert test failure analyzer. Your task is to determine whether a test failure is a TEST_ISSUE (problem with the test code) or a PRODUCT_ISSUE (bug in the product being tested).

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

Full Logs and Context:
${errorData.logs ? errorData.logs.join('\n\n') : 'No logs available'}

${errorData.screenshots?.length ? `\nScreenshots Available: ${errorData.screenshots.length} screenshot(s) captured` : ''}

Based on ALL the information provided (especially the full logs), determine if this is a TEST_ISSUE or PRODUCT_ISSUE and explain your reasoning. Look carefully through the logs to find the actual error message and stack trace.`;
        return prompt;
    }
    parseResponse(content) {
        try {
            return JSON.parse(content);
        }
        catch (e) {
            core.info('Response is not JSON, attempting to parse structured text');
            const verdictMatch = content.match(/verdict[:\s]*["']?(TEST_ISSUE|PRODUCT_ISSUE)["']?/i);
            const reasoningMatch = content.match(/reasoning[:\s]*["']?([^"'\n]+)["']?/i);
            const indicatorsMatch = content.match(/indicators[:\s]*\[([^\]]+)\]/i);
            if (verdictMatch && reasoningMatch) {
                const verdict = verdictMatch[1];
                const reasoning = reasoningMatch[1].trim();
                const indicators = indicatorsMatch
                    ? indicatorsMatch[1].split(',').map(i => i.trim().replace(/["']/g, ''))
                    : [];
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
        if (!response.verdict || !['TEST_ISSUE', 'PRODUCT_ISSUE'].includes(response.verdict)) {
            throw new Error('Invalid verdict in response');
        }
        if (!response.reasoning || typeof response.reasoning !== 'string') {
            throw new Error('Missing or invalid reasoning in response');
        }
        if (!response.indicators || !Array.isArray(response.indicators)) {
            response.indicators = [];
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.OpenAIClient = OpenAIClient;
//# sourceMappingURL=openai-client.js.map