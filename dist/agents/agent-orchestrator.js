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
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Orchestration timed out after ${this.config.totalTimeoutMs}ms`));
                }, this.config.totalTimeoutMs);
            });
            const pipelinePromise = this.runPipeline(context, errorData, agentResults);
            const result = await Promise.race([pipelinePromise, timeoutPromise]);
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
            context.sourceFileContent = codeReadingResult.data.testFileContent;
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
function createOrchestrator(openaiClient, config, sourceFetchContext) {
    return new AgentOrchestrator(openaiClient, config, sourceFetchContext);
}
//# sourceMappingURL=agent-orchestrator.js.map