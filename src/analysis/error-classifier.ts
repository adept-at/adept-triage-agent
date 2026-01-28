/**
 * Consolidated error classification module
 * Unifies error classification logic from repair-context.ts and simplified-analyzer.ts
 */

import { ERROR_TYPES, ErrorType, TEST_ISSUE_CATEGORIES, TestIssueCategory } from '../config/constants';

/**
 * Classifies the error type based on the error message
 * Used for both repair context building and test issue categorization
 */
export function classifyErrorType(error: string): ErrorType {
  const errorLower = error.toLowerCase();

  // Check for element not found errors (high priority)
  if (
    errorLower.includes('expected to find element') ||
    errorLower.includes('element not found') ||
    errorLower.includes('could not find element') ||
    errorLower.includes('never found it')
  ) {
    return ERROR_TYPES.ELEMENT_NOT_FOUND;
  }

  // Check for element visibility errors
  if (
    errorLower.includes('element is not visible') ||
    errorLower.includes('is not visible') ||
    errorLower.includes('visibility: hidden') ||
    errorLower.includes('element exists but is not visible')
  ) {
    return ERROR_TYPES.ELEMENT_NOT_VISIBLE;
  }

  // Check for element covered errors
  if (
    errorLower.includes('covered by another element') ||
    errorLower.includes('element is covered')
  ) {
    return ERROR_TYPES.ELEMENT_COVERED;
  }

  // Check for element detached errors
  if (
    errorLower.includes('detached from the dom') ||
    errorLower.includes('element is detached')
  ) {
    return ERROR_TYPES.ELEMENT_DETACHED;
  }

  // Check for invalid element type errors
  if (
    errorLower.includes('can only be called on') ||
    errorLower.includes('invalid element type')
  ) {
    return ERROR_TYPES.INVALID_ELEMENT_TYPE;
  }

  // Check for timeout errors
  if (
    errorLower.includes('timed out') ||
    errorLower.includes('timeouterror') ||
    errorLower.includes('timeout of') ||
    errorLower.includes('operation timed out')
  ) {
    return ERROR_TYPES.TIMEOUT;
  }

  // Check for assertion errors
  if (
    errorLower.includes('assertionerror') ||
    errorLower.includes('expected') ||
    errorLower.includes('assert.equal') ||
    errorLower.includes('to be truthy')
  ) {
    return ERROR_TYPES.ASSERTION_FAILED;
  }

  // Check for network errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('err_network')
  ) {
    return ERROR_TYPES.NETWORK_ERROR;
  }

  return ERROR_TYPES.UNKNOWN;
}

/**
 * Categorizes a test issue for fix recommendation purposes
 * Maps error messages to broader categories
 */
export function categorizeTestIssue(errorMessage: string): TestIssueCategory {
  const message = errorMessage.toLowerCase();

  if (/element.*not found|could not find|never found/.test(message)) {
    return TEST_ISSUE_CATEGORIES.ELEMENT_NOT_FOUND;
  }

  if (/timeout|timed out/.test(message)) {
    return TEST_ISSUE_CATEGORIES.TIMEOUT;
  }

  if (/not visible|visibility|covered|hidden/.test(message)) {
    return TEST_ISSUE_CATEGORIES.VISIBILITY;
  }

  if (/assertion|expected.*to/.test(message)) {
    return TEST_ISSUE_CATEGORIES.ASSERTION;
  }

  if (/network|fetch|api|request/.test(message)) {
    return TEST_ISSUE_CATEGORIES.NETWORK;
  }

  return TEST_ISSUE_CATEGORIES.UNKNOWN;
}

/**
 * Extracts selector from error message
 */
