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
    error: 'WebDriverError: The test session has already finished, and can\'t receive further commands',
    verdict: 'INCONCLUSIVE',
    reasoning: 'The remote browser session terminated unexpectedly, so there is not enough evidence to blame either the test or the product.'
  },
  {
    error: 'We detected that the Chromium Renderer process just crashed.',
    verdict: 'INCONCLUSIVE',
    reasoning: 'The browser renderer crashed during execution. This is an infrastructure failure, not a test or product defect.'
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
  },
  {
    error: 'Timed out retrying after 15000ms: Expected to find element: #password, but never found it (from cypress/support/commands.js:232)',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Login page failed to render form fields. The #password selector is correct and stable — when the login page does not render at all, the application deployment is broken (e.g., wrong API endpoint, missing env vars). This is not a test selector issue.'
  }
];

const INFRASTRUCTURE_FAILURE_PATTERNS = [
  // ── Sauce Labs / WebDriver session patterns ──
  {
    pattern: /The test session has already finished,? and can't receive further commands/i,
    indicator: 'WebDriver session finished before the next command could run'
  },
  {
    pattern: /Request failed with status 400 due to session is finished/i,
    indicator: 'WebDriver command failed because the remote session was already finished'
  },
  {
    pattern: /Requested session id [a-z0-9-]+ is not known/i,
    indicator: 'Remote provider no longer recognized the browser session'
  },
  {
    pattern: /Test did not see a new command for 90 seconds\. Timing out\./i,
    indicator: 'Sauce Labs idle timeout terminated the session'
  },
  {
    pattern: /session deleted because of timeout/i,
    indicator: 'Remote browser session was deleted after timing out'
  },
  {
    pattern: /Session \[[^\]]+\] was terminated \(timeout\)/i,
    indicator: 'Sauce Labs reported the session was terminated due to timeout'
  },
  {
    // Broad catch-all; the specific patterns above cover known Sauce Labs / WebDriver
    // variants. This exists as a safety net but may match non-actionable log output.
    pattern: /\bsession is finished\b/i,
    indicator: 'Remote browser session ended unexpectedly'
  },

  // ── Cypress / browser infrastructure patterns ──
  {
    pattern: /We detected that the .+ Renderer process just crashed/i,
    indicator: 'Browser renderer process crashed during test execution'
  },
  {
    pattern: /browser was not open when cypress attempted to reconnect/i,
    indicator: 'Cypress lost connection to the browser process'
  },
  {
    pattern: /Cypress process timed out waiting for the browser to ever open/i,
    indicator: 'Browser failed to launch within the expected timeout'
  },
  {
    pattern: /The cypress runner was force-killed/i,
    indicator: 'Cypress runner was terminated by the CI environment'
  },
  {
    pattern: /The test runner unexpectedly exited/i,
    indicator: 'Test runner process exited unexpectedly'
  }
] as const;

const INFRASTRUCTURE_FAILURE_REGEX = new RegExp(
  INFRASTRUCTURE_FAILURE_PATTERNS.map(({ pattern }) => pattern.source).join('|'),
  'i'
);

const STRONG_PRODUCT_SIGNAL_PATTERNS = [
  /Internal Server Error/i,
  /\bstatus 5\d\d\b/i,
  /\bECONNREFUSED\b/i,
  /\bGraphQL(?:\s+|)error\b/i,
  /\bCypress could not verify that this server is running\b/i,
  /\bFailed to fetch\b/i,
  /\bnet::ERR_/i,
  /\bCORS\b.*\berror\b/i
];

/**
 * Main analysis function - simplified version
 */
