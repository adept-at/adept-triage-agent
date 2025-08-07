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
exports.RepairEngine = void 0;
const core = __importStar(require("@actions/core"));
class RepairEngine {
    openaiClient;
    minConfidence;
    requireEvidence;
    constructor(openaiClient, minConfidence = 70, requireEvidence = true) {
        this.openaiClient = openaiClient;
        this.minConfidence = minConfidence;
        this.requireEvidence = requireEvidence;
    }
    async attemptRepair(fullContext) {
        const startTime = Date.now();
        const repairPrompt = this.buildRepairPrompt(fullContext);
        try {
            const suggestedFix = await this.generateRepairSuggestion(repairPrompt);
            if (suggestedFix.confidence < this.minConfidence) {
                core.info(`Repair confidence (${suggestedFix.confidence}%) below threshold (${this.minConfidence}%)`);
                return {
                    canRepair: false,
                    reason: `Insufficient confidence: ${suggestedFix.confidence}% < ${this.minConfidence}%`,
                    missingInformation: suggestedFix.missingInfo || ['Additional context needed for confident repair']
                };
            }
            if (this.requireEvidence && !this.hasValidEvidence(suggestedFix, fullContext)) {
                core.warning('No concrete evidence found for repair');
                return {
                    canRepair: false,
                    reason: 'No concrete evidence found in source code',
                    missingInformation: ['Source code evidence for the proposed fix']
                };
            }
            const metrics = {
                repairAttemptId: `repair-${Date.now()}`,
                minimalContextSize: JSON.stringify(fullContext.minimal).length,
                fetchedDataSize: JSON.stringify(fullContext.fetched).length,
                fetchDuration: Date.now() - startTime,
                totalDataFetched: fullContext.metadata.sources.length,
                confidence: suggestedFix.confidence,
                decision: 'REPAIR',
                reasoning: suggestedFix.reasoning || 'Fix generated based on evidence',
                evidenceUsed: suggestedFix.evidence || []
            };
            core.info(`Repair metrics: ${JSON.stringify(metrics)}`);
            return {
                canRepair: true,
                confidence: suggestedFix.confidence,
                proposedFix: suggestedFix.changes,
                evidence: suggestedFix.evidence
            };
        }
        catch (error) {
            core.error(`Repair attempt failed: ${error}`);
            return {
                canRepair: false,
                reason: `Repair generation failed: ${error}`,
                missingInformation: ['Unable to generate repair']
            };
        }
    }
    buildRepairPrompt(context) {
        let prompt = `
You are a Cypress test repair expert. Analyze this TEST_ISSUE and provide a fix based ONLY on the evidence provided.

## MINIMAL CONTEXT FROM TRIAGE
- Test File: ${context.minimal.testFile}
- Error Line: ${context.minimal.errorLine || 'unknown'}
- Error Type: ${context.minimal.errorType}
- Failed Selector/Assertion: ${context.minimal.errorSelector || 'none'}
- Error Message: ${context.minimal.errorMessage}

## FETCHED CONTEXT

### Test File Content
${context.fetched.testFileContent ? `\`\`\`typescript
${context.fetched.testFileContent}
\`\`\`` : 'Not available'}

### Error Location (Line ${context.minimal.errorLine || 'unknown'})
${context.fetched.errorLineContext ? `\`\`\`typescript
${context.fetched.errorLineContext}
\`\`\`` : 'Not available'}
`;
        if (context.fetched.appPrDiff) {
            prompt += `
### Application PR Diff (Potential Cause)
\`\`\`diff
${context.fetched.appPrDiff.substring(0, 2000)} // Truncated
\`\`\`
`;
        }
        if (context.fetched.availableSelectors && context.fetched.availableSelectors.found.length > 0) {
            prompt += `
### Available Selectors in Application
${context.fetched.availableSelectors.found.map(s => `- ${s.selector} (${s.type}, stability: ${s.stability}, source: ${s.source}:${s.lineNumber})`).join('\n')}
`;
            if (context.fetched.availableSelectors.alternatives.length > 0) {
                prompt += `
### Alternative Selectors
${context.fetched.availableSelectors.alternatives.map(s => `- ${s.selector} (${s.type}, stability: ${s.stability})`).join('\n')}
`;
            }
        }
        if (context.fetched.appComponents && context.fetched.appComponents.length > 0) {
            prompt += `
### Relevant Application Components
`;
            for (const component of context.fetched.appComponents.slice(0, 2)) {
                prompt += `
#### ${component.path}
\`\`\`${component.language}
${component.content.substring(0, 1000)} // Truncated
\`\`\`
`;
            }
        }
        prompt += `
## REPAIR INSTRUCTIONS

1. Identify the ROOT CAUSE based on the evidence above
2. If the cause is found in the PR diff, reference the specific line
3. If the fix requires a selector change, ONLY use selectors from "Available Selectors"
4. Provide a confidence score (0-100) for your fix
5. If you cannot find concrete evidence, respond with "CANNOT_REPAIR"

## RESPONSE FORMAT

{
  "canRepair": true/false,
  "confidence": 0-100,
  "reasoning": "explanation of the root cause and fix",
  "rootCause": {
    "description": "specific description",
    "evidence": {
      "source": "PR_DIFF" | "APP_COMPONENT" | "TEST_PATTERN" | "SELECTOR_CHANGE",
      "reference": "specific line or file"
    }
  },
  "changes": [
    {
      "file": "${context.minimal.testFile}",
      "line": line_number,
      "oldCode": "exact current code",
      "newCode": "exact replacement code",
      "justification": "why this fixes the issue"
    }
  ],
  "evidence": ["list of evidence supporting this fix"],
  "missingInfo": ["any information that would increase confidence"]
}

IMPORTANT: 
- Only suggest changes that are directly supported by evidence
- Prefer simple, minimal changes over complex refactoring
- If multiple selectors are available, choose the most stable one (data-testid > data-test > id > class)
`;
        return prompt;
    }
    async generateRepairSuggestion(prompt) {
        try {
            const errorData = {
                message: prompt,
                framework: 'cypress',
                context: 'repair'
            };
            const response = await this.openaiClient.analyze(errorData, []);
            const repairInfo = this.parseRepairFromResponse(response);
            if (repairInfo.canRepair) {
                return {
                    canRepair: true,
                    confidence: repairInfo.confidence,
                    reasoning: repairInfo.reasoning,
                    changes: repairInfo.changes,
                    evidence: repairInfo.evidence,
                    missingInfo: repairInfo.missingInfo
                };
            }
            return {
                canRepair: false,
                confidence: 0,
                missingInfo: ['Insufficient evidence for repair']
            };
        }
        catch (error) {
            core.error(`Failed to generate repair suggestion: ${error}`);
            throw error;
        }
    }
    parseRepairFromResponse(response) {
        try {
            const reasoning = response.reasoning || '';
            const jsonMatch = reasoning.match(/\{[\s\S]*"canRepair"[\s\S]*\}/m);
            if (jsonMatch) {
                const repairData = JSON.parse(jsonMatch[0]);
                return {
                    canRepair: repairData.canRepair || false,
                    confidence: repairData.confidence || 0,
                    reasoning: repairData.reasoning || reasoning,
                    changes: this.parseProposedChanges(repairData.changes),
                    evidence: repairData.evidence || [],
                    missingInfo: repairData.missingInfo || []
                };
            }
            if (response.verdict === 'TEST_ISSUE') {
                return {
                    canRepair: true,
                    confidence: 50,
                    reasoning: reasoning,
                    changes: [],
                    evidence: [],
                    missingInfo: ['Unable to parse repair details']
                };
            }
        }
        catch (error) {
            core.debug(`Failed to parse repair response: ${error}`);
        }
        return {
            canRepair: false,
            confidence: 0,
            missingInfo: ['Unable to parse repair response']
        };
    }
    parseProposedChanges(changes) {
        if (!Array.isArray(changes)) {
            return [];
        }
        return changes.map(change => ({
            file: change.file || '',
            line: parseInt(change.line) || 0,
            oldCode: change.oldCode || '',
            newCode: change.newCode || '',
            justification: change.justification || 'Fix based on evidence'
        })).filter(change => change.file && change.line > 0 && change.oldCode && change.newCode);
    }
    hasValidEvidence(suggestedFix, fullContext) {
        if (!suggestedFix.evidence || !Array.isArray(suggestedFix.evidence) || suggestedFix.evidence.length === 0) {
            return false;
        }
        if (!suggestedFix.rootCause || !suggestedFix.rootCause.evidence) {
            return false;
        }
        const validSources = ['PR_DIFF', 'APP_COMPONENT', 'TEST_PATTERN', 'SELECTOR_CHANGE'];
        if (!validSources.includes(suggestedFix.rootCause.evidence.source)) {
            return false;
        }
        if (suggestedFix.rootCause.evidence.source === 'SELECTOR_CHANGE') {
            if (!fullContext.fetched.availableSelectors || fullContext.fetched.availableSelectors.found.length === 0) {
                return false;
            }
            const proposedSelectors = suggestedFix.changes
                ?.map((c) => this.extractSelectorsFromCode(c.newCode))
                .flat();
            const availableSelectors = [
                ...fullContext.fetched.availableSelectors.found,
                ...fullContext.fetched.availableSelectors.alternatives
            ].map(s => s.selector);
            const hasValidSelector = proposedSelectors?.some((ps) => availableSelectors.includes(ps));
            if (!hasValidSelector) {
                core.warning('Proposed selector not found in available selectors');
                return false;
            }
        }
        return true;
    }
    extractSelectorsFromCode(code) {
        const selectors = [];
        const patterns = [
            /cy\.get\(['"]([^'"]+)['"]\)/g,
            /cy\.find\(['"]([^'"]+)['"]\)/g,
            /cy\.contains\(['"]([^'"]+)['"]\)/g,
            /\[data-testid=["']([^"']+)["']\]/g,
            /\[data-test=["']([^"']+)["']\]/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                selectors.push(match[1]);
            }
        }
        return selectors;
    }
}
exports.RepairEngine = RepairEngine;
//# sourceMappingURL=repair-engine.js.map