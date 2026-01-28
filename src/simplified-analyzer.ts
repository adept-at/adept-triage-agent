import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData, FewShotExample, OpenAIResponse } from './types';
import * as core from '@actions/core';
import { generateAnalysisSummary } from './analysis/summary-generator';
import { categorizeTestIssue, extractTestIssueEvidence } from './analysis/error-classifier';
import { CONFIDENCE, LOG_LIMITS } from './config/constants';

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
    error: 'Cypress could not verify that this server is running: https://example.vercel.app',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Server not accessible indicates deployment/infrastructure issue - the application server is down or unreachable.'
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
      result.evidence = extractTestIssueEvidence(errorData.message);
      result.category = categorizeTestIssue(errorData.message);
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
  // Clean ANSI codes - build regex dynamically to avoid linter warning
  const esc = String.fromCharCode(27);
  const ansiPattern = new RegExp(`${esc}\\[[0-9;]*m`, 'g');
  const cleanLogs = logs.replace(ansiPattern, '');
  
  // Look for common error patterns - PRIORITIZED ORDER
  const errorPatterns = [
    // Cypress server verification errors (highest priority - happens before tests can even run)
    { pattern: /Cypress could not verify that this server is running.*/, framework: 'cypress', priority: 12 },
    { pattern: /Cypress failed to verify that your server is running.*/, framework: 'cypress', priority: 12 },
    { pattern: /Please start this server and then run Cypress again.*/, framework: 'cypress', priority: 11 },
    
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
      
      // Extract context around the error
      const errorIndex = match.index || 0;
      let contextStart = Math.max(0, errorIndex - LOG_LIMITS.ERROR_CONTEXT_BEFORE);
      let contextEnd = Math.min(cleanLogs.length, errorIndex + LOG_LIMITS.ERROR_CONTEXT_AFTER);

      // For Cypress server verification errors, get more context to include the URL and retry attempts
      if (match[0].includes('Cypress could not verify') || match[0].includes('Cypress failed to verify')) {
        contextStart = Math.max(0, errorIndex - LOG_LIMITS.SERVER_ERROR_CONTEXT_BEFORE);
        contextEnd = Math.min(cleanLogs.length, errorIndex + LOG_LIMITS.SERVER_ERROR_CONTEXT_AFTER);
      }
      
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
      let errorType = 'Error';
      if (match[0].includes('Cypress could not verify') || match[0].includes('Cypress failed to verify')) {
        errorType = 'CypressServerVerificationError';
      } else if (match[0].includes('Please start this server')) {
        errorType = 'CypressServerNotRunning';
      } else {
        errorType = match[0].split(':')[0] || 'Error';
      }
      
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
  let confidence = CONFIDENCE.BASE;

  // Clear indicators boost confidence
  const indicatorCount = response.indicators?.length || 0;
  confidence += Math.min(indicatorCount * CONFIDENCE.INDICATOR_BONUS, CONFIDENCE.MAX_INDICATOR_BONUS);

  // Evidence boosts confidence
  if (errorData.screenshots?.length) {
    confidence += CONFIDENCE.SCREENSHOT_BONUS;
    if (errorData.screenshots.length > 1) {
      confidence += CONFIDENCE.MULTIPLE_SCREENSHOT_BONUS;
    }
  }

  if (errorData.logs?.length) {
    confidence += CONFIDENCE.LOGS_BONUS;
  }

  if (errorData.prDiff) {
    confidence += CONFIDENCE.PR_DIFF_BONUS;
  }

  if (errorData.framework && errorData.framework !== 'unknown') {
    confidence += CONFIDENCE.FRAMEWORK_BONUS;
  }

  // Cap at maximum confidence
  return Math.min(confidence, CONFIDENCE.MAX_CONFIDENCE);
}

/**
 * Generate a clear, concise summary
 */
function generateSummary(response: OpenAIResponse, errorData: ErrorData): string {
  return generateAnalysisSummary(response, errorData);
}

// extractTestIssueEvidence and categorizeTestIssue are now imported from analysis/error-classifier.ts
