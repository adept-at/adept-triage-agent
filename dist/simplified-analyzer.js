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
const summary_generator_1 = require("./analysis/summary-generator");
const error_classifier_1 = require("./analysis/error-classifier");
const constants_1 = require("./config/constants");
const FEW_SHOT_EXAMPLES = [
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
    }
];
const INFRASTRUCTURE_FAILURE_PATTERNS = [
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
        pattern: /\bsession is finished\b/i,
        indicator: 'Remote browser session ended unexpectedly'
    },
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
];
const INFRASTRUCTURE_FAILURE_REGEX = new RegExp(INFRASTRUCTURE_FAILURE_PATTERNS.map(({ pattern }) => pattern.source).join('|'), 'i');
const STRONG_PRODUCT_SIGNAL_PATTERNS = [
    /Internal Server Error/i,
    /\bstatus 5\d\d\b/i,
    /\bECONNREFUSED\b/i,
    /\bGraphQL(?:\s+|)error\b/i,
    /\bCypress could not verify that this server is running\b/i
];
async function analyzeFailure(client, errorData) {
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
            result.evidence = (0, error_classifier_1.extractTestIssueEvidence)(errorData.message);
            result.category = (0, error_classifier_1.categorizeTestIssue)(errorData.message);
        }
        return result;
    }
    catch (error) {
        core.error(`Analysis failed: ${error}`);
        throw error;
    }
}
function extractErrorFromLogs(logs) {
    const esc = String.fromCharCode(27);
    const ansiPattern = new RegExp(`${esc}\\[[0-9;]*m`, 'g');
    const cleanLogs = logs.replace(ansiPattern, '');
    const errorPatterns = [
        { pattern: /Cypress could not verify that this server is running.*/, framework: 'cypress', priority: 12 },
        { pattern: /Cypress failed to verify that your server is running.*/, framework: 'cypress', priority: 12 },
        { pattern: /Please start this server and then run Cypress again.*/, framework: 'cypress', priority: 11 },
        { pattern: /Error in ["'].*?["']\s*:\s*(.+)/, framework: 'webdriverio', priority: 10 },
        { pattern: /Error in ["'](?:before all|before each|after all|after each)["'].*?:\s*(.+)/, framework: 'webdriverio', priority: 10 },
        { pattern: /\[[\d-]+\]\s*Error in ["'](.+?)["']\s*$/m, framework: 'webdriverio', priority: 11 },
        { pattern: INFRASTRUCTURE_FAILURE_REGEX, framework: 'unknown', priority: 11 },
        { pattern: /FAILED in (?:MultiRemote|chrome|firefox|safari)\s*-\s*file:\/\/\/(.+)/, framework: 'webdriverio', priority: 9 },
        { pattern: /element\s*\([^)]+\)\s+still not (?:visible|displayed|enabled|existing|clickable).+after\s+\d+\s*ms/i, framework: 'webdriverio', priority: 9 },
        { pattern: /(?:waitForDisplayed|waitForExist|waitForClickable|waitForEnabled).+timeout/i, framework: 'webdriverio', priority: 9 },
        { pattern: /stale element reference/i, framework: 'webdriverio', priority: 9 },
        { pattern: /no such element: Unable to locate element/i, framework: 'webdriverio', priority: 9 },
        { pattern: /element not interactable/i, framework: 'webdriverio', priority: 9 },
        { pattern: /(WebDriverError|ProtocolError|SauceLabsError):\s*(.+)/, framework: 'webdriverio', priority: 8 },
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
    for (const { pattern, framework: patternFramework, priority } of errorPatterns) {
        const match = cleanLogs.match(pattern);
        if (match) {
            const beforeError = cleanLogs.substring(Math.max(0, (match.index || 0) - 100), match.index || 0);
            if (beforeError.includes('cy:xhr') && beforeError.includes('Status: 200')) {
                if ((priority || 0) < 5)
                    continue;
            }
            let framework = patternFramework;
            if (framework === 'unknown' && INFRASTRUCTURE_FAILURE_REGEX.test(match[0])) {
                if (/cypress|chromium|renderer/i.test(match[0])) {
                    framework = 'cypress';
                }
                else if (/webdriver|sauce|selenium|ProtocolError|SauceLabsError|session/i.test(match[0])) {
                    framework = 'webdriverio';
                }
            }
            const errorIndex = match.index || 0;
            let contextStart = Math.max(0, errorIndex - constants_1.LOG_LIMITS.ERROR_CONTEXT_BEFORE);
            let contextEnd = Math.min(cleanLogs.length, errorIndex + constants_1.LOG_LIMITS.ERROR_CONTEXT_AFTER);
            if (match[0].includes('Cypress could not verify') || match[0].includes('Cypress failed to verify')) {
                contextStart = Math.max(0, errorIndex - constants_1.LOG_LIMITS.SERVER_ERROR_CONTEXT_BEFORE);
                contextEnd = Math.min(cleanLogs.length, errorIndex + constants_1.LOG_LIMITS.SERVER_ERROR_CONTEXT_AFTER);
            }
            const errorContext = cleanLogs.substring(contextStart, contextEnd);
            const testNamePatterns = [
                /Error in ["'](.+?)["']/,
                /✖\s+(.+?)(?:\n|$)/,
                /FAILED in .+? - file:\/\/\/.+?\/([^/]+\.[jt]sx?)$/m,
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
                /FAILED in .+? - file:\/\/\/(.+?\.[jt]sx?)/,
                /(?:Running:|File:|spec:)\s*([^\s]+\.[jt]sx?)/,
                /»\s+\/?(test\/.+?\.[jt]sx?)/,
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
            let errorType = 'Error';
            if (match[0].includes('Cypress could not verify') || match[0].includes('Cypress failed to verify')) {
                errorType = 'CypressServerVerificationError';
            }
            else if (match[0].includes('Please start this server')) {
                errorType = 'CypressServerNotRunning';
            }
            else if (INFRASTRUCTURE_FAILURE_REGEX.test(match[0])) {
                errorType = 'InfrastructureFailure';
            }
            else if (/Error in ["']/.test(match[0]) || /FAILED in (?:MultiRemote|chrome|firefox|safari)/.test(match[0])) {
                errorType = 'Error';
            }
            else {
                errorType = match[0].split(':')[0].trim() || 'Error';
            }
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
    let confidence = constants_1.CONFIDENCE.BASE;
    const indicatorCount = response.indicators?.length || 0;
    confidence += Math.min(indicatorCount * constants_1.CONFIDENCE.INDICATOR_BONUS, constants_1.CONFIDENCE.MAX_INDICATOR_BONUS);
    if (errorData.screenshots?.length) {
        confidence += constants_1.CONFIDENCE.SCREENSHOT_BONUS;
        if (errorData.screenshots.length > 1) {
            confidence += constants_1.CONFIDENCE.MULTIPLE_SCREENSHOT_BONUS;
        }
    }
    if (errorData.logs?.length) {
        confidence += constants_1.CONFIDENCE.LOGS_BONUS;
    }
    if (errorData.prDiff) {
        confidence += constants_1.CONFIDENCE.PR_DIFF_BONUS;
    }
    if (errorData.framework && errorData.framework !== 'unknown') {
        confidence += constants_1.CONFIDENCE.FRAMEWORK_BONUS;
    }
    return Math.min(confidence, constants_1.CONFIDENCE.MAX_CONFIDENCE);
}
function generateSummary(response, errorData) {
    return (0, summary_generator_1.generateAnalysisSummary)(response, errorData);
}
function detectInfrastructureFailure(errorData) {
    const combinedContext = [
        errorData.message,
        errorData.stackTrace,
        errorData.context,
        errorData.logs?.join('\n'),
        errorData.testArtifactLogs
    ]
        .filter((value) => Boolean(value))
        .join('\n');
    if (!combinedContext) {
        return null;
    }
    const hasTestExecutionContext = errorData.framework === 'webdriverio' ||
        errorData.framework === 'cypress' ||
        /webdriver|webdriverio|selenium|sauce labs|saucelabs|ondemand\.[\w.-]*saucelabs\.com|cypress|chromium|chrome(?:driver)?/i.test(combinedContext);
    if (!hasTestExecutionContext) {
        return null;
    }
    const indicators = INFRASTRUCTURE_FAILURE_PATTERNS
        .filter(({ pattern }) => pattern.test(combinedContext))
        .map(({ indicator }) => indicator);
    if (indicators.length === 0) {
        return null;
    }
    const extractedMessage = errorData.message || '';
    const hasStrongProductSignal = STRONG_PRODUCT_SIGNAL_PATTERNS.some((pattern) => pattern.test(extractedMessage));
    if (hasStrongProductSignal) {
        return null;
    }
    return {
        verdict: 'INCONCLUSIVE',
        reasoning: 'Detected browser or session infrastructure failure signals before the test flow completed. This points to execution infrastructure (browser crash, session termination, or provider instability) rather than an actionable test or product defect, so this failure should remain inconclusive and must not trigger auto-fix.',
        indicators: Array.from(new Set(indicators))
    };
}
//# sourceMappingURL=simplified-analyzer.js.map