import { OpenAIClient } from './openai-client';
import { AnalysisResult, ErrorData, FewShotExample, LogExtractor, OpenAIResponse } from './types';
import * as core from '@actions/core';

const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    error: 'TimeoutError: Waiting for element to be visible: #submit-button',
    verdict: 'TEST_ISSUE',
    reasoning: 'The error indicates a UI element timing issue, which is typically a test synchronization problem rather than a product bug.'
  },
  {
    error: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Database connection refused indicates the application cannot connect to its database, which is a product infrastructure issue.'
  },
  {
    error: 'AssertionError: expected mock function to have been called with "user123"',
    verdict: 'TEST_ISSUE',
    reasoning: 'Mock expectation failure suggests incorrect test setup or assertions rather than product code issues.'
  },
  {
    error: 'CypressError: Timed out retrying after 4000ms: expected button to be visible',
    verdict: 'TEST_ISSUE',
    reasoning: 'Cypress timeout waiting for visibility typically indicates test flakiness or missing wait commands rather than actual product issues.'
  },
  {
    error: 'AssertionError: Timed out retrying after 4000ms: Expected to find content: "Welcome" but never did',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Missing expected content after proper wait time suggests the application is not rendering the expected text, indicating a product issue.'
  },
  {
    error: 'CypressError: cy.click() failed because this element is detached from the DOM',
    verdict: 'TEST_ISSUE',
    reasoning: 'DOM detachment errors usually indicate race conditions in tests where elements are accessed before they are stable.'
  },
  {
    error: 'Error: Network request failed with status 500: Internal Server Error',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'HTTP 500 errors indicate server-side failures in the application, which are product issues.'
  },
  {
    error: 'CypressError: cy.visit() failed trying to load: http://localhost:3000 - Connection refused',
    verdict: 'PRODUCT_ISSUE',
    reasoning: 'Connection refused when visiting the application URL indicates the application server is not running or accessible.'
  }
];

const LOG_EXTRACTORS: LogExtractor[] = [
  {
    framework: 'jest',
    patterns: [
      /FAIL\s+(.+)\s+\([\d.]+\s*s\)\s*\n\s*●\s*(.+)\s*\n\s*([\s\S]+?)(?=\n\s*(?:PASS|FAIL|$))/g,
      /Error:\s*(.+)\n\s*at\s+(.+)/g
    ],
    extract: extractJestError
  },
  {
    framework: 'cypress',
    patterns: [
      /\d+\)\s+.+\s*\n\s*(?:✖|×|✗|Failed:|FAILED:)\s*.+/g,
      /(AssertionError|CypressError|TimeoutError|TypeError|Error):\s*(.+)\n/g,
      /Timed out .+ after \d+ms:/g,
      /(?:✖|×|✗|FAIL|Failed)\s+.+?\s*\(\d+(?:\.\d+)?s?\)/g,
      /\d+\)\s+.+:\s*\n\s*(TypeError|ReferenceError|SyntaxError):\s*(.+)/g
    ],
    extract: extractCypressError
  },
  {
    framework: 'mocha',
    patterns: [
      /\d+\)\s+(.+):\s*\n\s*(.+)\n([\s\S]+?)(?=\n\s*at)/g,
      /Error:\s*(.+)\n\s*at\s+(.+)/g
    ],
    extract: extractMochaError
  }
];

export async function analyzeFailure(client: OpenAIClient, errorData: ErrorData): Promise<AnalysisResult> {
  try {
    const screenshotInfo = errorData.screenshots && errorData.screenshots.length > 0
      ? ` (with ${errorData.screenshots.length} screenshot${errorData.screenshots.length > 1 ? 's' : ''})`
      : '';
    
    core.info(`Analyzing error${screenshotInfo}: ${errorData.message.substring(0, 100)}...`);
    
    // Get AI analysis
    const response = await client.analyze(errorData, FEW_SHOT_EXAMPLES);
    
    // Calculate confidence based on various factors
    const confidence = calculateConfidence(response, errorData);
    
    // Generate summary
    const summary = generateSummary(response, errorData);
    
    return {
      verdict: response.verdict,
      confidence,
      reasoning: response.reasoning,
      summary,
      indicators: response.indicators
    };
  } catch (error) {
    core.error(`Analysis failed: ${error}`);
    throw error;
  }
}