export async function analyzeFailure(client: OpenAIClient, errorData: ErrorData): Promise<AnalysisResult> {
  try {
    core.info(`Analyzing error: ${errorData.message.substring(0, 100)}...`);

    const infrastructureHeuristic = detectInfrastructureFailure(errorData);
    if (infrastructureHeuristic) {
      core.info('Detected remote session termination pattern; returning INCONCLUSIVE without auto-fix.');

      return {
        verdict: infrastructureHeuristic.verdict,
        confidence: 95,
        reasoning: infrastructureHeuristic.reasoning,
        summary: generateSummary(infrastructureHeuristic, errorData),
        indicators: infrastructureHeuristic.indicators
      };
    }
    
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
    
    // WDIO / Mocha errors (describe, hooks, spec titles)
    { pattern: /Error in ["'].*?["']\s*:\s*(.+)/, framework: 'webdriverio', priority: 10 },
    { pattern: /Error in ["'](?:before all|before each|after all|after each)["'].*?:\s*(.+)/, framework: 'webdriverio', priority: 10 },
    // WDIO Error in "test name" on its own line (error message follows on next line)
    { pattern: /\[[\d-]+\]\s*Error in ["'](.+?)["']\s*$/m, framework: 'webdriverio', priority: 11 },
    // Remote session/provider/browser failures should outrank transient element errors.
    // Framework is set to 'unknown' because the regex covers both WDIO and Cypress patterns;
    // the actual framework is determined by other matched patterns or the action input.
    { pattern: INFRASTRUCTURE_FAILURE_REGEX, framework: 'unknown', priority: 11 },
    // WDIO FAILED in MultiRemote
    { pattern: /FAILED in (?:MultiRemote|chrome|firefox|safari)\s*-\s*file:\/\/\/(.+)/, framework: 'webdriverio', priority: 9 },
    
    // WDIO waitFor timeout (element ("selector") still not visible after N ms)
    { pattern: /element\s*\([^)]+\)\s+still not (?:visible|displayed|enabled|existing|clickable).+after\s+\d+\s*ms/i, framework: 'webdriverio', priority: 9 },
    { pattern: /(?:waitForDisplayed|waitForExist|waitForClickable|waitForEnabled).+timeout/i, framework: 'webdriverio', priority: 9 },
    
    // Selenium / WebDriver errors
    { pattern: /stale element reference/i, framework: 'webdriverio', priority: 9 },
    { pattern: /no such element: Unable to locate element/i, framework: 'webdriverio', priority: 9 },
    { pattern: /element not interactable/i, framework: 'webdriverio', priority: 9 },
    { pattern: /(WebDriverError|ProtocolError|SauceLabsError):\s*(.+)/, framework: 'webdriverio', priority: 8 },
    
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

  for (const { pattern, framework: patternFramework, priority } of errorPatterns) {
    const match = cleanLogs.match(pattern);
    if (match) {
      // Skip XHR/network logs that aren't actual errors
      const beforeError = cleanLogs.substring(Math.max(0, (match.index || 0) - 100), match.index || 0);
      if (beforeError.includes('cy:xhr') && beforeError.includes('Status: 200')) {
        // This might be a log line, not an actual error - skip if low priority
        if ((priority || 0) < 5) continue;
      }

      // Infrastructure patterns use framework 'unknown'; infer from match content.
      let framework = patternFramework;
      if (framework === 'unknown' && INFRASTRUCTURE_FAILURE_REGEX.test(match[0])) {
        if (/cypress|chromium|renderer/i.test(match[0])) {
          framework = 'cypress';
        } else if (/webdriver|sauce|selenium|ProtocolError|SauceLabsError|session/i.test(match[0])) {
          framework = 'webdriverio';
        }
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
        /Error in ["'](.+?)["']/,  // WDIO Error in "test name"
        /✖\s+(.+?)(?:\n|$)/,  // WDIO/Mocha ✖ test name
        /FAILED in .+? - file:\/\/\/.+?\/([^/]+\.[jt]sx?)$/m,  // WDIO FAILED in ... - file
        /(?:it|test|describe)\(['"`]([^'"`]+)['"`]/,
        /\d+\)\s+(.+?)(?:\n|$)/,
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
        /FAILED in .+? - file:\/\/\/(.+?\.[jt]sx?)/,  // WDIO FAILED line
        /(?:Running:|File:|spec:)\s*([^\s]+\.[jt]sx?)/,
        /»\s+\/?(test\/.+?\.[jt]sx?)/,  // WDIO spec reporter: » /test/specs/...
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
      } else if (INFRASTRUCTURE_FAILURE_REGEX.test(match[0])) {
        errorType = 'InfrastructureFailure';
      } else if (/Error in ["']/.test(match[0]) || /FAILED in (?:MultiRemote|chrome|firefox|safari)/.test(match[0])) {
        // WDIO "Error in "test"" or "FAILED in MultiRemote" - underlying error is typically Error
        errorType = 'Error';
      } else {
        errorType = match[0].split(':')[0].trim() || 'Error';
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

function detectInfrastructureFailure(errorData: ErrorData): OpenAIResponse | null {
  const combinedContext = [
    errorData.message,
    errorData.stackTrace,
    errorData.context,
    errorData.logs?.join('\n'),
    errorData.testArtifactLogs
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');

  if (!combinedContext) {
    return null;
  }

  const hasTestExecutionContext =
    errorData.framework === 'webdriverio' ||
    errorData.framework === 'cypress' ||
    /webdriver|webdriverio|selenium|sauce labs|saucelabs|ondemand\.[\w.-]*saucelabs\.com|cypress|chromium|chrome(?:driver)?/i.test(
      combinedContext
    );

  if (!hasTestExecutionContext) {
    return null;
  }

  const indicators = INFRASTRUCTURE_FAILURE_PATTERNS
    .filter(({ pattern }) => pattern.test(combinedContext))
    .map(({ indicator }) => indicator);

  if (indicators.length === 0) {
    return null;
  }

  // Only check the extracted error message (not the full combined context) — the
  // message is the primary signal; scanning all logs would be too noisy.
  const extractedMessage = errorData.message || '';
  const hasStrongProductSignal = STRONG_PRODUCT_SIGNAL_PATTERNS.some((pattern) =>
    pattern.test(extractedMessage)
  );

  if (hasStrongProductSignal) {
    return null;
  }

  return {
    verdict: 'INCONCLUSIVE',
    reasoning:
      'Detected browser or session infrastructure failure signals before the test flow completed. This points to execution infrastructure (browser crash, session termination, or provider instability) rather than an actionable test or product defect, so this failure should remain inconclusive and must not trigger auto-fix.',
    indicators: Array.from(new Set(indicators))
  };
}
