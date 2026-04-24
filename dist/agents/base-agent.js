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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = exports.DEFAULT_AGENT_CONFIG = void 0;
exports.getFrameworkLabel = getFrameworkLabel;
exports.createAgentContext = createAgentContext;
const core = __importStar(require("@actions/core"));
const constants_1 = require("../config/constants");
function getFrameworkLabel(framework) {
    switch (framework) {
        case 'webdriverio':
            return 'WebDriverIO';
        case 'cypress':
            return 'Cypress';
        default:
            return 'unknown';
    }
}
exports.DEFAULT_AGENT_CONFIG = {
    timeoutMs: constants_1.AGENT_CONFIG.AGENT_TIMEOUT_MS,
    temperature: 0.3,
    maxTokens: constants_1.OPENAI.MAX_COMPLETION_TOKENS,
    verbose: false,
};
class BaseAgent {
    openaiClient;
    config;
    agentName;
    constructor(openaiClient, agentName, config = {}) {
        this.openaiClient = openaiClient;
        this.agentName = agentName;
        this.config = { ...exports.DEFAULT_AGENT_CONFIG, ...config };
    }
    async executeWithTimeout(input, context, previousResponseId) {
        const startTime = Date.now();
        let apiCalls = 0;
        let timeoutId;
        try {
            core.info(`[${this.agentName}] Starting execution...`);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Agent timed out after ${this.config.timeoutMs}ms`));
                }, this.config.timeoutMs);
            });
            const taskPromise = this.runAgentTask(input, context, previousResponseId);
            apiCalls++;
            const { data: result, responseId, tokensUsed } = await Promise.race([taskPromise, timeoutPromise]);
            clearTimeout(timeoutId);
            const executionTimeMs = Date.now() - startTime;
            core.info(`[${this.agentName}] Completed in ${executionTimeMs}ms`);
            if (tokensUsed !== undefined) {
                core.info(`[${this.agentName}] Token usage: ${tokensUsed}`);
            }
            return {
                success: true,
                data: result,
                executionTimeMs,
                apiCalls,
                responseId,
                tokensUsed,
            };
        }
        catch (error) {
            clearTimeout(timeoutId);
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.warning(`[${this.agentName}] Failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                executionTimeMs,
                apiCalls,
            };
        }
    }
    async runAgentTask(input, context, previousResponseId) {
        const baseSystemPrompt = this.getSystemPrompt(context.framework);
        const systemPrompt = context.repoContext
            ? `${baseSystemPrompt}\n\n${context.repoContext}`
            : baseSystemPrompt;
        const userPrompt = this.buildUserPrompt(input, context);
        if (this.config.verbose) {
            core.debug(`[${this.agentName}] System prompt: ${systemPrompt.slice(0, 200)}...`);
            core.debug(`[${this.agentName}] User prompt: ${userPrompt.slice(0, 200)}...`);
        }
        const content = [{ type: 'text', text: userPrompt }];
        if (context.includeScreenshots !== false && context.screenshots && context.screenshots.length > 0) {
            for (const screenshot of context.screenshots) {
                if (screenshot.base64Data) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:image/png;base64,${screenshot.base64Data}`,
                        },
                    });
                }
            }
        }
        const { text, responseId, tokensUsed } = await this.openaiClient.generateWithCustomPrompt({
            systemPrompt,
            userContent: content,
            temperature: this.config.temperature,
            responseAsJson: true,
            previousResponseId,
            model: this.config.model,
            reasoningEffort: this.config.reasoningEffort,
            maxTokens: this.config.maxTokens,
        });
        const parsed = this.parseResponse(text);
        if (!parsed) {
            throw new Error('Failed to parse agent response');
        }
        return { data: parsed, responseId, tokensUsed };
    }
    log(message, level = 'info') {
        const formattedMessage = `[${this.agentName}] ${message}`;
        switch (level) {
            case 'debug':
                if (this.config.verbose) {
                    core.debug(formattedMessage);
                }
                break;
            case 'warning':
                core.warning(formattedMessage);
                break;
            default:
                core.info(formattedMessage);
        }
    }
}
exports.BaseAgent = BaseAgent;
function createAgentContext(params) {
    return {
        errorMessage: params.errorMessage,
        testFile: params.testFile,
        testName: params.testName,
        errorType: params.errorType,
        errorSelector: params.errorSelector,
        stackTrace: params.stackTrace,
        screenshots: params.screenshots,
        logs: params.logs,
        prDiff: params.prDiff,
        productDiff: params.productDiff,
        framework: params.framework,
        repoContext: params.repoContext,
    };
}
//# sourceMappingURL=base-agent.js.map