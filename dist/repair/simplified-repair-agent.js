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
exports.summarizeInvestigationForRetry = summarizeInvestigationForRetry;
exports.buildPriorAttemptContext = buildPriorAttemptContext;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const openai_client_1 = require("../openai-client");
const summary_generator_1 = require("../analysis/summary-generator");
const constants_1 = require("../config/constants");
const agents_1 = require("../agents");
const base_agent_1 = require("../agents/base-agent");
const fix_generation_agent_1 = require("../agents/fix-generation-agent");
const skill_store_1 = require("../services/skill-store");
const root_cause_category_1 = require("./root-cause-category");
function summarizeInvestigationForRetry(investigation) {
    if (!investigation)
        return undefined;
    const parts = [];
    const primary = investigation.primaryFinding;
    if (primary) {
        parts.push(`Primary finding: [${primary.severity}] ${primary.description}`);
        if (primary.relationToError) {
            parts.push(`  → Relation to error: ${primary.relationToError}`);
        }
        if (primary.evidence?.length) {
            parts.push(`  → Evidence: ${primary.evidence.slice(0, 3).join('; ')}`);
        }
    }
    if (typeof investigation.isTestCodeFixable === 'boolean') {
        parts.push(`Is test-code fixable: ${investigation.isTestCodeFixable}`);
    }
    if (investigation.recommendedApproach) {
        parts.push(`Recommended approach: ${investigation.recommendedApproach}`);
    }
    if (investigation.verdictOverride) {
        const v = investigation.verdictOverride;
        parts.push(`Verdict override: ${v.suggestedLocation} (${v.confidence}% confidence)`);
        if (v.evidence?.length) {
            parts.push(`  → Evidence: ${v.evidence.slice(0, 3).join('; ')}`);
        }
    }
    if (investigation.selectorsToUpdate?.length) {
        parts.push('Selectors flagged for update:');
        for (const s of investigation.selectorsToUpdate.slice(0, 5)) {
            const replacement = s.suggestedReplacement
                ? ` → suggested: \`${s.suggestedReplacement}\``
                : '';
            parts.push(`  - \`${s.current}\`: ${s.reason}${replacement}`);
        }
    }
    if (investigation.findings?.length) {
        const isPrimary = (f) => {
            if (!primary)
                return false;
            if (f === primary)
                return true;
            return (f.description === primary.description && f.severity === primary.severity);
        };
        const secondary = investigation.findings.filter((f) => !isPrimary(f)).slice(0, 3);
        if (secondary.length > 0) {
            parts.push('Other findings:');
            for (const f of secondary) {
                const rel = f.relationToError ? ` (${f.relationToError})` : '';
                parts.push(`  - [${f.severity}] ${f.description}${rel}`);
            }
        }
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}
function buildPriorAttemptContext(prior, opts = {}) {
    const logBudget = opts.logBudget ?? 8000;
    const prevChanges = prior.previousFix.proposedChanges
        .map((c) => `File: ${c.file}\noldCode:\n\`\`\`\n${c.oldCode}\n\`\`\`\nnewCode:\n\`\`\`\n${c.newCode}\n\`\`\``)
        .join('\n---\n');
    const sections = [
        `\n\n## PREVIOUS FIX ATTEMPT #${prior.iteration} — FAILED VALIDATION`,
        '',
        'The following fix was applied and the test was re-run, but it still failed.',
    ];
    const hasPriorReasoning = prior.priorAgentRootCause ||
        prior.priorAgentInvestigationFindings ||
        prior.previousFix.failureModeTrace ||
        prior.previousFix.reasoning;
    if (hasPriorReasoning) {
        sections.push('', "### Prior iteration's agent reasoning (the chain that produced the failed fix)");
        if (prior.priorAgentRootCause) {
            sections.push(`- **Root cause (from analysis):** ${prior.priorAgentRootCause}`);
        }
        if (prior.priorAgentInvestigationFindings) {
            sections.push(`- **Investigation findings:** ${prior.priorAgentInvestigationFindings}`);
        }
        if (prior.previousFix.reasoning) {
            sections.push(`- **Fix-gen's reasoning:** ${prior.previousFix.reasoning}`);
        }
        if (prior.previousFix.failureModeTrace) {
            const t = prior.previousFix.failureModeTrace;
            sections.push('- **Fix-gen\'s own causal trace (failureModeTrace):**', `  - originalState: ${t.originalState || '(empty)'}`, `  - rootMechanism: ${t.rootMechanism || '(empty)'}`, `  - newStateAfterFix: ${t.newStateAfterFix || '(empty)'}`, `  - whyAssertionPassesNow: ${t.whyAssertionPassesNow || '(empty)'}`);
        }
    }
    sections.push('', '### Previous Fix That Was Tried', prevChanges, '', '### Validation Failure Logs (tail)', '```', prior.validationLogs.slice(0, logBudget), '```', '', '### Instructions for this iteration', 'The prior reasoning chain above led to a fix that did NOT resolve the failure. You MUST try a DIFFERENT approach. Concretely:', '1. Was the root-cause diagnosis wrong? Re-analyze from scratch; do NOT anchor on the prior category.', '2. Was the fix mechanism wrong even if the root cause was right? The fix may have changed the wrong state.', '3. Does the validation failure log reveal a distinct failure signature from the original — i.e., did the fix create a new problem?', 'Do NOT repeat the same fix or minor variants of it.');
    return sections.join('\n');
}
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
    async generateFixRecommendation(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext) {
        try {
            core.info('🔧 Generating fix recommendation...');
            if (this.config.enableAgenticRepair && this.orchestrator) {
                core.info('🤖 Attempting agentic repair...');
                const agenticResult = await this.tryAgenticRepair(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext);
                if (agenticResult) {
                    core.info(`✅ Agentic repair succeeded with ${agenticResult.fix.confidence}% confidence`);
                    return agenticResult;
                }
                core.info('🔄 Agentic repair did not produce a fix, falling back to single-shot...');
            }
            return await this.singleShotRepair(repairContext, errorData, previousAttempt, skills);
        }
        catch (error) {
            core.warning(`Failed to generate fix recommendation: ${error}`);
            return null;
        }
    }
    async tryAgenticRepair(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext) {
        if (!this.orchestrator) {
            return null;
        }
        try {
            let enrichedErrorMessage = repairContext.errorMessage;
            if (previousAttempt) {
                enrichedErrorMessage += buildPriorAttemptContext(previousAttempt);
            }
            const agentContext = (0, agents_1.createAgentContext)({
                errorMessage: enrichedErrorMessage,
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
                productDiff: errorData?.productDiff
                    ? {
                        files: errorData.productDiff.files.map((f) => ({
                            filename: f.filename,
                            patch: f.patch,
                            status: f.status,
                        })),
                    }
                    : undefined,
                framework: errorData?.framework,
            });
            if (priorInvestigationContext) {
                agentContext.priorInvestigationContext = priorInvestigationContext;
            }
            const result = await this.orchestrator.orchestrate(agentContext, errorData, previousResponseId, skills);
            if (result.success && result.fix) {
                core.info(`🤖 Agentic approach: ${result.approach}, iterations: ${result.iterations}, time: ${result.totalTimeMs}ms`);
                for (const change of result.fix.proposedChanges) {
                    const cleaned = this.extractFilePath(change.file);
                    if (cleaned && cleaned !== change.file) {
                        core.info(`  📂 Normalized path: "${change.file}" → "${cleaned}"`);
                        change.file = cleaned;
                    }
                }
                const analysis = result.agentResults.analysis?.data;
                const investigation = result.agentResults.investigation?.data;
                const agentRootCause = analysis?.rootCauseCategory;
                const agentInvestigationFindings = summarizeInvestigationForRetry(investigation);
                return { fix: result.fix, lastResponseId: result.lastResponseId, agentRootCause, agentInvestigationFindings };
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
    async singleShotRepair(repairContext, errorData, previousAttempt, skills) {
        let sourceFileContent = null;
        const cleanFilePath = this.extractFilePath(repairContext.testFile);
        if (this.sourceFetchContext && cleanFilePath) {
            sourceFileContent = await this.fetchSourceFile(cleanFilePath);
            if (sourceFileContent) {
                core.info(`  ✅ Fetched source file: ${cleanFilePath} (${sourceFileContent.length} chars)`);
            }
        }
        const prompt = this.buildPrompt(repairContext, errorData, sourceFileContent, cleanFilePath, previousAttempt, skills);
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
        if (this.sourceFetchContext && recommendation.changes) {
            const fileCache = new Map();
            if (cleanFilePath && sourceFileContent) {
                fileCache.set(cleanFilePath, sourceFileContent);
            }
            const validChanges = [];
            for (const change of recommendation.changes) {
                const changePath = this.extractFilePath(change.file);
                if (changePath && changePath !== change.file) {
                    core.info(`  📂 Normalized path: "${change.file}" → "${changePath}"`);
                    change.file = changePath;
                }
                if (!change.oldCode) {
                    validChanges.push(change);
                    continue;
                }
                if (!changePath) {
                    core.warning(`⚠️ Could not resolve file path for change target "${change.file}" — rejecting change`);
                    continue;
                }
                if (!fileCache.has(changePath)) {
                    fileCache.set(changePath, await this.fetchSourceFile(changePath));
                }
                const fileContent = fileCache.get(changePath);
                if (!fileContent) {
                    core.warning(`⚠️ Could not fetch source for "${changePath}" — rejecting change (cannot verify oldCode)`);
                    continue;
                }
                if (!fileContent.includes(change.oldCode)) {
                    core.warning(`⚠️ oldCode does not exist in ${changePath}: "${change.oldCode.substring(0, 80)}..." — rejecting (hallucinated)`);
                    continue;
                }
                const firstIdx = fileContent.indexOf(change.oldCode);
                const secondIdx = fileContent.indexOf(change.oldCode, firstIdx + 1);
                if (secondIdx !== -1) {
                    core.warning(`⚠️ oldCode matches multiple locations in ${changePath} — rejecting (ambiguous replacement)`);
                    continue;
                }
                validChanges.push(change);
            }
            if (validChanges.length === 0) {
                core.warning('❌ All proposed changes failed source validation — rejecting recommendation');
                return null;
            }
            recommendation.changes = validChanges;
        }
        const fixRecommendation = {
            confidence: recommendation.confidence,
            summary: this.generateSummary(recommendation, repairContext),
            proposedChanges: (recommendation.changes || []).map((change) => ({
                file: this.extractFilePath(change.file) || change.file,
                line: change.line || 0,
                oldCode: change.oldCode || '',
                newCode: change.newCode || '',
                justification: change.justification,
            })),
            evidence: recommendation.evidence || [],
            reasoning: recommendation.reasoning || 'Fix based on error pattern analysis',
        };
        core.info(`✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`);
        const agentRootCause = (0, root_cause_category_1.inferRootCauseCategoryFromText)(`${recommendation.rootCause || ''} ${recommendation.reasoning || ''} ${repairContext.errorMessage || ''}`, repairContext.errorType);
        return { fix: fixRecommendation, agentRootCause };
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
        const ciRunnerMatch = rawPath.match(/\/(?:home\/runner\/work|github\/workspace)\/[^/]+\/[^/]+\/(.+)/);
        if (ciRunnerMatch) {
            return ciRunnerMatch[1];
        }
        if (rawPath.startsWith('/')) {
            const knownPrefixes = [
                'test/', 'tests/', 'spec/', 'specs/',
                'src/', 'lib/', 'cypress/', 'e2e/',
            ];
            for (const prefix of knownPrefixes) {
                const idx = rawPath.indexOf(`/${prefix}`);
                if (idx !== -1) {
                    return rawPath.slice(idx + 1);
                }
            }
        }
        if (rawPath.startsWith('./')) {
            return rawPath.slice(2);
        }
        if (rawPath.includes('/') && !rawPath.startsWith('http')) {
            return rawPath;
        }
        return null;
    }
    findEnclosingFunction(lines, lineIndex) {
        const funcPattern = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))|^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{/;
        let fnStart = lineIndex;
        for (let i = lineIndex; i >= 0; i--) {
            if (funcPattern.test(lines[i])) {
                fnStart = i;
                break;
            }
        }
        let braceDepth = 0;
        let fnEnd = lines.length - 1;
        let foundOpen = false;
        for (let i = fnStart; i < lines.length; i++) {
            for (const ch of lines[i]) {
                if (ch === '{') {
                    braceDepth++;
                    foundOpen = true;
                }
                else if (ch === '}') {
                    braceDepth--;
                }
            }
            if (foundOpen && braceDepth <= 0) {
                fnEnd = i;
                break;
            }
        }
        return { fnStart, fnEnd };
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
    sanitizeForPrompt(input, maxLength = 2000) {
        if (!input)
            return '';
        let sanitized = input
            .replace(/```/g, '\u2032\u2032\u2032')
            .replace(/## SYSTEM:/gi, '## INFO:')
            .replace(/Ignore previous/gi, '[filtered]')
            .replace(/<\/?(?:system|instruction|prompt)[^>]*>/gi, '')
            .replace(/\[INST\]|\[\/INST\]/gi, '')
            .replace(/<<SYS>>|<<\/SYS>>/gi, '');
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength) + '... [truncated]';
        }
        return sanitized;
    }
    buildPrompt(context, errorData, sourceFileContent, cleanFilePath, previousAttempt, skills) {
        let contextInfo = `## Test Failure Context
- **Test File:** ${this.sanitizeForPrompt(context.testFile)}
- **Test Name:** ${this.sanitizeForPrompt(context.testName)}
- **Error Type:** ${this.sanitizeForPrompt(context.errorType)}
- **Error Message:** ${this.sanitizeForPrompt(context.errorMessage, 4000)}
- **Analyzed Repository:** ${this.sanitizeForPrompt(context.repository)}
- **Analyzed Branch:** ${this.sanitizeForPrompt(context.branch)}
- **Analyzed Commit SHA:** ${this.sanitizeForPrompt(context.commitSha)}
${context.errorSelector ? `- **Failed Selector:** ${this.sanitizeForPrompt(context.errorSelector)}` : ''}
${context.errorLine ? `- **Error Line:** ${context.errorLine}` : ''}`;
        contextInfo += `\n- **Product Under Test:** ${constants_1.DEFAULT_PRODUCT_REPO}`;
        if (this.sourceFetchContext) {
            contextInfo += `\n\n## Repair Source Context
- **Test Repository:** ${this.sourceFetchContext.owner}/${this.sourceFetchContext.repo}
- **Source Branch:** ${this.sourceFetchContext.branch}
- **Note:** You may ONLY propose changes to files in the test repository. Product source files (from ${constants_1.DEFAULT_PRODUCT_REPO}) are provided for context only.`;
        }
        if (sourceFileContent && cleanFilePath) {
            core.info('  ✅ Including actual source file content in prompt');
            const lines = sourceFileContent.split('\n');
            const errorLine = context.errorLine || 0;
            if (errorLine > 0 && errorLine <= lines.length) {
                const { fnStart, fnEnd } = this.findEnclosingFunction(lines, errorLine - 1);
                const startLine = Math.max(0, Math.min(fnStart, errorLine - 40));
                const endLine = Math.min(lines.length, Math.max(fnEnd + 1, errorLine + 40));
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
                const previewLines = lines.slice(0, 150);
                const numberedLines = previewLines
                    .map((line, i) => `${i + 1}: ${line}`)
                    .join('\n');
                contextInfo += `\n\n## Source File: ${cleanFilePath} (first 150 lines)
\`\`\`javascript
${numberedLines}
${lines.length > 150 ? `\n... (${lines.length - 150} more lines)` : ''}
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
                core.info(`  ✅ Including test-repo diff (${errorData.prDiff.totalChanges} files changed)`);
                contextInfo += `\n\n## Recent Changes in Test Repo\nThese are changes in the test repository (commit/PR).\n`;
                contextInfo += `- **Total Files Changed:** ${errorData.prDiff.totalChanges}\n`;
                contextInfo += `- **Lines Added:** ${errorData.prDiff.additions}\n`;
                contextInfo += `- **Lines Deleted:** ${errorData.prDiff.deletions}\n`;
                if (errorData.prDiff.files && errorData.prDiff.files.length > 0) {
                    contextInfo += `\n### Changed Files:\n`;
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
            if (errorData.productDiff) {
                core.info(`  ✅ Including product-repo diff (${errorData.productDiff.totalChanges} files changed from ${constants_1.DEFAULT_PRODUCT_REPO})`);
                contextInfo += `\n\n## ⚠️ Recent Product Repo Changes (${constants_1.DEFAULT_PRODUCT_REPO})\nThese are READ-ONLY changes from the product codebase. You MUST review these to determine if a product change caused the failure.\n`;
                contextInfo += `- **Total Files Changed:** ${errorData.productDiff.totalChanges}\n`;
                contextInfo += `- **Lines Added:** ${errorData.productDiff.additions}\n`;
                contextInfo += `- **Lines Deleted:** ${errorData.productDiff.deletions}\n`;
                if (errorData.productDiff.files && errorData.productDiff.files.length > 0) {
                    contextInfo += `\n### Changed Product Files:\n`;
                    const relevantFiles = errorData.productDiff.files.slice(0, 10);
                    relevantFiles.forEach((file) => {
                        contextInfo += `\n#### ${file.filename} (${file.status})\n`;
                        contextInfo += `- Changes: +${file.additions || 0}/-${file.deletions || 0} lines\n`;
                        if (file.patch) {
                            const patchPreview = file.patch.substring(0, 2000);
                            contextInfo += `\n\`\`\`diff\n${patchPreview}${file.patch.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                        }
                    });
                    if (errorData.productDiff.files.length > 10) {
                        contextInfo += `\n... and ${errorData.productDiff.files.length - 10} more files changed\n`;
                    }
                }
            }
        }
        else {
            core.info('⚠️  No ErrorData provided - using minimal context');
        }
        if (skills && skills.relevant.length > 0) {
            const skillsText = (0, skill_store_1.formatSkillsForPrompt)(skills.relevant, 'fix_generation', skills.flakiness);
            contextInfo += `\n\n${skillsText}`;
        }
        else if (skills?.flakiness?.isFlaky) {
            contextInfo += `\n\n⚠️ FLAKINESS SIGNAL: ${skills.flakiness.message}`;
        }
        if (previousAttempt) {
            contextInfo += buildPriorAttemptContext(previousAttempt, { logBudget: 6000 });
        }
        const frameworkPatterns = errorData?.framework === 'cypress'
            ? fix_generation_agent_1.CYPRESS_PATTERNS
            : errorData?.framework === 'webdriverio'
                ? fix_generation_agent_1.WDIO_PATTERNS
                : fix_generation_agent_1.CYPRESS_PATTERNS + fix_generation_agent_1.WDIO_PATTERNS;
        return `You are a test repair expert. Analyze this test failure and provide a fix recommendation.

${contextInfo}

${frameworkPatterns}

## Your Task
Based on the error type and message, provide a fix recommendation. Focus on the most likely cause and solution.

**CRITICAL — ABSOLUTE RULES FOR oldCode:**
1. You MUST copy oldCode **verbatim** from the Source File content provided above — character for character
2. You MUST NOT invent, paraphrase, or reconstruct code from memory
3. If no Source File content was provided above, set confidence below 50 and leave oldCode empty
4. The oldCode will be used for an exact string match (find-and-replace). If it does not appear verbatim in the file, the fix WILL FAIL
5. Include enough surrounding lines (3-5) to make the match unique in the file
6. Preserve all whitespace, quotes, semicolons, variable names, and formatting exactly as shown in the source

**IMPORTANT — COMPLETE FIX SCOPE:**
1. oldCode MUST cover the ENTIRE block of code affected by the fix, from first changed line to last
2. When adding a null/undefined guard (if/else), include ALL downstream lines that use the guarded variable — not just the first usage. Trace the variable through to the last line that reads or calls it.
3. If a variable like \`result\` is checked for null, then every subsequent line that calls \`JSON.parse(result)\`, reads \`result.something\`, or asserts on a value derived from \`result\` MUST be inside the guard.
4. newCode must be a complete, self-contained replacement — the file must be valid after substitution
5. NEVER fix only the first symptom and leave subsequent lines that will still crash. Walk through the code line by line after your proposed \`oldCode\` ends and ask: "will the next line crash too?" If yes, extend oldCode to include it.

**IMPORTANT — ROOT CAUSE TRACING (do NOT just fix the crash site):**
1. When a value is null/undefined/wrong, trace BACKWARD through the code: WHY is it null? What upstream step failed to produce it?
2. Example chain: \`expect(result).toBeTruthy()\` fails → result is undefined → \`sauceGqlHelper\` returned null → the GraphQL mutation never fired → the text was never typed into the editor → \`document.execCommand('insertText')\` silently failed. The ROOT CAUSE is execCommand, not the assertion.
3. Read the ENTIRE function containing the error, not just the crash line. The bug is often 10-30 lines BEFORE the crash.
4. Ask: "If I only add a null guard, will the test still be TESTING anything meaningful, or am I just silencing a real problem?"

**FIX HIERARCHY — prefer root cause fixes over defensive guards:**
1. BEST: Fix the root cause (e.g., replace broken \`execCommand\` with native keyboard actions)
2. GOOD: Fix root cause AND add a defensive guard for flaky infrastructure
3. ACCEPTABLE: Add a defensive guard when the root cause is external/unfixable (e.g., third-party service timing)
4. BAD: Only add a null guard that silences the failure without fixing why the value is null
5. You may propose MULTIPLE changes — one for the root cause and one for the defensive guard. Use separate entries in the "changes" array.

**KNOWN BROWSER AUTOMATION ANTI-PATTERNS (these are likely root causes):**
- \`document.execCommand('insertText'|'selectAll'|'delete')\` — DEPRECATED, silently fails in modern Chrome/Chromium especially with Lexical, ProseMirror, Draft.js, and other frameworks using \`beforeinput\` events. Replace with native WebDriver keyboard actions: \`element.keys('text')\`, \`browser.keys(['Control', 'a'])\`, \`browser.keys(['Backspace'])\`.
- \`element.setValue()\` or \`element.clearValue()\` on contenteditable — often bypasses framework event handlers. Prefer \`element.click()\` then \`browser.keys()\`.
- \`element.innerHTML = ...\` via \`execute()\` — bypasses React/framework state entirely.
- Hardcoded \`browser.pause()\` instead of \`waitUntil()\` — flaky timing.

**Important:** If PR changes are provided, analyze whether recent code changes may have caused the test failure. Look for:
- Changed selectors or UI components that the test depends on
- Modified API endpoints or data structures
- Changes to the test file itself
- Timing or async behavior changes

## Response Format (JSON)
{
  "confidence": 0-100,
  "reasoning": "explanation of the issue AND the causal chain traced backward to root cause",
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
  "rootCause": "the DEEPEST cause in the causal chain, not just the crash site"
}

## Common Patterns to Consider:
- ELEMENT_NOT_FOUND: Selector likely changed or element removed
- TIMEOUT: Element may be loading slowly or conditionally rendered
- ASSERTION_FAILED: Expected value may have changed — but ALSO ask WHY the value is wrong. Trace backward.
- ELEMENT_NOT_VISIBLE: Element may be hidden or overlapped
- NULL/UNDEFINED RESULT: The producing function failed upstream — trace the data flow backward

Respond with JSON only. If you cannot provide a confident fix, set confidence below 50.`;
    }
    async getRecommendationFromAI(prompt, context, fullErrorData) {
        try {
            const frameworkLabel = (0, base_agent_1.getFrameworkLabel)(fullErrorData?.framework);
            const systemPrompt = `You are a test repair expert. Produce a concrete, review-ready fix plan for a ${frameworkLabel} TEST_ISSUE.

ABSOLUTE RULES — VIOLATION MEANS THE FIX WILL FAIL:
1. The "oldCode" field MUST be copied character-for-character from the "Source File" section in the user prompt.
2. You MUST NOT invent, paraphrase, or reconstruct code. Only quote verbatim from the provided source.
3. If no source file content is provided, set confidence below 50 and omit oldCode.
4. oldCode is used for exact string find-and-replace. Any deviation — even whitespace — causes failure.

COMPLETE FIX SCOPE — YOUR FIX MUST COVER ALL AFFECTED LINES:
5. oldCode MUST span from the first affected line to the LAST affected line. Do NOT stop at the first symptom.
6. When adding a null/undefined guard, include ALL downstream lines that depend on the guarded variable.
7. After writing your fix, walk through every line after oldCode ends. If it will still crash, extend.
8. A partial fix is WORSE than no fix — it still crashes but now in a different place.

ROOT CAUSE TRACING — DO NOT JUST FIX THE CRASH SITE:
9. When a value is null/undefined, trace BACKWARD: WHY is it null? What upstream step failed?
10. Read the ENTIRE function, not just the crash line. The bug is often 10-30 lines BEFORE the crash.
11. Example: assertion fails on \`result\` → helper returned null → mutation never fired → text never entered editor → \`document.execCommand\` silently failed. The root cause is execCommand, not the assertion.
12. Ask: "If I only add a null guard, does the test still test anything meaningful?"

FIX HIERARCHY:
13. BEST: Fix the root cause (e.g., replace broken API with working alternative)
14. GOOD: Fix root cause AND add defensive guard for flaky infrastructure
15. ACCEPTABLE: Defensive guard only when root cause is external/unfixable
16. You may propose MULTIPLE changes in the "changes" array.

KNOWN BROWSER ANTI-PATTERNS (likely root causes — replace, don't guard):
- \`document.execCommand('insertText'|'selectAll'|'delete')\` — deprecated, silently fails with Lexical/ProseMirror/Draft.js. Replace with WebDriver \`keys()\` or \`browser.keys(['Control','a'])\`.
- \`element.setValue()\`/\`clearValue()\` on contenteditable — bypasses framework handlers.
- \`element.innerHTML = ...\` via execute() — bypasses React/framework state.

You MUST respond in strict JSON only with this schema:
{
  "confidence": number (0-100),
  "reasoning": string (include causal chain traced to root cause),
  "rootCause": string (the DEEPEST cause, not just the crash site),
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
            const { text: content } = await this.openaiClient.generateWithCustomPrompt({
                systemPrompt,
                userContent: userParts,
                responseAsJson: true,
                temperature: 0.3,
            });
            try {
                return JSON.parse(content);
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