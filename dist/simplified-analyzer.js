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
exports.FEW_SHOT_EXAMPLES = void 0;
exports.analyzeFailure = analyzeFailure;
exports.extractErrorFromLogs = extractErrorFromLogs;
const core = __importStar(require("@actions/core"));
const slack_formatter_1 = require("./utils/slack-formatter");
const FEW_SHOT_EXAMPLES = [
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
exports.FEW_SHOT_EXAMPLES = FEW_SHOT_EXAMPLES;
async function analyzeFailure(client, errorData) {
    try {
        core.info(`Analyzing error: ${errorData.message.substring(0, 100)}...`);
        const response = await client.analyze(errorData, FEW_SHOT_EXAMPLES);
        const confidence = calculateConfidence(response, errorData);
        const summary = generateSummary(response, errorData);
        const result = {
            verdict: response.verdict,
            confidence,
            reasoning: response.reasoning,
            summary,
            indicators: response.indicators || [],
            suggestedSourceLocations: response.suggestedSourceLocations
        };
        if (response.verdict === 'TEST_ISSUE') {
            result.evidence = extractTestIssueEvidence(errorData);
            result.category = categorizeTestIssue(errorData);
        }
        return result;
    }
    catch (error) {
        core.error(`Analysis failed: ${error}`);
        throw error;
    }
}
function extractErrorFromLogs(logs) {
    const cleanLogs = logs.replace(/\u001b\[[0-9;]*m/g, '');
    const errorPatterns = [
        { pattern: /TypeError: Cannot read propert(?:y|ies) .+ of (?:null|undefined).*/, framework: 'javascript', priority: 10 },
        { pattern: /TypeError: Cannot access .+ of (?:null|undefined).*/, framework: 'javascript', priority: 10 },
        { pattern: /(AssertionError|CypressError|TimeoutError):\s*(.+)/, framework: 'cypress', priority: 8 },
        { pattern: /Timed out .+ after \d+ms:\s*(.+)/, framework: 'cypress', priority: 8 },
        { pattern: /Expected to find .+:\s*(.+)/, framework: 'cypress', priority: 7 },
        { pattern: /(TypeError|ReferenceError|SyntaxError):\s*(.+)/, framework: 'javascript', priority: 6 },
        { pattern: /Error:\s*(.+)/, framework: 'javascript', priority: 5 },
        { pattern: /✖\s+(.+)/, framework: 'unknown', priority: 3 },
        { pattern: /FAIL\s+(.+)/, framework: 'unknown', priority: 2 },
        { pattern: /Failed:\s*(.+)/, framework: 'unknown', priority: 1 }
    ];
    errorPatterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const { pattern, framework, priority } of errorPatterns) {
        const match = cleanLogs.match(pattern);
        if (match) {
            const beforeError = cleanLogs.substring(Math.max(0, (match.index || 0) - 100), match.index || 0);
            if (beforeError.includes('cy:xhr') && beforeError.includes('Status: 200')) {
                if ((priority || 0) < 5)
                    continue;
            }
            const errorIndex = match.index || 0;
            const contextStart = Math.max(0, errorIndex - 500);
            const contextEnd = Math.min(cleanLogs.length, errorIndex + 1500);
            const errorContext = cleanLogs.substring(contextStart, contextEnd);
            const testNamePatterns = [
                /(?:it|test|describe)\(['"`]([^'"`]+)['"`]/,
                /\d+\)\s+(.+?)(?:\n|$)/,
                /Running test:\s*(.+?)(?:\n|$)/,
                /Test:\s*["']?(.+?)["']?(?:\n|$)/
            ];
            let testName;
            for (const testPattern of testNamePatterns) {
                const testNameMatch = errorContext.match(testPattern);
                if (testNameMatch && testNameMatch[1]) {
                    testName = testNameMatch[1].trim();
                    break;
                }
            }
            const filePatterns = [
                /at\s+.+?\((.+?\.(js|ts|jsx|tsx)):\d+:\d+\)/,
                /(?:Running:|File:|spec:)\s*([^\s]+\.(cy|spec|test)\.[jt]sx?)/,
                /webpack:\/\/[^/]+\/(.+?\.(js|ts|jsx|tsx))/
            ];
            let fileName;
            for (const filePattern of filePatterns) {
                const fileMatch = errorContext.match(filePattern) || cleanLogs.match(filePattern);
                if (fileMatch && fileMatch[1]) {
                    fileName = fileMatch[1];
                    break;
                }
            }
            const errorType = match[0].split(':')[0] || 'Error';
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
    const lines = cleanLogs.split('\n').filter(line => line.trim());
    const errorLine = lines.find(line => /error|fail|assert|expect|timeout/i.test(line));
    if (errorLine) {
        return {
            message: errorLine,
            framework: 'unknown'
        };
    }
    return null;
}
function calculateConfidence(response, errorData) {
    let confidence = 70;
    const indicatorCount = response.indicators?.length || 0;
    confidence += Math.min(indicatorCount * 5, 15);
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
    return Math.min(confidence, 95);
}
function generateSummary(response, errorData) {
    const verdict = response.verdict === 'TEST_ISSUE' ? '🧪 Test Issue' : '🐛 Product Issue';
    const reasoning = response.reasoning.split(/[.!?]/)[0].trim();
    let summary = `${verdict}: ${reasoning}`;
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
    return (0, slack_formatter_1.truncateForSlack)(summary, 1000);
}
function extractTestIssueEvidence(errorData) {
    const evidence = [];
    const selectorMatch = errorData.message.match(/\[([^\]]+)\]|#[\w-]+|\.[\w-]+/);
    if (selectorMatch) {
        evidence.push(`Selector involved: ${selectorMatch[0]}`);
    }
    const timeoutMatch = errorData.message.match(/(\d+)ms/);
    if (timeoutMatch) {
        evidence.push(`Timeout: ${timeoutMatch[0]}`);
    }
    if (/not visible|covered|hidden|display:\s*none/.test(errorData.message)) {
        evidence.push('Element visibility issue detected');
    }
    if (/async|await|promise|then/.test(errorData.message)) {
        evidence.push('Possible async/timing issue');
    }
    return evidence;
}
function categorizeTestIssue(errorData) {
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
//# sourceMappingURL=simplified-analyzer.js.map