export function extractErrorFromLogs(logs: string): ErrorData | null {
  // Try each extractor
  for (const extractor of LOG_EXTRACTORS) {
    const errorData = extractor.extract(logs);
    if (errorData) {
      core.info(`Extracted error using ${extractor.framework} patterns`);
      return errorData;
    }
  }
  
  // Fallback to generic extraction
  return extractGenericError(logs);
}

function extractJestError(logs: string): ErrorData | null {
  const failPattern = /FAIL\s+(.+)\s+\([\d.]+\s*s\)\s*\n\s*●\s*(.+)\s*\n\s*([\s\S]+?)(?=\n\s*(?:PASS|FAIL|Test Suites:|$))/;
  const match = logs.match(failPattern);
  
  if (match) {
    const [, fileName, testName, errorContent] = match;
    const errorMessage = errorContent.trim().split('\n')[0];
    const stackTrace = extractStackTrace(errorContent);
    
    return {
      message: errorMessage,
      stackTrace,
      framework: 'jest',
      testName,
      fileName
    };
  }
  
  return null;
}

function extractCypressError(logs: string): ErrorData | null {
  // Strip ANSI color codes for cleaner text
  // eslint-disable-next-line no-control-regex
  const cleanLogs = logs.replace(/\u001b\[[0-9;]*m/g, '');
  
  // Find the "failing" section - this is where Cypress reports test failures
  const failingIndex = cleanLogs.toLowerCase().indexOf('failing');
  if (failingIndex === -1) {
    // Fallback: look for other failure indicators
    const failurePatterns = [
      /\d+\)\s+.*?\n.*?Error:/i,
      /AssertionError:/i,
      /CypressError:/i,
      /TimeoutError:/i,
      /Test failed:/i,
      /✖|×|✗|FAIL/
    ];
    
    for (const pattern of failurePatterns) {
      const match = cleanLogs.match(pattern);
      if (match && match.index !== undefined) {
        // Extract context around the error (500 chars before, 2000 after)
        const start = Math.max(0, match.index - 500);
        const end = Math.min(cleanLogs.length, match.index + 2000);
        const errorContext = cleanLogs.substring(start, end);
        
        // Extract spec file name if available
        const specMatch = cleanLogs.match(/Running:\s+(.+?)\s*(?:\(|$)/);
        const fileName = specMatch ? specMatch[1].trim() : undefined;
        
        // Extract failure type
        let failureType: string | undefined;
        const errorTypeMatch = errorContext.match(/(?:^|\n)\s*(\w+Error):/);
        if (errorTypeMatch) {
          failureType = errorTypeMatch[1];
        }
        
        return {
          message: errorContext,
          framework: 'cypress',
          fileName,
          failureType
        };
      }
    }
    return null;
  }
  
  // Extract a good chunk of context around the failing section
  // Start further back to capture test setup and execution context
  const contextStart = Math.max(0, failingIndex - 1000); // Increased to capture more pre-failure context including test steps
  const contextEnd = Math.min(cleanLogs.length, failingIndex + 4000); // Get plenty of context including full error
  
  let errorContext = cleanLogs.substring(contextStart, contextEnd);
  
  // Look for clear end boundaries after the error details
  // Start searching after the "failing" word to avoid premature truncation
  const afterFailingSection = errorContext.substring(failingIndex - contextStart + 200);
  const endPatterns = [
    /\n\s*\(Run .+ of .+\)/, // Run summary
    /\n.*\(Run Finished\)/, // Run finished marker
    /\n\s+┌[─]+┐/, // Cypress table borders
    /\n\s+│\s+Tests:/, // Test summary table
    /\n\s*\n\s*\n\s*\n/ // Multiple blank lines (3+)
  ];
  
  let earliestEnd = errorContext.length;
  for (const pattern of endPatterns) {
    const endMatch = afterFailingSection.match(pattern);
    if (endMatch && endMatch.index !== undefined) {
      const absoluteIndex = (failingIndex - contextStart + 200) + endMatch.index;
      if (absoluteIndex < earliestEnd) {
        earliestEnd = absoluteIndex;
      }
    }
  }
  
  errorContext = errorContext.substring(0, earliestEnd);
  
  // Extract spec file name if available
  const specMatch = cleanLogs.match(/Running:\s+(.+?)\s*(?:\(|$)/);
  const fileName = specMatch ? specMatch[1].trim() : undefined;
  
  // Extract any test name if visible
  const testMatch = errorContext.match(/\d+\)\s+(.+?)(?:\n|:)/);
  const testName = testMatch ? testMatch[1].trim() : undefined;
  
  // Extract additional contextual information from the full logs
  const additionalContext: string[] = [];
  
  // Look for browser/environment info
  const browserMatch = cleanLogs.match(/Browser:\s*([^\n]+)/);
  if (browserMatch) {
    additionalContext.push(`Browser: ${browserMatch[1].trim()}`);
  }
  
  // Look for test suite information
  const suiteMatch = cleanLogs.match(/(?:Running|Spec):\s*([^\n]+)/);
  if (suiteMatch) {
    additionalContext.push(`Test Suite: ${suiteMatch[1].trim()}`);
  }
  
  // Look for any console errors near the failure (but not the generic "Invalid message")
  const consoleErrorPattern = /cons:error.*?([^\n]+)/g;
  const consoleErrors: string[] = [];
  let consoleMatch;
  while ((consoleMatch = consoleErrorPattern.exec(errorContext)) !== null) {
    const errorMsg = consoleMatch[1].trim();
    if (!consoleErrors.includes(errorMsg) && 
        errorMsg !== 'Error: Invalid message' &&
        errorMsg.includes('GraphqlError')) {
      consoleErrors.push(errorMsg);
    }
  }
  if (consoleErrors.length > 0) {
    additionalContext.push(`GraphQL Errors during test: ${consoleErrors.join(', ')}`);
  }
  
  // Look for test execution time
  const timingMatch = errorContext.match(/(\d+)\s+passing.*?\(([^)]+)\)/);
  if (timingMatch) {
    additionalContext.push(`Execution Time: ${timingMatch[2]}`);
  }
  
  // Extract Cypress commands that were executed before failure
  const cypressCommands: string[] = [];
  const commandPattern = /cy:command\s+[✔✖]\s+(\w+)\s+([^\n]+)/g;
  let commandMatch;
  let commandCount = 0;
  while ((commandMatch = commandPattern.exec(errorContext)) !== null && commandCount < 20) {
    const command = `${commandMatch[1]} ${commandMatch[2].trim()}`;
    if (!cypressCommands.includes(command)) {
      cypressCommands.push(command);
      commandCount++;
    }
  }
  if (cypressCommands.length > 0) {
    additionalContext.push(`Recent Cypress commands: ${cypressCommands.slice(-10).join(', ')}`);
  }
  
  // Extract failure type (e.g., AssertionError, TimeoutError, etc.)
  let failureType: string | undefined;
  const errorTypeMatch = errorContext.match(/(?:^|\n)\s*(\w+Error):/);
  if (errorTypeMatch) {
    failureType = errorTypeMatch[1];
  }

  return {
    message: errorContext.trim(),
    framework: 'cypress',
    testName,
    fileName,
    failureType,
    context: additionalContext.length > 0 
      ? `Full test failure context. ${additionalContext.join('. ')}` 
      : 'Full test failure context for AI analysis'
  };
}

