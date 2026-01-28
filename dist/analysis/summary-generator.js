"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAnalysisSummary = generateAnalysisSummary;
exports.generateFixSummary = generateFixSummary;
exports.createBriefSummary = createBriefSummary;
exports.formatVerdict = formatVerdict;
const constants_1 = require("../config/constants");
const slack_formatter_1 = require("../utils/slack-formatter");
function generateAnalysisSummary(response, errorData) {
    const verdict = response.verdict === 'TEST_ISSUE' ? '🧪 Test Issue' : '🐛 Product Issue';
    const reasoning = response.reasoning.split(/[.!?]/)[0].trim();
    let summary = `${verdict}: ${reasoning}`;
    const contexts = [];
    if (errorData.testName) {
        contexts.push(`Test: "${errorData.testName}"`);
    }
    if (errorData.fileName) {
        contexts.push(`File: ${errorData.fileName}`);
    }
    if (errorData.screenshots?.length) {
        contexts.push(`${errorData.screenshots.length} screenshot(s) analyzed`);
    }
    if (contexts.length > 0) {
        summary += `\n\nContext: ${contexts.join(' | ')}`;
    }
    return (0, slack_formatter_1.truncateForSlack)(summary, constants_1.FORMATTING.MAIN_SUMMARY_MAX_LENGTH);
}
function generateFixSummary(recommendation, context, includeCodeBlocks = false) {
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
            if (includeCodeBlocks) {
                if (change.oldCode) {
                    summary += `**Current Code:**\n`;
                    summary += `\`\`\`typescript\n${change.oldCode}\n\`\`\`\n\n`;
                }
                summary += `**Suggested Fix:**\n`;
                summary += `\`\`\`typescript\n${change.newCode}\n\`\`\`\n\n`;
            }
            else {
                if (change.oldCode) {
                    summary += `**Current Code:** ${change.oldCode}\n`;
                }
                summary += `**Suggested Fix:** ${change.newCode}\n\n`;
            }
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
    return (0, slack_formatter_1.formatSummaryForSlack)(summary, includeCodeBlocks);
}
function createBriefSummary(verdict, confidence, fullSummary, testName) {
    return (0, slack_formatter_1.createBriefSummary)(verdict, confidence, fullSummary, testName);
}
function formatVerdict(verdict) {
    return verdict === 'TEST_ISSUE' ? '🧪 Test Issue' : '🐛 Product Issue';
}
//# sourceMappingURL=summary-generator.js.map