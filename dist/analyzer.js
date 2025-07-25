"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFailure = analyzeFailure;
exports.extractErrorFromLogs = extractErrorFromLogs;
const core = __importStar(require("@actions/core"));
const FEW_SHOT_EXAMPLES = [
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
const LOG_EXTRACTORS = [
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
async function analyzeFailure(client, errorData) {
    try {
        const screenshotInfo = errorData.screenshots && errorData.screenshots.length > 0
            ? ` (with ${errorData.screenshots.length} screenshot${errorData.screenshots.length > 1 ? 's' : ''})`
            : '';
        core.info(`Analyzing error${screenshotInfo}: ${errorData.message.substring(0, 100)}...`);
        const response = await client.analyze(errorData, FEW_SHOT_EXAMPLES);
        const confidence = calculateConfidence(response, errorData);
        const summary = generateSummary(response, errorData);
        return {
            verdict: response.verdict,
            confidence,
            reasoning: response.reasoning,
            summary,
            indicators: response.indicators
        };
    }
    catch (error) {
        core.error(`Analysis failed: ${error}`);
        throw error;
    }
}
function extractErrorFromLogs(logs) {
    for (const extractor of LOG_EXTRACTORS) {
        const errorData = extractor.extract(logs);
        if (errorData) {
            core.info(`Extracted error using ${extractor.framework} patterns`);
            return errorData;
        }
    }
    return extractGenericError(logs);
}
function extractJestError(logs) {
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
function extractCypressError(logs) {
    const cleanLogs = logs.replace(/\x1b\[[0-9;]*m/g, '');
    const failingIndex = cleanLogs.toLowerCase().indexOf('failing');
    if (failingIndex === -1) {
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
                const start = Math.max(0, match.index - 500);
                const end = Math.min(cleanLogs.length, match.index + 2000);
                const errorContext = cleanLogs.substring(start, end);
                const specMatch = cleanLogs.match(/Running:\s+(.+?)\s*(?:\(|$)/);
                const fileName = specMatch ? specMatch[1].trim() : undefined;
                return {
                    message: errorContext,
                    framework: 'cypress',
                    fileName
                };
            }
        }
        return null;
    }
    const contextStart = Math.max(0, failingIndex - 1000);
    const contextEnd = Math.min(cleanLogs.length, failingIndex + 4000);
    let errorContext = cleanLogs.substring(contextStart, contextEnd);
    const afterFailingSection = errorContext.substring(failingIndex - contextStart + 200);
    const endPatterns = [
        /\n\s*\(Run .+ of .+\)/,
        /\n.*\(Run Finished\)/,
        /\n\s+┌[─]+┐/,
        /\n\s+│\s+Tests:/,
        /\n\s*\n\s*\n\s*\n/
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
    const specMatch = cleanLogs.match(/Running:\s+(.+?)\s*(?:\(|$)/);
    const fileName = specMatch ? specMatch[1].trim() : undefined;
    const testMatch = errorContext.match(/\d+\)\s+(.+?)(?:\n|:)/);
    const testName = testMatch ? testMatch[1].trim() : undefined;
    const additionalContext = [];
    const browserMatch = cleanLogs.match(/Browser:\s*([^\n]+)/);
    if (browserMatch) {
        additionalContext.push(`Browser: ${browserMatch[1].trim()}`);
    }
    const suiteMatch = cleanLogs.match(/(?:Running|Spec):\s*([^\n]+)/);
    if (suiteMatch) {
        additionalContext.push(`Test Suite: ${suiteMatch[1].trim()}`);
    }
    const consoleErrorPattern = /cons:error.*?([^\n]+)/g;
    const consoleErrors = [];
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
    const timingMatch = errorContext.match(/(\d+)\s+passing.*?\(([^)]+)\)/);
    if (timingMatch) {
        additionalContext.push(`Execution Time: ${timingMatch[2]}`);
    }
    const cypressCommands = [];
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
    return {
        message: errorContext.trim(),
        framework: 'cypress',
        testName,
        fileName,
        context: additionalContext.length > 0
            ? `Full test failure context. ${additionalContext.join('. ')}`
            : 'Full test failure context for AI analysis'
    };
}
function extractMochaError(logs) {
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
function extractGenericError(logs) {
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
    const lines = logs.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
        return {
            message: lines[0],
            framework: 'unknown'
        };
    }
    return null;
}
function extractStackTrace(content) {
    const stackLines = [];
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.trim().startsWith('at ')) {
            stackLines.push(line);
        }
        else if (stackLines.length > 0) {
            break;
        }
    }
    return stackLines.join('\n');
}
function calculateConfidence(response, errorData) {
    let confidence = 70;
    if (response.indicators && response.indicators.length > 0) {
        confidence += Math.min(response.indicators.length * 5, 20);
    }
    if (errorData.stackTrace) {
        confidence += 5;
    }
    if (errorData.framework && errorData.framework !== 'unknown') {
        confidence += 5;
    }
    if (errorData.screenshots && errorData.screenshots.length > 0) {
        confidence += 10;
        core.info(`Confidence boosted by 10% due to screenshot evidence`);
    }
    if (errorData.screenshots && errorData.screenshots.length > 1) {
        confidence += 5;
    }
    if (errorData.logs && errorData.logs.length > 0) {
        confidence += 3;
    }
    return Math.min(confidence, 100);
}
function generateSummary(response, errorData) {
    const verdictEmoji = response.verdict === 'TEST_ISSUE' ? '🧪' : '🐛';
    const verdictText = response.verdict === 'TEST_ISSUE' ? 'Test Issue' : 'Product Issue';
    let summary = `${verdictEmoji} **${verdictText}**: `;
    const firstSentence = response.reasoning.split(/[.!?]/)[0];
    summary += firstSentence;
    if (errorData.screenshots && errorData.screenshots.length > 0) {
        summary += `\n\n📸 Analysis includes ${errorData.screenshots.length} screenshot${errorData.screenshots.length > 1 ? 's' : ''}`;
    }
    if (response.indicators && response.indicators.length > 0) {
        summary += `\n\nKey indicators: ${response.indicators.slice(0, 3).join(', ')}`;
    }
    return summary;
}
//# sourceMappingURL=analyzer.js.map