"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateForSlack = truncateForSlack;
exports.formatSummaryForSlack = formatSummaryForSlack;
exports.createBriefSummary = createBriefSummary;
function truncateForSlack(text, maxLength = 2900) {
    if (text.length <= maxLength) {
        return text;
    }
    const truncateAt = maxLength - 100;
    const paragraphBreak = text.lastIndexOf('\n\n', truncateAt);
    if (paragraphBreak > truncateAt * 0.7) {
        return text.substring(0, paragraphBreak) + '\n\n... [Output truncated for Slack - see GitHub Actions for full details]';
    }
    const sentenceBreak = Math.max(text.lastIndexOf('. ', truncateAt), text.lastIndexOf('! ', truncateAt), text.lastIndexOf('? ', truncateAt));
    if (sentenceBreak > truncateAt * 0.7) {
        return text.substring(0, sentenceBreak + 1) + '\n\n... [Output truncated for Slack - see GitHub Actions for full details]';
    }
    const wordBreak = text.lastIndexOf(' ', truncateAt);
    if (wordBreak > truncateAt * 0.5) {
        return text.substring(0, wordBreak) + '...\n\n[Output truncated for Slack - see GitHub Actions for full details]';
    }
    return text.substring(0, truncateAt) + '...\n\n[Output truncated for Slack - see GitHub Actions for full details]';
}
function formatSummaryForSlack(summary, includeCodeBlocks = false) {
    if (!includeCodeBlocks && summary.includes('```')) {
        summary = summary.replace(/```[\s\S]*?```/g, '[Code block removed for brevity]');
    }
    return truncateForSlack(summary);
}
function createBriefSummary(verdict, confidence, fullSummary, testName) {
    let brief = `${verdict} (${confidence}% confidence)`;
    if (testName) {
        brief += ` for test "${testName}"`;
    }
    const lines = fullSummary.split('\n').filter(line => line.trim());
    const firstMeaningfulLine = lines.find(line => !line.startsWith('#') &&
        !line.startsWith('*') &&
        line.length > 20);
    if (firstMeaningfulLine) {
        brief += `: ${firstMeaningfulLine}`;
    }
    return truncateForSlack(brief, 500);
}
//# sourceMappingURL=slack-formatter.js.map