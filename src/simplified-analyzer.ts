import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData, FewShotExample, OpenAIResponse } from './types';
import * as core from '@actions/core';
import { truncateForSlack } from './utils/slack-formatter';

/**
 * Simplified analyzer that focuses on core functionality
 * - Cleaner error extraction
 * - Simpler confidence calculation
 * - Better integration with fix recommendations
 */

// Reduced, more general few-shot examples
const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    error: 'Intentional failure for triage agent testing',
    verdict: 'TEST_ISSUE',
    reasoning: 'Explicit "Intentional failure" indicates deliberate test failure for testing purposes.'
  },
  {
    error: 'TimeoutError: Waiting for element to be visible: #submit-button',
    verdict: 'TEST_ISSUE',
    reasoning: 'Element visibility timeout typically indicates test synchronization issue, not product bug.'
  },
  {
    error: 'AssertionError: Expected to find element: [data-testid="button"], but never found it',
    verdict: 'TEST_ISSUE',
    reasoning: 'Element not found errors are usually test issues - selector changed or timing problem.'
  },
  {
    error: 'TypeError: Cannot read property "name" of null at UserProfile.render (src/components/UserProfile.tsx:45)',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Null pointer error in production component code indicates product bug.'
  },
  {
    error: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Database connection refused indicates product infrastructure issue.'
  },
  {
    error: 'Error: Network request failed with status 500: Internal Server Error',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'HTTP 500 errors indicate server-side failures in the application.'
  }
];

/**
 * Main analysis function - simplified version
 */
export async function analyzeFailure(client: OpenAIClient, errorData: ErrorData): Promise<AnalysisResult> {
  try {
    core.info(`Analyzing error: ${errorData.message.substring(0, 100)}...`);
    
    // Get AI analysis
    const response = await client.analyze(errorData, FEW_SHOT_EXAMPLES);
    
    // Calculate confidence
    const confidence = calculateConfidence(response, errorData);
    
    // Generate summary
    const summary = generateSummary(response, errorData);
    
    // Prepare the result
    const result: AnalysisResult = {
      verdict: response.verdict,
      confidence,
      reasoning: response.reasoning,
      summary,
      indicators: response.indicators || [],
      suggestedSourceLocations: response.suggestedSourceLocations
    };

    // Add enhanced metadata for TEST_ISSUE (helps with fix recommendations)
    if (response.verdict === 'TEST_ISSUE') {
      result.evidence = extractTestIssueEvidence(errorData);
      result.category = categorizeTestIssue(errorData);
    }
    
    return result;
  } catch (error) {
    core.error(`Analysis failed: ${error}`);
    throw error;
  }
}

/**
 * Simplified error extraction from logs
 */