export function extractSelector(error: string): string | undefined {
  // Priority patterns - check these first as they're most specific
  const priorityPatterns = [
    // Complex/compound selectors (e.g., button[data-testid="submit"]) - Check these FIRST
    /\b([a-zA-Z]+\[data-testid=["'][^"']+["']\])/g,
    /\b([a-zA-Z]+\[data-test=["'][^"']+["']\])/g,

    // data-testid selectors
    /\[data-testid=["']([^"']+)["']\]/g,
    /\[data-testid="([^"]+)"\]/g,
    /\[data-testid='([^']+)'\]/g,

    // data-test selectors
    /\[data-test=["']([^"']+)["']\]/g,
    /\[data-test="([^"]+)"\]/g,
    /\[data-test='([^']+)'\]/g,

    // aria-label selectors
    /\[aria-label=["']([^"']+)["']\]/g,
    /\[aria-label="([^"]+)"\]/g,
    /\[aria-label='([^']+)'\]/g,

    // alt attribute selectors
    /\[alt=["']([^"']+)["']\]/g,
    /\[alt="([^"]+)"\]/g,
    /\[alt='([^']+)'\]/g,

    // Type attribute selectors (for input[type="email"] etc)
    /input\[type=["']([^"']+)["']\]/g,
    /\[type=["']([^"']+)["']\]/g,

    // Generic attribute selectors
    /\[([a-zA-Z-]+)=["']([^"']+)["']\]/g
  ];

  // Check priority patterns first
  for (const pattern of priorityPatterns) {
    const matches = Array.from(error.matchAll(pattern));
    if (matches.length > 0) {
      const match = matches[0];
      // Return the full matched selector
      return match[0];
    }
  }

  // Special case: extract from HTML snippets in error messages
  const htmlPatterns = [
    /<([a-zA-Z]+)[^>]*data-testid=["']([^"']+)["'][^>]*>/g,
    /<([a-zA-Z]+)[^>]*data-test=["']([^"']+)["'][^>]*>/g,
    /<([a-zA-Z]+)[^>]*id=["']([^"']+)["'][^>]*>/g,
    /<([a-zA-Z]+)[^>]*class=["']([^"']+)["'][^>]*>/g,
    /<input[^>]*#([a-zA-Z0-9_-]+)[^>]*>/g
  ];

  for (const pattern of htmlPatterns) {
    const matches = Array.from(error.matchAll(pattern));
    if (matches.length > 0) {
      const match = matches[0];
      if (pattern.source.includes('data-testid')) {
        return `[data-testid="${match[2]}"]`;
      } else if (pattern.source.includes('data-test')) {
        return `[data-test="${match[2]}"]`;
      } else if (pattern.source.includes('id=')) {
        return '#' + match[2];
      } else if (pattern.source.includes('<input[^>]*#')) {
        return '#' + match[1];
      } else if (pattern.source.includes('class=')) {
        const classes = match[2].split(' ');
        return '.' + classes[0];
      }
    }
  }

  // Check for patterns like <input#email> or <div class="editor">
  const specialHtmlPatterns = [
    /<input#([a-zA-Z0-9_-]+)>/g,
    /<div\s+class=["']([^"']+)["']>/g
  ];

  for (const pattern of specialHtmlPatterns) {
    const matches = Array.from(error.matchAll(pattern));
    if (matches.length > 0) {
      const match = matches[0];
      if (pattern.source.includes('<input#')) {
        return '#' + match[1];
      } else if (pattern.source.includes('class=')) {
        return '.' + match[1].split(' ')[0];
      }
    }
  }

  // Secondary patterns - CSS selectors
  const cssPatterns = [
    // Complex selectors with hierarchy
    /div\.([a-zA-Z0-9_-]+)\s*>\s*button\.([a-zA-Z0-9_-]+)/g,
    /form#([a-zA-Z0-9_-]+)\s+input/g,

    // Class selectors
    /\.([a-zA-Z][a-zA-Z0-9_-]*)/g,

    // ID selectors
    /#([a-zA-Z][a-zA-Z0-9_-]*)/g
  ];

  for (const pattern of cssPatterns) {
    const matches = Array.from(error.matchAll(pattern));
    if (matches.length > 0) {
      const match = matches[0];
      // For complex selectors, return the full match
      if (pattern.source.includes('>') || pattern.source.includes('\\s+')) {
        return match[0];
      }
      // For class and ID selectors, return with the prefix
      if (pattern.source.includes('\\.')) {
        return '.' + match[1];
      } else if (pattern.source.includes('#')) {
        return '#' + match[1];
      } else {
        return match[0];
      }
    }
  }

  return undefined;
}

/**
 * Extract evidence for TEST_ISSUE verdicts (helps with fix recommendations)
 */
export function extractTestIssueEvidence(errorMessage: string): string[] {
  const evidence: string[] = [];

  // Look for selector issues
  const selectorMatch = errorMessage.match(/\[([^\]]+)\]|#[\w-]+|\.[\w-]+/);
  if (selectorMatch) {
    evidence.push(`Selector involved: ${selectorMatch[0]}`);
  }

  // Look for timeout values
  const timeoutMatch = errorMessage.match(/(\d+)ms/);
  if (timeoutMatch) {
    evidence.push(`Timeout: ${timeoutMatch[0]}`);
  }

  // Check for visibility issues
  if (/not visible|covered|hidden|display:\s*none/.test(errorMessage)) {
    evidence.push('Element visibility issue detected');
  }

  // Check for async issues
  if (/async|await|promise|then/.test(errorMessage)) {
    evidence.push('Possible async/timing issue');
  }

  return evidence;
}
