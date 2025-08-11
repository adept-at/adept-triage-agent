/**
 * Utility functions for formatting output for Slack compatibility
 */

/**
 * Truncates text to fit within Slack's block text limits
 * Slack has a limit of ~2,958 characters for text in blocks
 * We'll use 2,900 as a safe limit
 */
export function truncateForSlack(text: string, maxLength: number = 2900): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to find a natural break point (paragraph, sentence, or word)
  const truncateAt = maxLength - 100; // Leave room for ellipsis and note
  
  // First, try to break at a paragraph
  const paragraphBreak = text.lastIndexOf('\n\n', truncateAt);
  if (paragraphBreak > truncateAt * 0.7) {
    return text.substring(0, paragraphBreak) + '\n\n... [Output truncated for Slack - see GitHub Actions for full details]';
  }
  
  // Next, try to break at a sentence
  const sentenceBreak = Math.max(
    text.lastIndexOf('. ', truncateAt),
    text.lastIndexOf('! ', truncateAt),
    text.lastIndexOf('? ', truncateAt)
  );
  if (sentenceBreak > truncateAt * 0.7) {
    return text.substring(0, sentenceBreak + 1) + '\n\n... [Output truncated for Slack - see GitHub Actions for full details]';
  }
  
  // Finally, break at a word boundary
  const wordBreak = text.lastIndexOf(' ', truncateAt);
  if (wordBreak > truncateAt * 0.5) {
    return text.substring(0, wordBreak) + '...\n\n[Output truncated for Slack - see GitHub Actions for full details]';
  }
  
  // Worst case, just truncate at the limit
  return text.substring(0, truncateAt) + '...\n\n[Output truncated for Slack - see GitHub Actions for full details]';
}

/**
 * Formats a summary specifically for Slack, ensuring it fits within limits
 * and preserves the most important information
 */
export function formatSummaryForSlack(summary: string, includeCodeBlocks: boolean = false): string {
  // If we're not including code blocks, remove them to save space
  if (!includeCodeBlocks && summary.includes('```')) {
    summary = summary.replace(/```[\s\S]*?```/g, '[Code block removed for brevity]');
  }
  
  // Apply truncation
  return truncateForSlack(summary);
}

/**
 * Creates a brief summary suitable for Slack from a longer summary
 * Prioritizes key information over details
 */
export function createBriefSummary(
  verdict: string,
  confidence: number,
  fullSummary: string,
  testName?: string
): string {
  let brief = `${verdict} (${confidence}% confidence)`;
  
  if (testName) {
    brief += ` for test "${testName}"`;
  }
  
  // Extract the first meaningful line from the summary
  const lines = fullSummary.split('\n').filter(line => line.trim());
  const firstMeaningfulLine = lines.find(line => 
    !line.startsWith('#') && 
    !line.startsWith('*') &&
    line.length > 20
  );
  
  if (firstMeaningfulLine) {
    brief += `: ${firstMeaningfulLine}`;
  }
  
  return truncateForSlack(brief, 500); // Keep brief summaries under 500 chars
}
