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
exports.AgentOrchestrator = exports.DEFAULT_ORCHESTRATOR_CONFIG = void 0;
exports.createOrchestrator = createOrchestrator;
const core = __importStar(require("@actions/core"));
const analysis_agent_1 = require("./analysis-agent");
const code_reading_agent_1 = require("./code-reading-agent");
const investigation_agent_1 = require("./investigation-agent");
const fix_generation_agent_1 = require("./fix-generation-agent");
const review_agent_1 = require("./review-agent");
const skill_store_1 = require("../services/skill-store");
const constants_1 = require("../config/constants");
exports.DEFAULT_ORCHESTRATOR_CONFIG = {
    maxIterations: 3,
    totalTimeoutMs: 120000,
    minConfidence: 70,
    requireReview: true,
    fallbackToSingleShot: true,
};
class AgentOrchestrator {
    config;
    analysisAgent;
    codeReadingAgent;
    investigationAgent;
    fixGenerationAgent;
    reviewAgent;
    constructor(openaiClient, config = {}, sourceFetchContext) {
        this.config = { ...exports.DEFAULT_ORCHESTRATOR_CONFIG, ...config };
        this.analysisAgent = new analysis_agent_1.AnalysisAgent(openaiClient);
        this.codeReadingAgent = new code_reading_agent_1.CodeReadingAgent(openaiClient, sourceFetchContext);
        this.investigationAgent = new investigation_agent_1.InvestigationAgent(openaiClient);
        this.fixGenerationAgent = new fix_generation_agent_1.FixGenerationAgent(openaiClient);
        this.reviewAgent = new review_agent_1.ReviewAgent(openaiClient);
    }
    async orchestrate(context, errorData, previousResponseId, skills) {
        const startTime = Date.now();
        const agentResults = {};
        let iterations = 0;
        core.info('🤖 Starting agentic repair pipeline...');
        let timeoutId;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Orchestration timed out after ${this.config.totalTimeoutMs}ms`));
                }, this.config.totalTimeoutMs);
            });
            const pipelinePromise = this.runPipeline(context, errorData, agentResults, previousResponseId, skills);
            const result = await Promise.race([pipelinePromise, timeoutPromise]);
            clearTimeout(timeoutId);
            iterations = result.iterations;
            const totalTimeMs = Date.now() - startTime;
            if (result.fix) {
                core.info(`✅ Agentic repair completed in ${totalTimeMs}ms with ${iterations} iteration(s)`);
                return {
                    success: true,
                    fix: result.fix,
                    totalTimeMs,
                    iterations,
                    approach: 'agentic',
                    lastResponseId: result.lastResponseId,
                    agentResults,
                };
            }
            if (this.config.fallbackToSingleShot) {
                core.warning('Agentic approach failed, falling back to single-shot...');
                return {
                    success: false,
                    error: result.error || 'Agentic approach did not produce a valid fix',
                    totalTimeMs,
                    iterations,
                    approach: 'single-shot',
                    agentResults,
                };
            }
            return {
                success: false,
                error: result.error || 'Agentic approach did not produce a valid fix',
                totalTimeMs,
                iterations,
                approach: 'failed',
                agentResults,
            };
        }
        catch (error) {
            clearTimeout(timeoutId);
            const totalTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.error(`Orchestration failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                totalTimeMs,
                iterations,
                approach: 'failed',
                agentResults,
            };
        }
    }
    async runPipeline(context, _errorData, agentResults, previousResponseId, skills) {
        let iterations = 0;
        let lastResponseId = previousResponseId;
        core.info('📊 Step 1: Running Analysis Agent...');
        if (skills && skills.relevant.length > 0) {
            context.skillsPrompt = (0, skill_store_1.formatSkillsForPrompt)(skills.relevant, 'investigation', skills.flakiness);
        }
        const analysisResult = await this.analysisAgent.execute({}, context, lastResponseId);
        agentResults.analysis = analysisResult;
        lastResponseId = analysisResult.responseId ?? lastResponseId;
        if (!analysisResult.success || !analysisResult.data) {
            return {
                error: `Analysis agent failed: ${analysisResult.error}`,
                iterations,
                lastResponseId,
            };
        }
        const analysis = analysisResult.data;
        core.info(`   Root cause: ${analysis.rootCauseCategory}`);
        core.info(`   Confidence: ${analysis.confidence}%`);
        core.info('📖 Step 2: Running Code Reading Agent...');
        const codeReadingResult = await this.codeReadingAgent.execute({
            testFile: context.testFile,
            errorSelectors: analysis.selectors,
        }, context);
        agentResults.codeReading = codeReadingResult;
        if (codeReadingResult.success && codeReadingResult.data) {
            const rawContent = codeReadingResult.data.testFileContent;
            context.sourceFileContent = addLineNumbers(rawContent);
            context._rawSourceFileContent = rawContent;
            context.relatedFiles = new Map(codeReadingResult.data.relatedFiles.map((f) => [f.path, f.content]));
            core.info(`   Test file: ${rawContent.length} chars`);
            for (const f of codeReadingResult.data.relatedFiles) {
                core.info(`   Related: ${f.path} (${f.content.length} chars) — ${f.relevance}`);
            }
            core.info(`   Fetched ${codeReadingResult.data.relatedFiles.length + 1} files`);
        }
        if (context.productDiff && context.productDiff.files.length > 0) {
            core.info(`📦 Product diff available: ${context.productDiff.files.length} files changed`);
            for (const f of context.productDiff.files.slice(0, 5)) {
                core.info(`   Product: ${f.filename} (${f.status})`);
            }
        }
        else {
            core.info('📦 No product diff available — agents will treat failure as test-side issue');
        }
        if (skills && skills.relevant.length > 0) {
            core.info(`📝 ${skills.relevant.length} skill(s) available from prior runs`);
            if (skills.flakiness?.isFlaky) {
                core.warning(`⚠️ ${skills.flakiness.message}`);
            }
        }
        core.info('🔍 Step 3: Running Investigation Agent...');
        const productDiffSummary = context.productDiff && context.productDiff.files.length > 0
            ? `${context.productDiff.files.length} files changed (${context.productDiff.files.slice(0, 3).map(f => f.filename).join(', ')}${context.productDiff.files.length > 3 ? '...' : ''})`
            : '';
        context.delegationContext = this.buildDelegationContext('investigation', { analysis, productDiffSummary });
        const baseInvestigationSkills = skills
            ? (0, skill_store_1.formatSkillsForPrompt)(skills.relevant, 'investigation', skills.flakiness)
            : '';
        context.skillsPrompt = context.priorInvestigationContext
            ? `### Prior Investigation Findings\n${context.priorInvestigationContext}\n\n${baseInvestigationSkills}`
            : baseInvestigationSkills;
        const chainThreshold = constants_1.AGENT_CONFIG.INVESTIGATION_CHAIN_CONFIDENCE;
        const investigationChainId = analysis.confidence < chainThreshold ? (analysisResult.responseId ?? undefined) : undefined;
        core.info(analysis.confidence < chainThreshold ? `🔗 Chaining analysis context to investigation (confidence < ${chainThreshold}%)` : `📋 Investigation starts fresh (analysis confidence >= ${chainThreshold}%)`);
        const investigationResult = await this.investigationAgent.execute({
            analysis,
            codeContext: codeReadingResult.data,
        }, context, investigationChainId);
        agentResults.investigation = investigationResult;
        lastResponseId = investigationResult.responseId ?? lastResponseId;
        context.includeScreenshots = false;
        if (!investigationResult.success || !investigationResult.data) {
            return {
                error: `Investigation agent failed: ${investigationResult.error}`,
                iterations,
                lastResponseId,
            };
        }
        const investigation = investigationResult.data;
        core.info(`   Findings: ${investigation.findings.length}`);
        core.info(`   Test code fixable: ${investigation.isTestCodeFixable}`);
        core.info(`   Recommended approach: ${investigation.recommendedApproach}`);
        if (investigation.verdictOverride &&
            investigation.verdictOverride.suggestedLocation === 'APP_CODE' &&
            investigation.verdictOverride.confidence >= analysis.confidence) {
            core.warning(`🛑 Investigation override: APP_CODE (${investigation.verdictOverride.confidence}% confidence) > Analysis (${analysis.confidence}%). Aborting repair.`);
            core.info(`   Evidence: ${investigation.verdictOverride.evidence.join('; ')}`);
            return {
                error: 'Investigation verdict override: product-side regression confirmed with higher confidence than initial classification',
                iterations,
                lastResponseId: investigationResult.responseId ?? lastResponseId,
            };
        }
        if (!investigation.isTestCodeFixable && !investigation.verdictOverride) {
            core.warning('🛑 Investigation says not test-code-fixable but no verdict override — aborting conservatively');
            return {
                error: 'Investigation determined issue is not test-code-fixable',
                iterations,
                lastResponseId: investigationResult.responseId ?? lastResponseId,
            };
        }
        context.investigationSummary = [
            investigation.primaryFinding?.description,
            investigation.recommendedApproach,
            investigation.verdictOverride ? `verdictOverride: ${investigation.verdictOverride.suggestedLocation}` : '',
        ].filter(Boolean).join(' | ');
        let lastFix = null;
        let reviewFeedback = null;
        let fixReviewChainId;
        while (iterations < this.config.maxIterations) {
            iterations++;
            core.info(`🔧 Step 4: Running Fix Generation Agent (iteration ${iterations})...`);
            context.delegationContext = this.buildDelegationContext('fix_generation', {
                analysis,
                investigation,
                codeContext: codeReadingResult.data,
                productDiffSummary,
            });
            context.skillsPrompt = skills
                ? (0, skill_store_1.formatSkillsForPrompt)(skills.relevant, 'fix_generation', skills.flakiness)
                : '';
            if (reviewFeedback) {
                core.info(`   📨 Sending previous review feedback to Fix Gen Agent:`);
                for (const line of reviewFeedback.split('\n')) {
                    core.info(`      ${line}`);
                }
            }
            const fixGenResult = await this.fixGenerationAgent.execute({
                analysis,
                investigation,
                previousFeedback: reviewFeedback,
            }, context, fixReviewChainId);
            agentResults.fixGeneration = fixGenResult;
            fixReviewChainId = fixGenResult.responseId ?? fixReviewChainId;
            lastResponseId = fixGenResult.responseId ?? lastResponseId;
            if (!fixGenResult.success || !fixGenResult.data) {
                core.warning(`Fix generation failed on iteration ${iterations}`);
                continue;
            }
            lastFix = fixGenResult.data;
            core.info(`   Confidence: ${lastFix.confidence}%`);
            core.info(`   Changes: ${lastFix.changes.length}`);
            core.info(`   Summary: ${lastFix.summary}`);
            for (let ci = 0; ci < lastFix.changes.length; ci++) {
                const ch = lastFix.changes[ci];
                core.info(`   Change ${ci + 1}: ${ch.file}:${ch.line} (${ch.changeType})`);
                core.info(`   oldCode (${ch.oldCode.split('\n').length} lines): ${ch.oldCode.slice(0, 200)}${ch.oldCode.length > 200 ? '...' : ''}`);
                core.info(`   newCode (${ch.newCode.split('\n').length} lines): ${ch.newCode.slice(0, 200)}${ch.newCode.length > 200 ? '...' : ''}`);
            }
            if (lastFix.confidence < this.config.minConfidence) {
                const feedback = `Confidence too low (${lastFix.confidence}%). Please improve the fix.`;
                core.warning(`Fix confidence (${lastFix.confidence}%) below threshold (${this.config.minConfidence}%)`);
                core.info(`   📝 Feedback to next iteration: ${feedback}`);
                reviewFeedback = feedback;
                continue;
            }
            const rawSource = context._rawSourceFileContent;
            const allSources = new Map();
            if (rawSource && context.testFile) {
                allSources.set(context.testFile, rawSource);
            }
            if (context.relatedFiles) {
                for (const [path, content] of context.relatedFiles) {
                    if (content)
                        allSources.set(path, content);
                }
            }
            if (allSources.size > 0) {
                core.info(`   🔍 Running autoCorrectOldCode against ${allSources.size} source file(s)...`);
                const correctionResult = autoCorrectOldCode(lastFix.changes, allSources, context);
                core.info(`   autoCorrectOldCode result: ${correctionResult.changes.length} valid, ${correctionResult.correctedCount} corrected, ${correctionResult.droppedCount} dropped`);
                if (correctionResult.correctedCount > 0) {
                    core.info(`   🔧 Auto-corrected oldCode for ${correctionResult.correctedCount} change(s)`);
                }
                if (correctionResult.droppedCount > 0) {
                    core.warning(`   ⚠️ Dropped ${correctionResult.droppedCount} change(s) — could not match source`);
                }
                if (correctionResult.correctedCount === 0 && correctionResult.droppedCount === 0) {
                    core.info(`   ✅ All oldCode blocks matched source exactly — no correction needed`);
                }
                lastFix.changes = correctionResult.changes;
                if (lastFix.changes.length === 0) {
                    const feedback = 'All proposed changes had oldCode that could not be matched to the source file. Please copy oldCode EXACTLY from the numbered source lines provided.';
                    core.info(`   📝 Feedback to next iteration: ${feedback}`);
                    reviewFeedback = feedback;
                    continue;
                }
            }
            if (this.config.requireReview) {
                core.info('✅ Step 5: Running Review Agent...');
                context.delegationContext = this.buildDelegationContext('review', {
                    analysis,
                    investigation,
                    productDiffSummary,
                });
                context.skillsPrompt = skills
                    ? (0, skill_store_1.formatSkillsForPrompt)(skills.relevant, 'review', skills.flakiness)
                    : '';
                const reviewResult = await this.reviewAgent.execute({
                    proposedFix: lastFix,
                    analysis,
                    codeContext: codeReadingResult.data,
                }, context, fixReviewChainId);
                agentResults.review = reviewResult;
                fixReviewChainId = reviewResult.responseId ?? fixReviewChainId;
                lastResponseId = reviewResult.responseId ?? lastResponseId;
                if (reviewResult.success && reviewResult.data) {
                    const review = reviewResult.data;
                    core.info(`   Approved: ${review.approved}`);
                    core.info(`   Issues: ${review.issues.length}`);
                    core.info(`   Fix confidence from reviewer: ${review.fixConfidence}%`);
                    core.info(`   Assessment: ${review.assessment}`);
                    for (const issue of review.issues) {
                        core.info(`   [${issue.severity}] Change #${issue.changeIndex}: ${issue.description}${issue.suggestion ? ` → Suggestion: ${issue.suggestion}` : ''}`);
                    }
                    if (review.improvements && review.improvements.length > 0) {
                        core.info(`   Improvements: ${review.improvements.join('; ')}`);
                    }
                    if (review.approved) {
                        core.info(`   ✅ Fix APPROVED by Review Agent on iteration ${iterations}`);
                        return {
                            fix: this.convertToFixRecommendation(lastFix),
                            iterations,
                            lastResponseId,
                        };
                    }
                    else {
                        reviewFeedback = review.issues
                            .map((i) => `[${i.severity}] ${i.description}`)
                            .join('\n');
                        core.warning(`Fix not approved. Issues: ${review.issues.length}`);
                        core.info(`   📝 Feedback to next iteration:\n${reviewFeedback}`);
                    }
                }
            }
            else {
                return {
                    fix: this.convertToFixRecommendation(lastFix),
                    iterations,
                    lastResponseId,
                };
            }
        }
        if (lastFix && lastFix.confidence >= this.config.minConfidence) {
            core.warning(`Max iterations (${this.config.maxIterations}) reached — review never approved. Returning last fix as fallback.`);
            core.info(`   Fallback fix: confidence=${lastFix.confidence}%, changes=${lastFix.changes.length}, summary="${lastFix.summary}"`);
            core.info(`   ⚠️ This fix was NOT approved by the Review Agent — it is being applied because confidence (${lastFix.confidence}%) >= threshold (${this.config.minConfidence}%) and validation will be the final gate.`);
            return {
                fix: this.convertToFixRecommendation(lastFix),
                iterations,
                lastResponseId,
            };
        }
        core.error(`Max iterations (${this.config.maxIterations}) reached without a viable fix (last confidence: ${lastFix?.confidence ?? 'N/A'}%, threshold: ${this.config.minConfidence}%)`);
        return {
            error: `Max iterations (${this.config.maxIterations}) reached without valid fix`,
            iterations,
            lastResponseId,
        };
    }
    buildDelegationContext(stage, priorResults) {
        const lines = [];
        switch (stage) {
            case 'investigation': {
                const a = priorResults.analysis;
                if (!a)
                    break;
                lines.push(`Root cause category: ${a.rootCauseCategory} (${a.confidence}% confidence)`, `Issue location: ${a.issueLocation}`);
                if (a.selectors.length > 0) {
                    lines.push(`Selectors found: ${a.selectors.join(', ')}`);
                }
                if (priorResults.productDiffSummary) {
                    lines.push(`Product diff: ${priorResults.productDiffSummary}`);
                }
                else {
                    lines.push('No product diff available — assume test-side issue.');
                }
                if (a.issueLocation === 'APP_CODE') {
                    lines.push('The analysis flagged APP_CODE as the issue location. Pay special attention to whether this is truly a product regression or if the test can be adapted.');
                }
                break;
            }
            case 'fix_generation': {
                if (priorResults.productDiffSummary) {
                    lines.push(`Product diff: ${priorResults.productDiffSummary}`, 'The product changed intentionally — the fix should ADAPT the test to new behavior, not work around it.');
                }
                const a = priorResults.analysis;
                if (a && a.confidence < 80) {
                    lines.push(`⚠️ Analysis confidence is only ${a.confidence}% — proceed carefully.`);
                }
                break;
            }
            case 'review': {
                if (priorResults.productDiffSummary) {
                    lines.push(`Product diff is present: ${priorResults.productDiffSummary}`);
                }
                else {
                    lines.push('No product diff — failure is expected to be test-side only.');
                }
                lines.push('Verify that the proposed fix is consistent with the PR diff and does not fabricate changes that the diff does not support.');
                break;
            }
        }
        return lines.length > 0 ? lines.join('\n') : '';
    }
    convertToFixRecommendation(fix) {
        return {
            confidence: fix.confidence,
            summary: fix.summary,
            proposedChanges: fix.changes.map((change) => ({
                file: change.file,
                line: change.line,
                oldCode: change.oldCode,
                newCode: change.newCode,
                justification: change.justification,
            })),
            evidence: fix.evidence,
            reasoning: fix.reasoning,
        };
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
function addLineNumbers(source) {
    if (!source)
        return source;
    const lines = source.split('\n');
    return lines.map((line, i) => `${String(i + 1).padStart(4)}: ${line}`).join('\n');
}
function autoCorrectOldCode(changes, sourceFiles, _context) {
    const validChanges = [];
    let correctedCount = 0;
    let droppedCount = 0;
    for (const change of changes) {
        if (!change.oldCode) {
            validChanges.push(change);
            continue;
        }
        let rawSource;
        for (const [path, content] of sourceFiles) {
            if (change.file.endsWith(path) || path.endsWith(change.file) || change.file.includes(path) || path.includes(change.file)) {
                rawSource = content;
                break;
            }
        }
        if (!rawSource) {
            const changeBasename = change.file.split('/').pop() || '';
            for (const [path, content] of sourceFiles) {
                if (path.split('/').pop() === changeBasename) {
                    rawSource = content;
                    break;
                }
            }
        }
        if (!rawSource) {
            for (const [, content] of sourceFiles) {
                if (content.includes(change.oldCode)) {
                    rawSource = content;
                    break;
                }
            }
        }
        if (!rawSource) {
            core.warning(`   ⚠️ No source file found for ${change.file} — keeping change as-is`);
            validChanges.push(change);
            continue;
        }
        const sourceLines = rawSource.split('\n');
        if (rawSource.includes(change.oldCode)) {
            const firstIdx = rawSource.indexOf(change.oldCode);
            const secondIdx = rawSource.indexOf(change.oldCode, firstIdx + 1);
            if (secondIdx === -1) {
                validChanges.push(change);
                continue;
            }
        }
        core.info(`   🔍 oldCode not found verbatim, attempting auto-correction for ${change.file}:${change.line}`);
        const strippedOldCode = change.oldCode
            .split('\n')
            .map((line) => line.replace(/^\s*\d+:\s?/, ''))
            .join('\n');
        if (strippedOldCode !== change.oldCode && rawSource.includes(strippedOldCode)) {
            const firstIdx = rawSource.indexOf(strippedOldCode);
            const secondIdx = rawSource.indexOf(strippedOldCode, firstIdx + 1);
            if (secondIdx === -1) {
                core.info(`   ✅ Corrected by stripping line number prefixes`);
                change.oldCode = strippedOldCode;
                validChanges.push(change);
                correctedCount++;
                continue;
            }
        }
        const normalizedOld = normalizeWhitespace(change.oldCode);
        const normalizedSource = normalizeWhitespace(rawSource);
        const normIdx = normalizedSource.indexOf(normalizedOld);
        if (normIdx !== -1) {
            const extracted = extractMatchingRegion(rawSource, change.oldCode);
            if (extracted) {
                core.info(`   ✅ Corrected via whitespace-normalized matching`);
                change.oldCode = extracted;
                validChanges.push(change);
                correctedCount++;
                continue;
            }
        }
        if (change.line > 0) {
            const oldCodeLineCount = change.oldCode.split('\n').length;
            const startLine = Math.max(0, change.line - 3);
            const endLine = Math.min(sourceLines.length, change.line + oldCodeLineCount + 2);
            const regionLines = sourceLines.slice(startLine, endLine);
            const region = regionLines.join('\n');
            const keySignatures = extractKeySignatures(change.oldCode);
            if (keySignatures.length > 0) {
                const matchedRegion = findRegionBySignatures(sourceLines, keySignatures, change.line, oldCodeLineCount);
                if (matchedRegion) {
                    const secondIdx = rawSource.indexOf(matchedRegion, rawSource.indexOf(matchedRegion) + 1);
                    if (secondIdx === -1) {
                        core.info(`   ✅ Corrected via line-range + signature matching (around line ${change.line})`);
                        change.oldCode = matchedRegion;
                        validChanges.push(change);
                        correctedCount++;
                        continue;
                    }
                }
            }
            const keywordsInOld = change.oldCode.match(/\b(?:throw|if|const|return|await|expect|assert)\b.*?[;)}\]]/g) || [];
            const keywordsInRegion = region.match(/\b(?:throw|if|const|return|await|expect|assert)\b.*?[;)}\]]/g) || [];
            const overlap = keywordsInOld.filter((kw) => keywordsInRegion.some((rk) => normalizeWhitespace(rk).includes(normalizeWhitespace(kw).slice(0, 30))));
            if (overlap.length > 0 && overlap.length >= keywordsInOld.length * 0.5) {
                const secondIdx = rawSource.indexOf(region, rawSource.indexOf(region) + 1);
                if (secondIdx === -1) {
                    core.info(`   ✅ Corrected via line-range extraction (lines ${startLine + 1}-${endLine})`);
                    change.oldCode = region;
                    validChanges.push(change);
                    correctedCount++;
                    continue;
                }
            }
        }
        core.warning(`   ❌ Could not auto-correct oldCode for ${change.file}:${change.line} — dropping change`);
        droppedCount++;
    }
    return { changes: validChanges, correctedCount, droppedCount };
}
function normalizeWhitespace(s) {
    return s.replace(/\s+/g, ' ').trim();
}
function extractMatchingRegion(rawSource, approxOldCode) {
    const sourceLines = rawSource.split('\n');
    const oldLines = approxOldCode.split('\n').map((l) => normalizeWhitespace(l)).filter(Boolean);
    if (oldLines.length === 0)
        return null;
    for (let i = 0; i < sourceLines.length; i++) {
        if (normalizeWhitespace(sourceLines[i]).includes(oldLines[0])) {
            let matched = true;
            for (let j = 1; j < oldLines.length && i + j < sourceLines.length; j++) {
                if (!normalizeWhitespace(sourceLines[i + j]).includes(oldLines[j])) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                const region = sourceLines.slice(i, i + oldLines.length).join('\n');
                if (rawSource.indexOf(region) !== -1) {
                    return region;
                }
            }
        }
    }
    return null;
}
function extractKeySignatures(code) {
    const sigs = [];
    for (const line of code.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length > 15 && /[a-zA-Z]/.test(trimmed)) {
            const sig = trimmed.replace(/\s+/g, ' ');
            sigs.push(sig);
        }
    }
    return sigs;
}
function findRegionBySignatures(sourceLines, signatures, targetLine, expectedLength) {
    const searchStart = Math.max(0, targetLine - 10);
    const searchEnd = Math.min(sourceLines.length, targetLine + expectedLength + 10);
    let bestStart = -1;
    let bestScore = 0;
    for (let i = searchStart; i < searchEnd; i++) {
        let score = 0;
        for (let j = 0; j < signatures.length && i + j < sourceLines.length; j++) {
            const sourceLine = sourceLines[i + j].trim().replace(/\s+/g, ' ');
            const sig = signatures[j];
            const sigTokens = sig.split(/\s+/).filter((t) => t.length > 2);
            const matchedTokens = sigTokens.filter((t) => sourceLine.includes(t));
            if (matchedTokens.length >= sigTokens.length * 0.6) {
                score++;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestStart = i;
        }
    }
    if (bestStart >= 0 && bestScore >= signatures.length * 0.5) {
        return sourceLines.slice(bestStart, bestStart + expectedLength).join('\n');
    }
    return null;
}
function createOrchestrator(openaiClient, config, sourceFetchContext) {
    return new AgentOrchestrator(openaiClient, config, sourceFetchContext);
}
//# sourceMappingURL=agent-orchestrator.js.map