function extractMochaError(logs: string): ErrorData | null {
  const errorPattern = /\d+\)\s+(.+):\s*\n\s*(.+)\n([\s\S]+?)(?=\n\s*at)/;
  const match = logs.match(errorPattern);
  
  if (match) {
    const [, testName, errorMessage, content] = match;
    const stackTrace = extractStackTrace(content);
    
    return {
      message: errorMessage,
      stackTrace,
      framework: 'mocha',
      testName
    };
  }
  
  return null;
}

function extractGenericError(logs: string): ErrorData | null {
  // Look for common error patterns
  const errorPatterns = [
    /Error:\s*(.+)/,
    /Failed:\s*(.+)/,
    /Exception:\s*(.+)/,
    /FAILED:\s*(.+)/
  ];
  
  for (const pattern of errorPatterns) {
    const match = logs.match(pattern);
    if (match) {
      const message = match[1];
      const stackTrace = extractStackTrace(logs.substring(match.index || 0));
      
      return {
        message,
        stackTrace,
        framework: 'unknown'
      };
    }
  }
  
  // If no pattern matches, take the first non-empty line as the error
  const lines = logs.split('\n').filter(line => line.trim());
  if (lines.length > 0) {
    return {
      message: lines[0],
      framework: 'unknown'
    };
  }
  
  return null;
}