export function extractErrorFromLogs(logs: string): ErrorData | null {
  // Clean ANSI codes
  const cleanLogs = logs.replace(/\u001b\[[0-9;]*m/g, '');
  
  // Look for common error patterns - PRIORITIZED ORDER
  const errorPatterns = [
    // Specific JavaScript errors with property access (high priority)
    { pattern: /TypeError: Cannot read propert(?:y|ies) .+ of (?:null|undefined).*/, framework: 'javascript', priority: 10 },
    { pattern: /TypeError: Cannot access .+ of (?:null|undefined).*/, framework: 'javascript', priority: 10 },
    
    // Cypress-specific errors
    { pattern: /(AssertionError|CypressError|TimeoutError):\s*(.+)/, framework: 'cypress', priority: 8 },
    { pattern: /Timed out .+ after \d+ms:\s*(.+)/, framework: 'cypress', priority: 8 },
    { pattern: /Expected to find .+:\s*(.+)/, framework: 'cypress', priority: 7 },
    
    // General JavaScript errors
    { pattern: /(TypeError|ReferenceError|SyntaxError):\s*(.+)/, framework: 'javascript', priority: 6 },
    { pattern: /Error:\s*(.+)/, framework: 'javascript', priority: 5 },
    
    // Generic test failures (lower priority)
    { pattern: /✖\s+(.+)/, framework: 'unknown', priority: 3 },
    { pattern: /FAIL\s+(.+)/, framework: 'unknown', priority: 2 },
    { pattern: /Failed:\s*(.+)/, framework: 'unknown', priority: 1 }
  ];
  
  // Sort by priority
  errorPatterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const { pattern, framework, priority } of errorPatterns) {
    const match = cleanLogs.match(pattern);
    if (match) {
      // Skip XHR/network logs that aren't actual errors
      const beforeError = cleanLogs.substring(Math.max(0, (match.index || 0) - 100), match.index || 0);
      if (beforeError.includes('cy:xhr') && beforeError.includes('Status: 200')) {
        // This might be a log line, not an actual error - skip if low priority
        if ((priority || 0) < 5) continue;
      }
      
      // Extract MORE context around the error (was 200/800, now 500/1500)
      const errorIndex = match.index || 0;
      const contextStart = Math.max(0, errorIndex - 500);
      const contextEnd = Math.min(cleanLogs.length, errorIndex + 1500);
      const errorContext = cleanLogs.substring(contextStart, contextEnd);
      
      // Extract test name if available - look for more patterns
      const testNamePatterns = [
        /(?:it|test|describe)\(['"`]([^'"`]+)['"`]/,
        /\d+\)\s+(.+?)(?:\n|$)/,  // Numbered test output like "1) Test name"
        /Running test:\s*(.+?)(?:\n|$)/,
        /Test:\s*["']?(.+?)["']?(?:\n|$)/
      ];
      
      let testName: string | undefined;
      for (const testPattern of testNamePatterns) {
        const testNameMatch = errorContext.match(testPattern);
        if (testNameMatch && testNameMatch[1]) {
          testName = testNameMatch[1].trim();
          break;
        }
      }
      
      // Extract file name if available - more patterns
      const filePatterns = [
        /at\s+.+?\((.+?\.(js|ts|jsx|tsx)):\d+:\d+\)/,  // Stack trace format
        /(?:Running:|File:|spec:)\s*([^\s]+\.(cy|spec|test)\.[jt]sx?)/,
        /webpack:\/\/[^/]+\/(.+?\.(js|ts|jsx|tsx))/  // Webpack format  
      ];
      
      let fileName: string | undefined;
      for (const filePattern of filePatterns) {
        // Look in error context first, then fall back to full logs
        const fileMatch = errorContext.match(filePattern) || cleanLogs.match(filePattern);
        if (fileMatch && fileMatch[1]) {
          fileName = fileMatch[1];
          break;
        }
      }
      
      // Get the actual error type from the match
      const errorType = match[0].split(':')[0] || 'Error';
      
      // Log what we're extracting for debugging
      core.debug(`Extracted error type: ${errorType}`);
      core.debug(`Extracted test name: ${testName || 'unknown'}`);
      core.debug(`Error preview: ${match[0].substring(0, 100)}...`);
      
      return {
        message: errorContext,
        framework,
        testName,
        fileName,
        failureType: errorType
      };
    }
  }

  // If no pattern matches, return the first error-like line
  const lines = cleanLogs.split('\n').filter(line => line.trim());
  const errorLine = lines.find(line => 
    /error|fail|assert|expect|timeout/i.test(line)
  );
  
  if (errorLine) {
    return {
      message: errorLine,
      framework: 'unknown'
    };
  }

  return null;
}

/**
 * Simplified confidence calculation
 */
function calculateConfidence(response: OpenAIResponse, errorData: ErrorData): number {
  let confidence = 70; // Base confidence
  
  // Clear indicators boost confidence
  const indicatorCount = response.indicators?.length || 0;
  confidence += Math.min(indicatorCount * 5, 15);
  
  // Evidence boosts confidence
  if (errorData.screenshots?.length) {
    confidence += 10;
    if (errorData.screenshots.length > 1) {
      confidence += 5;
    }
  }
  
  if (errorData.logs?.length) {
    confidence += 5;
  }
  
  if (errorData.prDiff) {
    confidence += 5;
  }
  
  if (errorData.framework && errorData.framework !== 'unknown') {
    confidence += 5;
  }
  
  // Cap at 95 (never 100% certain)
  return Math.min(confidence, 95);
}

/**
 * Generate a clear, concise summary
 */
function generateSummary(response: OpenAIResponse, errorData: ErrorData): string {
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
  return truncateForSlack(summary, 1000); // Keep main summaries concise
}

/**
 * Extract evidence for TEST_ISSUE verdicts (helps with fix recommendations)
 */
function extractTestIssueEvidence(errorData: ErrorData): string[] {
  const evidence: string[] = [];
  
  // Look for selector issues
  const selectorMatch = errorData.message.match(/\[([^\]]+)\]|#[\w-]+|\.[\w-]+/);
  if (selectorMatch) {
    evidence.push(`Selector involved: ${selectorMatch[0]}`);
  }
  
  // Look for timeout values
  const timeoutMatch = errorData.message.match(/(\d+)ms/);
  if (timeoutMatch) {
    evidence.push(`Timeout: ${timeoutMatch[0]}`);
  }
  
  // Check for visibility issues
  if (/not visible|covered|hidden|display:\s*none/.test(errorData.message)) {
    evidence.push('Element visibility issue detected');
  }
  
  // Check for async issues
  if (/async|await|promise|then/.test(errorData.message)) {
    evidence.push('Possible async/timing issue');
  }
  
  return evidence;
}

/**
 * Categorize TEST_ISSUE for better fix recommendations
 */
function categorizeTestIssue(errorData: ErrorData): string {
  const message = errorData.message.toLowerCase();
  
  if (/element.*not found|could not find|never found/.test(message)) {
    return 'ELEMENT_NOT_FOUND';
  }
  
  if (/timeout|timed out/.test(message)) {
    return 'TIMEOUT';
  }
  
  if (/not visible|visibility|covered|hidden/.test(message)) {
    return 'VISIBILITY';
  }
  
  if (/assertion|expected.*to/.test(message)) {
    return 'ASSERTION';
  }
  
  if (/network|fetch|api|request/.test(message)) {
    return 'NETWORK';
  }
  
  return 'UNKNOWN';
}

// Export the few-shot examples for testing
export { FEW_SHOT_EXAMPLES };
