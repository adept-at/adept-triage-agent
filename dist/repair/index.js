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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairAgent = void 0;
const rest_1 = require("@octokit/rest");
const core = __importStar(require("@actions/core"));
const openai_client_1 = require("../openai-client");
const context_fetcher_1 = require("./context-fetcher");
const search_strategy_1 = require("./search-strategy");
const repair_engine_1 = require("./repair-engine");
const validator_1 = require("./validator");
class RepairAgent {
    contextFetcher;
    searchStrategy;
    repairEngine;
    validator;
    openaiClient;
    constructor(config) {
        const testRepoClient = new rest_1.Octokit({
            auth: config.testRepoToken,
        });
        const appRepoClient = new rest_1.Octokit({
            auth: config.appRepoToken,
        });
        this.openaiClient = new openai_client_1.OpenAIClient(config.openaiApiKey);
        this.contextFetcher = new context_fetcher_1.ContextFetcher(testRepoClient, appRepoClient, this.openaiClient, config.testRepo, config.appRepo);
        this.searchStrategy = new search_strategy_1.SearchStrategyGenerator(this.openaiClient, appRepoClient, config.appRepo);
        this.repairEngine = new repair_engine_1.RepairEngine(this.openaiClient, config.minConfidence, config.requireEvidence);
        this.validator = new validator_1.RepairValidator();
    }
    async generateFixRecommendation(repairContext) {
        try {
            core.info('=== Starting Fix Recommendation Generation ===');
            core.info(`Error Type: ${repairContext.errorType}`);
            core.info(`Test File: ${repairContext.testFile}`);
            core.info(`Test Name: ${repairContext.testName}`);
            core.info('\n📊 Step 1: Determining required data...');
            const requirements = await this.contextFetcher.determineRequiredData(repairContext);
            core.info('\n🔍 Step 2: Fetching context...');
            const fullContext = await this.contextFetcher.fetchRequiredContext(requirements, repairContext);
            if (requirements.appSelectors) {
                core.info('\n🔎 Step 3: Generating search strategy...');
                const strategy = await this.searchStrategy.generateSearchQueries(repairContext);
                if (strategy.searchQueries.length > 0) {
                    const selectorMap = await this.searchStrategy.executeSearchStrategy(strategy, repairContext);
                    fullContext.fetched.availableSelectors = selectorMap;
                }
            }
            core.info('\n🔧 Step 4: Analyzing for fix recommendation...');
            const repairResult = await this.repairEngine.attemptRepair(fullContext);
            if (!repairResult.canRepair) {
                core.warning(`Cannot generate fix recommendation: ${repairResult.reason || 'Unknown reason'}`);
                return null;
            }
            core.info('\n✅ Step 5: Validating recommendation...');
            const testFileContent = fullContext.fetched.testFileContent || '';
            const validation = this.validator.validateChanges(repairResult.proposedFix || [], testFileContent);
            if (!validation.valid) {
                core.error('Validation failed:');
                validation.errors.forEach(error => core.error(`  - ${error}`));
                return null;
            }
            if (validation.warnings.length > 0) {
                core.warning('Validation warnings:');
                validation.warnings.forEach(warning => core.warning(`  - ${warning}`));
            }
            core.info('\n📝 Step 6: Generating fix recommendation...');
            const fixSummary = this.generateFixSummary(repairResult, repairContext, fullContext);
            core.info('\n✅ Fix recommendation generated successfully!');
            core.info(`Confidence: ${repairResult.confidence}%`);
            core.info(`Evidence found: ${repairResult.evidence?.length || 0} items`);
            const recommendation = {
                confidence: repairResult.confidence || 0,
                summary: fixSummary,
                proposedChanges: repairResult.proposedFix || [],
                evidence: repairResult.evidence || [],
                reasoning: `Fix generated based on ${fullContext.metadata.sources.join(', ')}`
            };
            return recommendation;
        }
        catch (error) {
            core.error(`Failed to generate fix recommendation: ${error}`);
            return null;
        }
    }
    generateFixSummary(repairResult, repairContext, fullContext) {
        let summary = `## 🔧 Fix Recommendation for ${repairContext.testName}\n\n`;
        summary += `### Problem Identified\n`;
        summary += `- **Error Type:** ${repairContext.errorType}\n`;
        summary += `- **Test File:** ${repairContext.testFile}\n`;
        if (repairContext.errorLine) {
            summary += `- **Error Line:** ${repairContext.errorLine}\n`;
        }
        if (repairContext.errorSelector) {
            summary += `- **Failed Selector:** \`${repairContext.errorSelector}\`\n`;
        }
        summary += `- **Error Message:** ${repairContext.errorMessage.substring(0, 200)}${repairContext.errorMessage.length > 200 ? '...' : ''}\n\n`;
        summary += `### Analysis Confidence: ${repairResult.confidence}%\n\n`;
        if (repairResult.evidence && repairResult.evidence.length > 0) {
            summary += `### Evidence Found\n`;
            repairResult.evidence.forEach((evidence, index) => {
                summary += `${index + 1}. ${evidence}\n`;
            });
            summary += '\n';
        }
        if (repairResult.proposedFix && repairResult.proposedFix.length > 0) {
            summary += `### Recommended Changes\n\n`;
            repairResult.proposedFix.forEach((change, index) => {
                summary += `#### Change ${index + 1}: ${change.file} (Line ${change.line})\n`;
                summary += `**Justification:** ${change.justification}\n\n`;
                summary += `**Current Code:**\n`;
                summary += `\`\`\`typescript\n${change.oldCode}\n\`\`\`\n\n`;
                summary += `**Recommended Code:**\n`;
                summary += `\`\`\`typescript\n${change.newCode}\n\`\`\`\n\n`;
            });
        }
        if (fullContext.metadata.sources.length > 0) {
            summary += `### Data Sources Analyzed\n`;
            fullContext.metadata.sources.forEach((source) => {
                summary += `- ${source}\n`;
            });
            summary += '\n';
        }
        if (fullContext.fetched.availableSelectors) {
            const selectors = fullContext.fetched.availableSelectors;
            if (selectors.found.length > 0) {
                summary += `### Available Selectors Found\n`;
                selectors.found.forEach((sel) => {
                    summary += `- \`${sel.selector}\` (${sel.type}, ${sel.stability} stability) - ${sel.source}\n`;
                });
                summary += '\n';
            }
        }
        if (repairResult.missingInformation && repairResult.missingInformation.length > 0) {
            summary += `### Additional Information That Could Help\n`;
            repairResult.missingInformation.forEach(info => {
                summary += `- ${info}\n`;
            });
            summary += '\n';
        }
        summary += `---\n`;
        summary += `*This fix recommendation was generated automatically based on test failure analysis.*\n`;
        summary += `*Please review the changes carefully before applying them.*\n`;
        return summary;
    }
}
exports.RepairAgent = RepairAgent;
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map