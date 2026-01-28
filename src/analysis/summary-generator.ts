/**
 * Consolidated summary generation module
 * Unifies summary generation from simplified-analyzer.ts and simplified-repair-agent.ts
 */

import { FORMATTING } from '../config/constants';
import { ErrorData, OpenAIResponse, RepairContext, Verdict } from '../types';
import { truncateForSlack, formatSummaryForSlack, createBriefSummary as createBriefSummaryFromSlack } from '../utils/slack-formatter';

// Internal type for AI recommendation structure
interface AIRecommendation {
  confidence: number;
  reasoning: string;
  changes: AIChange[];
  evidence: string[];
  rootCause: string;
}

interface AIChange {
  file: string;
  line?: number;
  oldCode?: string;
  newCode?: string;
  justification: string;
}

/**
 * Generate a summary for analysis results
 */
export function generateAnalysisSummary(response: OpenAIResponse, errorData: ErrorData): string {
  const verdict = response.verdict === 'TEST_ISSUE' ? '🧪 Test Issue' : '🐛 Product Issue';

  // Get the core reasoning
  const reasoning = response.reasoning.split(/[.!?]/)[0].trim();

  let summary = `${verdict}: ${reasoning}`;

  // Add context if available
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

  // Ensure summary fits within Slack's limits
  return truncateForSlack(summary, FORMATTING.MAIN_SUMMARY_MAX_LENGTH);
}

/**
 * Generate a summary for fix recommendations
 */
export function generateFixSummary(
  recommendation: AIRecommendation,
  context: RepairContext,
  includeCodeBlocks: boolean = false
): string {
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
    recommendation.changes.forEach((change: AIChange, index: number) => {
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
      } else {
        if (change.oldCode) {
          summary += `**Current Code:** ${change.oldCode}\n`;
        }
        summary += `**Suggested Fix:** ${change.newCode}\n\n`;
      }
    });
  }

  if (recommendation.evidence && recommendation.evidence.length > 0) {
    summary += `### Supporting Evidence\n`;
    recommendation.evidence.forEach((item: string) => {
      summary += `- ${item}\n`;
    });
    summary += `\n`;
  }

  summary += `---\n`;
  summary += `*This is an automated fix recommendation. Please review before applying.*\n`;

  // Apply Slack formatting
  return formatSummaryForSlack(summary, includeCodeBlocks);
}

/**
 * Creates a brief summary suitable for Slack from a longer summary
 * Delegates to the canonical implementation in slack-formatter
 */
export function createBriefSummary(
  verdict: Verdict,
  confidence: number,
  fullSummary: string,
  testName?: string
): string {
  return createBriefSummaryFromSlack(verdict, confidence, fullSummary, testName);
}

/**
 * Format verdict for display
 */
export function formatVerdict(verdict: Verdict): string {
  return verdict === 'TEST_ISSUE' ? '🧪 Test Issue' : '🐛 Product Issue';
}
