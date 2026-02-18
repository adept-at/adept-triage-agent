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
exports.SimplifiedRepairAgent = void 0;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const openai_client_1 = require("../openai-client");
const summary_generator_1 = require("../analysis/summary-generator");
const constants_1 = require("../config/constants");
const agents_1 = require("../agents");
class SimplifiedRepairAgent {
    openaiClient;
    sourceFetchContext;
    config;
    orchestrator;
    constructor(openaiClientOrApiKey, sourceFetchContext, config) {
        if (typeof openaiClientOrApiKey === 'string') {
            this.openaiClient = new openai_client_1.OpenAIClient(openaiClientOrApiKey);
        }
        else {
            this.openaiClient = openaiClientOrApiKey;
        }
        this.sourceFetchContext = sourceFetchContext;
        this.config = {
            enableAgenticRepair: constants_1.AGENT_CONFIG.ENABLE_AGENTIC_REPAIR,
            ...config,
        };
        if (this.config.enableAgenticRepair && this.sourceFetchContext) {
            this.orchestrator = (0, agents_1.createOrchestrator)(this.openaiClient, {
                maxIterations: constants_1.AGENT_CONFIG.MAX_AGENT_ITERATIONS,
                totalTimeoutMs: constants_1.AGENT_CONFIG.AGENT_TIMEOUT_MS,
                minConfidence: constants_1.AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE,
                ...this.config.orchestratorConfig,
            }, {
                octokit: this.sourceFetchContext.octokit,
                owner: this.sourceFetchContext.owner,
                repo: this.sourceFetchContext.repo,
                branch: this.sourceFetchContext.branch || 'main',
            });
        }
    }
    async generateFixRecommendation(repairContext, errorData) {
        try {
            core.info('🔧 Generating fix recommendation...');
            if (this.config.enableAgenticRepair && this.orchestrator) {
                core.info('🤖 Attempting agentic repair...');
                const agenticResult = await this.tryAgenticRepair(repairContext, errorData);
                if (agenticResult) {
                    core.info(`✅ Agentic repair succeeded with ${agenticResult.confidence}% confidence`);
                    return agenticResult;
                }
                core.info('🔄 Agentic repair did not produce a fix, falling back to single-shot...');
            }
            return await this.singleShotRepair(repairContext, errorData);
        }
        catch (error) {
            core.warning(`Failed to generate fix recommendation: ${error}`);
            return null;
        }
    }
    async tryAgenticRepair(repairContext, errorData) {
        if (!this.orchestrator) {
            return null;
        }
        try {
            const agentContext = (0, agents_1.createAgentContext)({
                errorMessage: repairContext.errorMessage,
                testFile: repairContext.testFile,
                testName: repairContext.testName,
                errorType: repairContext.errorType,
                errorSelector: repairContext.errorSelector,
                stackTrace: errorData?.stackTrace,
                screenshots: errorData?.screenshots,
                logs: errorData?.logs,
                prDiff: errorData?.prDiff
                    ? {
                        files: errorData.prDiff.files.map((f) => ({
                            filename: f.filename,
                            patch: f.patch,
                            status: f.status,
                        })),
                    }
                    : undefined,
                framework: errorData?.framework,
            });
            const result = await this.orchestrator.orchestrate(agentContext, errorData);
            if (result.success && result.fix) {
                core.info(`🤖 Agentic approach: ${result.approach}, iterations: ${result.iterations}, time: ${result.totalTimeMs}ms`);
                return result.fix;
            }
            core.info(`🤖 Agentic approach failed: ${result.error || 'No fix generated'}`);
            return null;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            core.warning(`Agentic repair error: ${errorMsg}`);
            return null;
        }
    }
    async singleShotRepair(repairContext, errorData) {
        let sourceFileContent = null;
        const cleanFilePath = this.extractFilePath(repairContext.testFile);
        if (this.sourceFetchContext && cleanFilePath) {
            sourceFileContent = await this.fetchSourceFile(cleanFilePath);
            if (sourceFileContent) {
                core.info(`  ✅ Fetched source file: ${cleanFilePath} (${sourceFileContent.length} chars)`);
            }
        }
        const prompt = this.buildPrompt(repairContext, errorData, sourceFileContent, cleanFilePath);
        if (process.env.DEBUG_FIX_RECOMMENDATION) {
            const promptFile = `fix-prompt-${Date.now()}.md`;
            fs.writeFileSync(promptFile, prompt);
            core.info(`  📝 Full prompt saved to ${promptFile}`);
        }
        const recommendation = await this.getRecommendationFromAI(prompt, repairContext, errorData);
        if (!recommendation ||
            recommendation.confidence < constants_1.CONFIDENCE.MIN_FIX_CONFIDENCE) {
            core.info('Cannot generate confident fix recommendation');
            return null;
        }
        const fixRecommendation = {
            confidence: recommendation.confidence,
            summary: this.generateSummary(recommendation, repairContext),
            proposedChanges: (recommendation.changes || []).map((change) => ({
                file: change.file,
                line: change.line || 0,
                oldCode: change.oldCode || '',
                newCode: change.newCode || '',
                justification: change.justification,
            })),
            evidence: recommendation.evidence || [],
            reasoning: recommendation.reasoning || 'Fix based on error pattern analysis',
        };
        core.info(`✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`);
        return fixRecommendation;
    }
    extractFilePath(rawPath) {
        if (!rawPath)
            return null;
        const webpackMatch = rawPath.match(/webpack:\/\/[^/]+\/\.\/(.+)/);
        if (webpackMatch) {
            return webpackMatch[1];
        }
        const fileMatch = rawPath.match(/file:\/\/(.+)/);
        if (fileMatch) {
            return fileMatch[1];
        }
        if (rawPath.startsWith('./')) {
            return rawPath.slice(2);
        }
        if (rawPath.includes('/') && !rawPath.startsWith('http')) {
            return rawPath;
        }
        return null;
    }
    async fetchSourceFile(filePath) {
        if (!this.sourceFetchContext) {
            return null;
        }
        const { octokit, owner, repo, branch = 'main' } = this.sourceFetchContext;
        try {
            core.debug(`Fetching source file: ${owner}/${repo}/${filePath} (branch: ${branch})`);
            const response = await octokit.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: branch,
            });
            if (Array.isArray(response.data) || response.data.type !== 'file') {
                core.debug(`${filePath} is not a file`);
                return null;
            }
            const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
            return content;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            core.debug(`Failed to fetch source file ${filePath}: ${errorMsg}`);
            return null;
        }
    }
    buildPrompt(context, errorData, sourceFileContent, cleanFilePath) {
        let contextInfo = `## Test Failure Context
- **Test File:** ${context.testFile}
- **Test Name:** ${context.testName}
- **Error Type:** ${context.errorType}
- **Error Message:** ${context.errorMessage}
${context.errorSelector ? `- **Failed Selector:** ${context.errorSelector}` : ''}
${context.errorLine ? `- **Error Line:** ${context.errorLine}` : ''}`;
        if (sourceFileContent && cleanFilePath) {
            core.info('  ✅ Including actual source file content in prompt');
            const lines = sourceFileContent.split('\n');
            const errorLine = context.errorLine || 0;
            if (errorLine > 0 && errorLine <= lines.length) {
                const startLine = Math.max(0, errorLine - 20);
                const endLine = Math.min(lines.length, errorLine + 20);
                const relevantLines = lines.slice(startLine, endLine);
                const numberedLines = relevantLines
                    .map((line, i) => {
                    const lineNum = startLine + i + 1;
                    const marker = lineNum === errorLine ? '>>> ' : '    ';
                    return `${marker}${lineNum}: ${line}`;
                })
                    .join('\n');
                contextInfo += `\n\n## Source File: ${cleanFilePath} (lines ${startLine + 1}-${endLine})
\`\`\`javascript
${numberedLines}
\`\`\``;
            }
            else {
                const previewLines = lines.slice(0, 100);
                const numberedLines = previewLines
                    .map((line, i) => `${i + 1}: ${line}`)
                    .join('\n');
                contextInfo += `\n\n## Source File: ${cleanFilePath} (first 100 lines)
\`\`\`javascript
${numberedLines}
${lines.length > 100 ? `\n... (${lines.length - 100} more lines)` : ''}
\`\`\``;
            }
        }
        if (errorData) {
            core.info('\n📋 Adding full context to fix recommendation prompt:');
            if (errorData.stackTrace) {
                core.info('  ✅ Including stack trace');
                contextInfo += `\n\n## Stack Trace\n\`\`\`\n${errorData.stackTrace}\n\`\`\``;
            }
            if (errorData.logs && errorData.logs.length > 0) {
                core.info(`  ✅ Including ${errorData.logs.length} log entries (first 1000 chars)`);
                const logPreview = errorData.logs.join('\n').substring(0, 1000);
                contextInfo += `\n\n## Test Logs\n\`\`\`\n${logPreview}\n\`\`\``;
            }
            if (errorData.screenshots && errorData.screenshots.length > 0) {
                core.info(`  ✅ Including ${errorData.screenshots.length} screenshot(s) metadata`);
                contextInfo += `\n\n## Screenshots\n${errorData.screenshots.length} screenshot(s) available showing the UI state at failure`;
                errorData.screenshots.forEach((screenshot, index) => {
                    contextInfo += `\n- Screenshot ${index + 1}: ${screenshot.name}`;
                    if (screenshot.timestamp) {
                        contextInfo += ` (at ${screenshot.timestamp})`;
                    }
                });
            }
            if (errorData.testArtifactLogs) {
                core.info('  ✅ Including test artifact logs (first 1000 chars)');
                const logsPreview = errorData.testArtifactLogs.substring(0, 1000);
                contextInfo += `\n\n## Test Artifact Logs\n\`\`\`\n${logsPreview}\n\`\`\``;
            }
            if (errorData.prDiff) {
                core.info(`  ✅ Including PR diff (${errorData.prDiff.totalChanges} files changed)`);
                contextInfo += `\n\n## Pull Request Changes\n`;
                contextInfo += `- **Total Files Changed:** ${errorData.prDiff.totalChanges}\n`;
                contextInfo += `- **Lines Added:** ${errorData.prDiff.additions}\n`;
                contextInfo += `- **Lines Deleted:** ${errorData.prDiff.deletions}\n`;
                if (errorData.prDiff.files && errorData.prDiff.files.length > 0) {
                    contextInfo += `\n### Changed Files (Most Relevant):\n`;
                    const relevantFiles = errorData.prDiff.files.slice(0, 10);
                    relevantFiles.forEach((file) => {
                        contextInfo += `\n#### ${file.filename} (${file.status})\n`;
                        contextInfo += `- Changes: +${file.additions || 0}/-${file.deletions || 0} lines\n`;
                        if (file.patch) {
                            const patchPreview = file.patch.substring(0, 500);
                            contextInfo += `\n\`\`\`diff\n${patchPreview}${file.patch.length > 500 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                        }
                    });
                    if (errorData.prDiff.files.length > 10) {
                        contextInfo += `\n... and ${errorData.prDiff.files.length - 10} more files changed\n`;
                    }
                }
            }
        }
        else {
            core.info('⚠️  No ErrorData provided - using minimal context');
        }
        return `You are a test repair expert. Analyze this test failure and provide a fix recommendation.

${contextInfo}

## Your Task
Based on the error type and message, provide a fix recommendation. Focus on the most likely cause and solution.

**CRITICAL FOR AUTO-FIX:** You have been provided with the ACTUAL SOURCE FILE CONTENT above. When specifying "oldCode" in your changes:
- Copy the EXACT code from the source file, including whitespace, quotes, and formatting
- The oldCode must be a verbatim substring that exists in the file
- Do NOT paraphrase or reformat the code
- Include enough context (multiple lines if needed) to make the match unique

**Important:** If PR changes are provided, analyze whether recent code changes may have caused the test failure. Look for:
- Changed selectors or UI components that the test depends on
- Modified API endpoints or data structures
- Changes to the test file itself
- Timing or async behavior changes

## Response Format (JSON)
{
  "confidence": 0-100,
  "reasoning": "explanation of the issue and fix",
  "changes": [
    {
      "file": "path/to/file",
      "line": line_number_if_known,
      "oldCode": "EXACT verbatim code from the file that needs to be replaced",
      "newCode": "suggested fix",
      "justification": "why this fixes the issue"
    }
  ],
  "evidence": ["facts supporting this fix"],
  "rootCause": "brief description of root cause"
}

## Common Patterns to Consider:
- ELEMENT_NOT_FOUND: Selector likely changed or element removed
- TIMEOUT: Element may be loading slowly or conditionally rendered
- ASSERTION_FAILED: Expected value may have changed
- ELEMENT_NOT_VISIBLE: Element may be hidden or overlapped

Respond with JSON only. If you cannot provide a confident fix, set confidence below 50.`;
    }
    async getRecommendationFromAI(prompt, context, fullErrorData) {
        try {
            const clientAny = this.openaiClient;
            if (typeof clientAny.generateWithCustomPrompt === 'function') {
                const frameworkLabel = fullErrorData?.framework === 'webdriverio' ? 'WebDriverIO' : 'Cypress';
                const systemPrompt = `You are a test repair expert. Produce a concrete, review-ready fix plan for a ${frameworkLabel} TEST_ISSUE.

CRITICAL: When providing "oldCode" in your changes, you MUST copy the EXACT code from the source file provided.
The oldCode must be a verbatim match - including whitespace, quotes, semicolons, and formatting.
If you cannot find the exact code to replace, set confidence below 50.

You MUST respond in strict JSON only with this schema:
{
  "confidence": number (0-100),
  "reasoning": string,
  "rootCause": string,
  "evidence": string[],
  "changes": [
    {
      "file": string,
      "line"?: number,
      "oldCode"?: string (MUST be exact verbatim match from source),
      "newCode": string,
      "justification": string
    }
  ]
}`;
                const userParts = [{ type: 'text', text: prompt }];
                if (fullErrorData?.screenshots &&
                    fullErrorData.screenshots.length > 0) {
                    for (const s of fullErrorData.screenshots) {
                        if (s.base64Data) {
                            userParts.push({
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${s.base64Data}`,
                                    detail: 'high',
                                },
                            });
                            userParts.push({
                                type: 'text',
                                text: `Screenshot: ${s.name}${s.timestamp ? ` (at ${s.timestamp})` : ''}`,
                            });
                        }
                    }
                }
                const content = await clientAny.generateWithCustomPrompt({
                    systemPrompt,
                    userContent: userParts,
                    responseAsJson: true,
                    temperature: 0.3,
                });
                try {
                    const recommendation = JSON.parse(content);
                    return recommendation;
                }
                catch (parseErr) {
                    core.warning(`Repair JSON parse failed, falling back to heuristic extraction: ${parseErr}`);
                    return {
                        confidence: 60,
                        reasoning: content,
                        changes: this.extractChangesFromText(content, context),
                        evidence: [],
                        rootCause: 'Derived from repair response text',
                    };
                }
            }
            const errorData = fullErrorData || {
                message: prompt,
                framework: 'cypress',
                testName: context.testName,
                fileName: context.testFile,
            };
            const triageLike = await clientAny.analyze(errorData, []);
            try {
                const recommendation = JSON.parse(triageLike.reasoning);
                return recommendation;
            }
            catch {
                return {
                    confidence: 60,
                    reasoning: triageLike.reasoning,
                    changes: this.extractChangesFromText(triageLike.reasoning, context),
                    evidence: triageLike.indicators || [],
                    rootCause: 'Error pattern suggests test needs update',
                };
            }
        }
        catch (error) {
            core.warning(`AI analysis failed: ${error}`);
            return null;
        }
    }
    extractChangesFromText(_text, context) {
        const changes = [];
        if (context.errorSelector && context.errorType === 'ELEMENT_NOT_FOUND') {
            changes.push({
                file: context.testFile,
                line: context.errorLine || 0,
                oldCode: context.errorSelector,
                newCode: '// TODO: Update selector to match current application',
                justification: 'Selector not found - needs to be updated to match current DOM',
            });
        }
        if (context.errorType === 'TIMEOUT') {
            changes.push({
                file: context.testFile,
                line: context.errorLine || 0,
                oldCode: '// Timeout occurred here',
                newCode: 'cy.wait(1000); // Consider adding explicit wait or retry logic',
                justification: 'Adding wait time to handle slow-loading elements',
            });
        }
        return changes;
    }
    generateSummary(recommendation, context) {
        return (0, summary_generator_1.generateFixSummary)(recommendation, context, false);
    }
}
exports.SimplifiedRepairAgent = SimplifiedRepairAgent;
//# sourceMappingURL=simplified-repair-agent.js.map