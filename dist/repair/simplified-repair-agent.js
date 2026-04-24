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
const openai_client_1 = require("../openai-client");
const constants_1 = require("../config/constants");
const agents_1 = require("../agents");
const skill_store_1 = require("../services/skill-store");
const RETRY_CAPS = {
    FINDING_DESCRIPTION: 500,
    FINDING_RELATION: 300,
    EVIDENCE_ITEM: 200,
    RECOMMENDED_APPROACH: 500,
    SELECTOR_FIELD: 200,
    FIX_REASONING: 800,
    TRACE_FIELD: 500,
    ROOT_CAUSE: 300,
    CODE_BLOCK: 2000,
};
function summarizeInvestigationForRetry(investigation) {
    if (!investigation)
        return undefined;
    const s = skill_store_1.sanitizeForPrompt;
    const parts = [];
    const primary = investigation.primaryFinding;
    if (primary) {
        parts.push(`Primary finding: [${primary.severity}] ${s(primary.description, RETRY_CAPS.FINDING_DESCRIPTION)}`);
        if (primary.relationToError) {
            parts.push(`  → Relation to error: ${s(primary.relationToError, RETRY_CAPS.FINDING_RELATION)}`);
        }
        if (primary.evidence?.length) {
            const items = primary.evidence
                .slice(0, 3)
                .map((e) => s(e, RETRY_CAPS.EVIDENCE_ITEM));
            parts.push(`  → Evidence: ${items.join('; ')}`);
        }
    }
    if (typeof investigation.isTestCodeFixable === 'boolean') {
        parts.push(`Is test-code fixable: ${investigation.isTestCodeFixable}`);
    }
    if (investigation.recommendedApproach) {
        parts.push(`Recommended approach: ${s(investigation.recommendedApproach, RETRY_CAPS.RECOMMENDED_APPROACH)}`);
    }
    if (investigation.verdictOverride) {
        const v = investigation.verdictOverride;
        parts.push(`Verdict override: ${v.suggestedLocation} (${v.confidence}% confidence)`);
        if (v.evidence?.length) {
            const items = v.evidence
                .slice(0, 3)
                .map((e) => s(e, RETRY_CAPS.EVIDENCE_ITEM));
            parts.push(`  → Evidence: ${items.join('; ')}`);
        }
    }
    if (investigation.selectorsToUpdate?.length) {
        parts.push('Selectors flagged for update:');
        for (const sel of investigation.selectorsToUpdate.slice(0, 5)) {
            const current = s(sel.current, RETRY_CAPS.SELECTOR_FIELD);
            const reason = s(sel.reason, RETRY_CAPS.SELECTOR_FIELD);
            const replacement = sel.suggestedReplacement
                ? ` → suggested: \`${s(sel.suggestedReplacement, RETRY_CAPS.SELECTOR_FIELD)}\``
                : '';
            parts.push(`  - \`${current}\`: ${reason}${replacement}`);
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
                const rel = f.relationToError
                    ? ` (${s(f.relationToError, RETRY_CAPS.FINDING_RELATION)})`
                    : '';
                parts.push(`  - [${f.severity}] ${s(f.description, RETRY_CAPS.FINDING_DESCRIPTION)}${rel}`);
            }
        }
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}
function buildPriorAttemptContext(prior, opts = {}) {
    const logBudget = opts.logBudget ?? 8000;
    const s = skill_store_1.sanitizeForPrompt;
    const prevChanges = prior.previousFix.proposedChanges
        .map((c) => `File: ${s(c.file, 200)}\noldCode:\n\`\`\`\n${s(c.oldCode, RETRY_CAPS.CODE_BLOCK)}\n\`\`\`\nnewCode:\n\`\`\`\n${s(c.newCode, RETRY_CAPS.CODE_BLOCK)}\n\`\`\``)
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
            sections.push(`- **Root cause (from analysis):** ${s(prior.priorAgentRootCause, RETRY_CAPS.ROOT_CAUSE)}`);
        }
        if (prior.priorAgentInvestigationFindings) {
            sections.push(`- **Investigation findings:** ${s(prior.priorAgentInvestigationFindings, 4000)}`);
        }
        if (prior.previousFix.reasoning) {
            sections.push(`- **Fix-gen's reasoning:** ${s(prior.previousFix.reasoning, RETRY_CAPS.FIX_REASONING)}`);
        }
        if (prior.previousFix.failureModeTrace) {
            const t = prior.previousFix.failureModeTrace;
            const traceField = (v) => v ? s(v, RETRY_CAPS.TRACE_FIELD) : '(empty)';
            sections.push('- **Fix-gen\'s own causal trace (failureModeTrace):**', `  - originalState: ${traceField(t.originalState)}`, `  - rootMechanism: ${traceField(t.rootMechanism)}`, `  - newStateAfterFix: ${traceField(t.newStateAfterFix)}`, `  - whyAssertionPassesNow: ${traceField(t.whyAssertionPassesNow)}`);
        }
    }
    sections.push('', '### Previous Fix That Was Tried', prevChanges, '', '### Validation Failure Logs (tail)', '```', s(prior.validationLogs, logBudget), '```', '', '### Instructions for this iteration', 'The prior reasoning chain above led to a fix that did NOT resolve the failure. You MUST try a DIFFERENT approach. Concretely:', '1. Was the root-cause diagnosis wrong? Re-analyze from scratch; do NOT anchor on the prior category.', '2. Was the fix mechanism wrong even if the root cause was right? The fix may have changed the wrong state.', '3. Does the validation failure log reveal a distinct failure signature from the original — i.e., did the fix create a new problem?', 'Do NOT repeat the same fix or minor variants of it.');
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
            ...config,
        };
        if (this.sourceFetchContext) {
            this.orchestrator = (0, agents_1.createOrchestrator)(this.openaiClient, {
                maxIterations: constants_1.AGENT_CONFIG.MAX_AGENT_ITERATIONS,
                totalTimeoutMs: constants_1.AGENT_CONFIG.AGENT_TIMEOUT_MS,
                minConfidence: constants_1.AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE,
                ...this.config.orchestratorConfig,
                modelOverrideFixGen: this.config.modelOverrideFixGen,
                modelOverrideReview: this.config.modelOverrideReview,
            }, {
                octokit: this.sourceFetchContext.octokit,
                owner: this.sourceFetchContext.owner,
                repo: this.sourceFetchContext.repo,
                branch: this.sourceFetchContext.branch || 'main',
            });
        }
    }
    async generateFixRecommendation(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext, repoContext) {
        try {
            core.info('🔧 Generating fix recommendation...');
            if (!this.orchestrator) {
                core.warning('Agentic repair is unavailable because source-fetch context is missing; no fallback repair path will run.');
                return null;
            }
            core.info('🤖 Attempting agentic repair...');
            const agenticResult = await this.tryAgenticRepair(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext, repoContext);
            if (agenticResult) {
                core.info(`✅ Agentic repair succeeded with ${agenticResult.fix.confidence}% confidence`);
                return agenticResult;
            }
            core.warning('🤖 Agentic repair did not produce an approved fix; no weaker fallback repair path will run.');
            return null;
        }
        catch (error) {
            core.warning(`Failed to generate fix recommendation: ${error}`);
            return null;
        }
    }
    async tryAgenticRepair(repairContext, errorData, previousAttempt, previousResponseId, skills, priorInvestigationContext, repoContext) {
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
                repoContext,
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
}
exports.SimplifiedRepairAgent = SimplifiedRepairAgent;
//# sourceMappingURL=simplified-repair-agent.js.map