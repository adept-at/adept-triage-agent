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
exports.CursorCloudValidator = void 0;
const core = __importStar(require("@actions/core"));
const constants_1 = require("../config/constants");
const cursor_prompt_builder_1 = require("./cursor-prompt-builder");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
class CursorCloudValidator {
    apiKey;
    baseUrl;
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl || constants_1.CURSOR_CLOUD.API_BASE_URL;
    }
    async validate(params, mode = 'poll', timeoutMs) {
        const agentId = await this.launchAgent(params);
        if (mode === 'async') {
            core.info(`Cursor cloud agent launched in async mode: ${this.agentUrl(agentId)}`);
            return {
                agentId,
                status: 'CREATING',
                testPassed: null,
                summary: 'Cursor cloud agent launched. Results will be available asynchronously.',
                agentUrl: this.agentUrl(agentId),
            };
        }
        const finalStatus = await this.pollForCompletion(agentId, timeoutMs || constants_1.CURSOR_CLOUD.VALIDATION_TIMEOUT_MS);
        return this.buildResult(agentId, finalStatus);
    }
    async launchAgent(params) {
        const prompt = (0, cursor_prompt_builder_1.buildValidationPrompt)(params);
        core.info(`Launching Cursor cloud agent for ${params.repositoryUrl}`);
        core.info(`  Branch: ${params.branch}`);
        core.info(`  Spec: ${params.spec}`);
        const body = {
            prompt: { text: prompt },
            source: {
                repository: params.repositoryUrl,
                ref: params.branch,
            },
            target: {
                autoCreatePr: false,
            },
        };
        const response = await this.request('POST', '/v0/agents', body);
        core.info(`Cursor cloud agent created: ${response.id}`);
        core.info(`  URL: ${this.agentUrl(response.id)}`);
        return response.id;
    }
    async pollForCompletion(agentId, timeoutMs) {
        core.info(`Waiting for Cursor cloud agent ${agentId} to complete...`);
        await sleep(constants_1.CURSOR_CLOUD.INITIAL_DELAY_MS);
        const deadline = Date.now() + timeoutMs;
        let attempts = 0;
        while (Date.now() < deadline && attempts < constants_1.CURSOR_CLOUD.MAX_POLL_ATTEMPTS) {
            attempts++;
            const agent = await this.getAgentStatus(agentId);
            core.info(`  Poll ${attempts}: status=${agent.status} (${Math.round((deadline - Date.now()) / 1000)}s remaining)`);
            if (constants_1.CURSOR_CLOUD.TERMINAL_STATUSES.includes(agent.status)) {
                core.info(`Cursor cloud agent reached terminal status: ${agent.status}`);
                return agent.status;
            }
            await sleep(constants_1.CURSOR_CLOUD.POLL_INTERVAL_MS);
        }
        core.warning(`Cursor cloud agent ${agentId} did not complete within ${timeoutMs}ms`);
        return 'TIMEOUT';
    }
    async buildResult(agentId, finalStatus) {
        const result = {
            agentId,
            status: finalStatus,
            testPassed: null,
            summary: '',
            agentUrl: this.agentUrl(agentId),
        };
        try {
            const agent = await this.getAgentStatus(agentId);
            result.summary = agent.summary || '';
            result.branchName = agent.target?.branchName;
            result.prUrl = agent.target?.prUrl;
        }
        catch (err) {
            core.debug(`Failed to fetch final agent status: ${err}`);
        }
        if (finalStatus === 'FINISHED' || finalStatus === 'ERROR') {
            try {
                const conversation = await this.getConversation(agentId);
                result.conversation = conversation.messages;
                result.testPassed = this.inferTestResult(conversation.messages);
            }
            catch (err) {
                core.debug(`Failed to fetch agent conversation: ${err}`);
            }
            try {
                const artifacts = await this.getArtifacts(agentId);
                result.artifacts = artifacts.artifacts;
            }
            catch (err) {
                core.debug(`Failed to fetch agent artifacts: ${err}`);
            }
        }
        if (!result.summary) {
            result.summary = this.generateFallbackSummary(result);
        }
        return result;
    }
    inferTestResult(messages) {
        const assistantMessages = messages.filter((m) => m.type === 'assistant_message');
        if (assistantMessages.length === 0)
            return null;
        const lastMessage = assistantMessages[assistantMessages.length - 1].text.toLowerCase();
        const passSignals = [
            'test passed',
            'tests passed',
            'all passing',
            'all tests pass',
            'validation passed',
            'successfully passed',
            'test run passed',
            'specs passed',
            'suite passed',
        ];
        const failSignals = [
            'test failed',
            'tests failed',
            'validation failed',
            'test run failed',
            'specs failed',
            'suite failed',
            'failure detected',
            'assertion error',
            'did not pass',
        ];
        const hasPass = passSignals.some((s) => lastMessage.includes(s));
        const hasFail = failSignals.some((s) => lastMessage.includes(s));
        if (hasPass && !hasFail)
            return true;
        if (hasFail && !hasPass)
            return false;
        return null;
    }
    generateFallbackSummary(result) {
        switch (result.status) {
            case 'FINISHED':
                if (result.testPassed === true)
                    return 'Cursor cloud agent: tests passed';
                if (result.testPassed === false)
                    return 'Cursor cloud agent: tests failed';
                return 'Cursor cloud agent finished but test result could not be determined';
            case 'ERROR':
                return 'Cursor cloud agent encountered an error during validation';
            case 'TIMEOUT':
                return 'Cursor cloud agent validation timed out';
            default:
                return `Cursor cloud agent status: ${result.status}`;
        }
    }
    async getAgentStatus(agentId) {
        return this.request('GET', `/v0/agents/${agentId}`);
    }
    async getConversation(agentId) {
        return this.request('GET', `/v0/agents/${agentId}/conversation`);
    }
    async getArtifacts(agentId) {
        return this.request('GET', `/v0/agents/${agentId}/artifacts`);
    }
    agentUrl(agentId) {
        return `https://cursor.com/agents?id=${agentId}`;
    }
    async request(method, path, body) {
        const url = `${this.baseUrl}${path}`;
        const authHeader = `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`;
        const options = {
            method,
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Cursor API ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`);
        }
        return response.json();
    }
}
exports.CursorCloudValidator = CursorCloudValidator;
//# sourceMappingURL=cursor-cloud-validator.js.map