function extractStackTrace(content: string): string {
  const stackLines: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.trim().startsWith('at ')) {
      stackLines.push(line);
    } else if (stackLines.length > 0) {
      // Stop collecting once we hit a non-stack line after starting
      break;
    }
  }
  
  return stackLines.join('\n');
}

function calculateConfidence(response: OpenAIResponse, errorData: ErrorData): number {
  let confidence = 70; // Base confidence
  
  // Increase confidence based on clear indicators
  if (response.indicators && response.indicators.length > 0) {
    confidence += Math.min(response.indicators.length * 5, 20);
  }
  
  // Increase confidence if we have a stack trace
  if (errorData.stackTrace) {
    confidence += 5;
  }
  
  // Increase confidence if we detected the framework
  if (errorData.framework && errorData.framework !== 'unknown') {
    confidence += 5;
  }
  
  // Significant boost for screenshot evidence
  if (errorData.screenshots && errorData.screenshots.length > 0) {
    confidence += 10;
    core.info(`Confidence boosted by 10% due to screenshot evidence`);
  }
  
  // Additional boost for multiple screenshots showing the issue
  if (errorData.screenshots && errorData.screenshots.length > 1) {
    confidence += 5;
  }
  
  // Increase confidence if we have additional log context
  if (errorData.logs && errorData.logs.length > 0) {
    confidence += 3;
  }
  
  // Cap at 100
  return Math.min(confidence, 100);
}

function generateSummary(response: OpenAIResponse, errorData: ErrorData): string {
  const verdictEmoji = response.verdict === 'TEST_ISSUE' ? '🧪' : '🐛';
  const verdictText = response.verdict === 'TEST_ISSUE' ? 'Test Issue' : 'Product Issue';
  
  let summary = `${verdictEmoji} **${verdictText}**: `;
  
  // Extract the first sentence or key point from reasoning
  const firstSentence = response.reasoning.split(/[.!?]/)[0];
  summary += firstSentence;
  
  // Add screenshot context if available
  if (errorData.screenshots && errorData.screenshots.length > 0) {
    summary += `\n\n📸 Analysis includes ${errorData.screenshots.length} screenshot${errorData.screenshots.length > 1 ? 's' : ''}`;
  }
  
  if (response.indicators && response.indicators.length > 0) {
    summary += `\n\nKey indicators: ${response.indicators.slice(0, 3).join(', ')}`;
  }
  
  return summary;
} 