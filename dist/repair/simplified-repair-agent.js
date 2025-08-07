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
class SimplifiedRepairAgent {
    openaiClient;
    constructor(openaiApiKey) {
        this.openaiClient = new openai_client_1.OpenAIClient(openaiApiKey);
    }
    async generateFixRecommendation(repairContext, errorData) {
        try {
            core.info('🔧 Generating fix recommendation...');
            const prompt = this.buildPrompt(repairContext, errorData);
            if (process.env.DEBUG_FIX_RECOMMENDATION) {
                const promptFile = `fix-prompt-${Date.now()}.md`;
                fs.writeFileSync(promptFile, prompt);
                core.info(`  📝 Full prompt saved to ${promptFile}`);
            }
            const recommendation = await this.getRecommendationFromAI(prompt, repairContext, errorData);
            if (!recommendation || recommendation.confidence < 50) {
                core.info('Cannot generate confident fix recommendation');
                return null;
            }
            const fixRecommendation = {
                confidence: recommendation.confidence,
                summary: this.generateSummary(recommendation, repairContext),
                proposedChanges: (recommendation.changes || []).map(change => ({
                    file: change.file,
                    line: change.line || 0,
                    oldCode: change.oldCode || '',
                    newCode: change.newCode || '',
                    justification: change.justification
                })),
                evidence: recommendation.evidence || [],
                reasoning: recommendation.reasoning || 'Fix based on error pattern analysis'
            };
            core.info(`✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`);
            return fixRecommendation;
        }
        catch (error) {
            core.warning(`Failed to generate fix recommendation: ${error}`);
            return null;
        }
    }
    buildPrompt(context, errorData) {
        let contextInfo = `## Test Failure Context
- **Test File:** ${context.testFile}
- **Test Name:** ${context.testName}
- **Error Type:** ${context.errorType}
- **Error Message:** ${context.errorMessage}
${context.errorSelector ? `- **Failed Selector:** ${context.errorSelector}` : ''}
${context.errorLine ? `- **Error Line:** ${context.errorLine}` : ''}`;
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
            if (errorData.cypressArtifactLogs) {
                core.info('  ✅ Including Cypress artifact logs (first 1000 chars)');
                const cypressPreview = errorData.cypressArtifactLogs.substring(0, 1000);
                contextInfo += `\n\n## Cypress Logs\n\`\`\`\n${cypressPreview}\n\`\`\``;
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
                    relevantFiles.forEach(file => {
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
      "oldCode": "problematic code if identifiable",
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
                const systemPrompt = `You are a test repair expert. Produce a concrete, review-ready fix plan for a Cypress TEST_ISSUE.

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
      "oldCode"?: string,
      "newCode": string,
      "justification": string
    }
  ]
}`;
                const userParts = [
                    { type: 'text', text: prompt }
                ];
                if (fullErrorData?.screenshots && fullErrorData.screenshots.length > 0) {
                    for (const s of fullErrorData.screenshots) {
                        if (s.base64Data) {
                            userParts.push({
                                type: 'image_url',
                                image_url: { url: `data:image/png;base64,${s.base64Data}`, detail: 'high' }
                            });
                            userParts.push({ type: 'text', text: `Screenshot: ${s.name}${s.timestamp ? ` (at ${s.timestamp})` : ''}` });
                        }
                    }
                }
                const content = await clientAny.generateWithCustomPrompt({
                    systemPrompt,
                    userContent: userParts,
                    responseAsJson: true,
                    temperature: 0.3
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
                        rootCause: 'Derived from repair response text'
                    };
                }
            }
            const errorData = fullErrorData || {
                message: prompt,
                framework: 'cypress',
                testName: context.testName,
                fileName: context.testFile
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
                    rootCause: 'Error pattern suggests test needs update'
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
                justification: 'Selector not found - needs to be updated to match current DOM'
            });
        }
        if (context.errorType === 'TIMEOUT') {
            changes.push({
                file: context.testFile,
                line: context.errorLine || 0,
                oldCode: '// Timeout occurred here',
                newCode: 'cy.wait(1000); // Consider adding explicit wait or retry logic',
                justification: 'Adding wait time to handle slow-loading elements'
            });
        }
        return changes;
    }
    generateSummary(recommendation, context) {
        let summary = `## 🔧 Fix Recommendation for ${context.testName}\n\n`;
        summary += `### Problem Identified\n`;
        summary += `- **Error Type:** ${context.errorType}\n`;
        summary += `- **Root Cause:** ${recommendation.rootCause || 'Test needs update'}\n`;
        if (context.errorSelector) {
            summary += `- **Failed Selector:** \`${context.errorSelector}\`\n`;
        }
        summary += `\n`;
        summary += `### Confidence: ${recommendation.confidence}%\n\n`;
        summary += `### Analysis\n`;
        summary += `${recommendation.reasoning}\n\n`;
        if (recommendation.changes && recommendation.changes.length > 0) {
            summary += `### Recommended Changes\n`;
            recommendation.changes.forEach((change, index) => {
                summary += `\n#### Change ${index + 1}: ${change.file}\n`;
                if (change.line) {
                    summary += `Line ${change.line}\n`;
                }
                summary += `**Justification:** ${change.justification}\n\n`;
                if (change.oldCode) {
                    summary += `**Current Code:**\n`;
                    summary += `\`\`\`typescript\n${change.oldCode}\n\`\`\`\n\n`;
                }
                summary += `**Suggested Fix:**\n`;
                summary += `\`\`\`typescript\n${change.newCode}\n\`\`\`\n\n`;
            });
        }
        if (recommendation.evidence && recommendation.evidence.length > 0) {
            summary += `### Supporting Evidence\n`;
            recommendation.evidence.forEach((item) => {
                summary += `- ${item}\n`;
            });
            summary += `\n`;
        }
        summary += `---\n`;
        summary += `*This is an automated fix recommendation. Please review before applying.*\n`;
        return summary;
    }
}
exports.SimplifiedRepairAgent = SimplifiedRepairAgent;
//# sourceMappingURL=simplified-repair-agent.js.map