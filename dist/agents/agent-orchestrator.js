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
    async orchestrate(context, errorData) {
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
            const pipelinePromise = this.runPipeline(context, errorData, agentResults);
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
    async runPipeline(context, _errorData, agentResults) {
        let iterations = 0;
        core.info('📊 Step 1: Running Analysis Agent...');
        const analysisResult = await this.analysisAgent.execute({}, context);
        agentResults.analysis = analysisResult;
        if (!analysisResult.success || !analysisResult.data) {
            return {
                error: `Analysis agent failed: ${analysisResult.error}`,
                iterations,
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
            core.info(`   Fetched ${codeReadingResult.data.relatedFiles.length + 1} files`);
        }
        core.info('🔍 Step 3: Running Investigation Agent...');
        const investigationResult = await this.investigationAgent.execute({
            analysis,
            codeContext: codeReadingResult.data,
        }, context);
        agentResults.investigation = investigationResult;
        if (!investigationResult.success || !investigationResult.data) {
            return {
                error: `Investigation agent failed: ${investigationResult.error}`,
                iterations,
            };
        }
        const investigation = investigationResult.data;
        core.info(`   Findings: ${investigation.findings.length}`);
        core.info(`   Recommended approach: ${investigation.recommendedApproach}`);
        let lastFix = null;
        let reviewFeedback = null;
        while (iterations < this.config.maxIterations) {
            iterations++;
            core.info(`🔧 Step 4: Running Fix Generation Agent (iteration ${iterations})...`);
            const fixGenResult = await this.fixGenerationAgent.execute({
                analysis,
                investigation,
                previousFeedback: reviewFeedback,
            }, context);
            agentResults.fixGeneration = fixGenResult;
            if (!fixGenResult.success || !fixGenResult.data) {
                core.warning(`Fix generation failed on iteration ${iterations}`);
                continue;
            }
            lastFix = fixGenResult.data;
            core.info(`   Confidence: ${lastFix.confidence}%`);
            core.info(`   Changes: ${lastFix.changes.length}`);
            if (lastFix.confidence < this.config.minConfidence) {
                core.warning(`Fix confidence (${lastFix.confidence}%) below threshold (${this.config.minConfidence}%)`);
                reviewFeedback = `Confidence too low (${lastFix.confidence}%). Please improve the fix.`;
                continue;
            }
            const rawSource = context._rawSourceFileContent;
            if (rawSource) {
                const correctionResult = autoCorrectOldCode(lastFix.changes, rawSource, context);
                if (correctionResult.correctedCount > 0) {
                    core.info(`   🔧 Auto-corrected oldCode for ${correctionResult.correctedCount} change(s)`);
                }
                if (correctionResult.droppedCount > 0) {
                    core.warning(`   ⚠️ Dropped ${correctionResult.droppedCount} change(s) — could not match source`);
                }
                lastFix.changes = correctionResult.changes;
                if (lastFix.changes.length === 0) {
                    reviewFeedback = 'All proposed changes had oldCode that could not be matched to the source file. Please copy oldCode EXACTLY from the numbered source lines provided.';
                    continue;
                }
            }
            if (this.config.requireReview) {
                core.info('✅ Step 5: Running Review Agent...');
                const reviewResult = await this.reviewAgent.execute({
                    proposedFix: lastFix,
                    analysis,
                    codeContext: codeReadingResult.data,
                }, context);
                agentResults.review = reviewResult;
                if (reviewResult.success && reviewResult.data) {
                    const review = reviewResult.data;
                    core.info(`   Approved: ${review.approved}`);
                    core.info(`   Issues: ${review.issues.length}`);
                    if (review.approved) {
                        return {
                            fix: this.convertToFixRecommendation(lastFix),
                            iterations,
                        };
                    }
                    else {
                        reviewFeedback = review.issues
                            .map((i) => `[${i.severity}] ${i.description}`)
                            .join('\n');
                        core.warning(`Fix not approved. Issues: ${review.issues.length}`);
                    }
                }
            }
            else {
                return {
                    fix: this.convertToFixRecommendation(lastFix),
                    iterations,
                };
            }
        }
        if (lastFix && lastFix.confidence >= this.config.minConfidence) {
            core.warning('Max iterations reached, returning best fix');
            return {
                fix: this.convertToFixRecommendation(lastFix),
                iterations,
            };
        }
        return {
            error: `Max iterations (${this.config.maxIterations}) reached without valid fix`,
            iterations,
        };
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
function autoCorrectOldCode(changes, rawSource, _context) {
    const sourceLines = rawSource.split('\n');
    const validChanges = [];
    let correctedCount = 0;
    let droppedCount = 0;
    for (const change of changes) {
        if (!change.oldCode) {
            validChanges.push(change);
            continue;
        }
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