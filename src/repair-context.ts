import { RepairContext, AnalysisResult } from './types';

/**
 * Classifies the error type based on the error message
 */
export function classifyErrorType(error: string): string {
  const errorLower = error.toLowerCase();

  // Check for element not found errors
  if (
    errorLower.includes('expected to find element') ||
    errorLower.includes('element not found') ||
    errorLower.includes('could not find element') ||
    errorLower.includes('never found it')
  ) {
    return 'ELEMENT_NOT_FOUND';
  }

  // Check for element visibility errors
  if (
    errorLower.includes('element is not visible') ||
    errorLower.includes('is not visible') ||
    errorLower.includes('visibility: hidden') ||
    errorLower.includes('element exists but is not visible')
  ) {
    return 'ELEMENT_NOT_VISIBLE';
  }

  // Check for timeout errors
  if (
    errorLower.includes('timed out') ||
    errorLower.includes('timeouterror') ||
    errorLower.includes('timeout of') ||
    errorLower.includes('operation timed out')
  ) {
    return 'TIMEOUT';
  }

  // Check for assertion errors
  if (
    errorLower.includes('assertionerror') ||
    errorLower.includes('expected') ||
    errorLower.includes('assert.equal') ||
    errorLower.includes('to be truthy')
  ) {
    return 'ASSERTION_FAILED';
  }

  // Check for network errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('err_network')
  ) {
    return 'NETWORK_ERROR';
  }

  // Check for element detached errors
  if (
    errorLower.includes('detached from the dom') ||
    errorLower.includes('element is detached')
  ) {
    return 'ELEMENT_DETACHED';
  }

  // Check for element covered errors
  if (
    errorLower.includes('covered by another element') ||
    errorLower.includes('element is covered')
  ) {
    return 'ELEMENT_COVERED';
  }

  // Check for invalid element type errors
  if (
    errorLower.includes('can only be called on') ||
    errorLower.includes('invalid element type')
  ) {
    return 'INVALID_ELEMENT_TYPE';
  }

  return 'UNKNOWN';
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

  // Special case: extract from HTML snippets in error messages (e.g., <button data-testid="submit">)
  const htmlPatterns = [
    /<([a-zA-Z]+)[^>]*data-testid=["']([^"']+)["'][^>]*>/g,
    /<([a-zA-Z]+)[^>]*data-test=["']([^"']+)["'][^>]*>/g,
    /<([a-zA-Z]+)[^>]*id=["']([^"']+)["'][^>]*>/g,
    /<([a-zA-Z]+)[^>]*class=["']([^"']+)["'][^>]*>/g,
    /<input[^>]*#([a-zA-Z0-9_-]+)[^>]*>/g  // For <input#email> pattern
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
        // Return the first class if multiple, but check if it's "editor" for the special case
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
    // Complex selectors with hierarchy (check before simple selectors)
    /div\.([a-zA-Z0-9_-]+)\s*>\s*button\.([a-zA-Z0-9_-]+)/g,
    /form#([a-zA-Z0-9_-]+)\s+input/g,
    
    // Class selectors (must have valid class name)
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
 * Builds a RepairContext from analysis data
 */
export function buildRepairContext(analysisData: {
  testFile: string;
  errorLine?: number;
  testName: string;
  errorMessage: string;
  workflowRunId: string;
  jobName: string;
  commitSha: string;
  branch: string;
  repository: string;
  prNumber?: string;
  targetAppPrNumber?: string;
}): RepairContext {
  const errorType = classifyErrorType(analysisData.errorMessage);
  const errorSelector = extractSelector(analysisData.errorMessage);

  return {
    // Location information
    testFile: analysisData.testFile,
    errorLine: analysisData.errorLine,
    testName: analysisData.testName,

    // Failure identification
    errorType,
    errorSelector,
    errorMessage: analysisData.errorMessage,

    // Repository context
    workflowRunId: analysisData.workflowRunId,
    jobName: analysisData.jobName,
    commitSha: analysisData.commitSha,
    branch: analysisData.branch,
    repository: analysisData.repository,

    // Optional PR context
    prNumber: analysisData.prNumber,
    targetAppPrNumber: analysisData.targetAppPrNumber
  };
}

/**
 * Enhances an AnalysisResult with RepairContext if it's a TEST_ISSUE
 */
export function enhanceAnalysisWithRepairContext(
  analysisResult: AnalysisResult,
  testData: {
    testFile: string;
    errorLine?: number;
    testName: string;
    errorMessage: string;
    workflowRunId: string;
    jobName: string;
    commitSha: string;
    branch: string;
    repository: string;
    prNumber?: string;
    targetAppPrNumber?: string;
  }
): AnalysisResult {
  // Only add repair context for TEST_ISSUE verdicts
  if (analysisResult.verdict !== 'TEST_ISSUE') {
    return analysisResult;
  }

  const repairContext = buildRepairContext(testData);

  return {
    ...analysisResult,
    repairContext
  };
}
