"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyErrorType = classifyErrorType;
exports.categorizeTestIssue = categorizeTestIssue;
exports.extractSelector = extractSelector;
exports.extractTestIssueEvidence = extractTestIssueEvidence;
const constants_1 = require("../config/constants");
function classifyErrorType(error) {
    const errorLower = error.toLowerCase();
    if (errorLower.includes('expected to find element') ||
        errorLower.includes('element not found') ||
        errorLower.includes('could not find element') ||
        errorLower.includes('never found it')) {
        return constants_1.ERROR_TYPES.ELEMENT_NOT_FOUND;
    }
    if (errorLower.includes('element is not visible') ||
        errorLower.includes('is not visible') ||
        errorLower.includes('visibility: hidden') ||
        errorLower.includes('element exists but is not visible')) {
        return constants_1.ERROR_TYPES.ELEMENT_NOT_VISIBLE;
    }
    if (errorLower.includes('covered by another element') ||
        errorLower.includes('element is covered')) {
        return constants_1.ERROR_TYPES.ELEMENT_COVERED;
    }
    if (errorLower.includes('detached from the dom') ||
        errorLower.includes('element is detached')) {
        return constants_1.ERROR_TYPES.ELEMENT_DETACHED;
    }
    if (errorLower.includes('can only be called on') ||
        errorLower.includes('invalid element type')) {
        return constants_1.ERROR_TYPES.INVALID_ELEMENT_TYPE;
    }
    if (errorLower.includes('timed out') ||
        errorLower.includes('timeouterror') ||
        errorLower.includes('timeout of') ||
        errorLower.includes('operation timed out')) {
        return constants_1.ERROR_TYPES.TIMEOUT;
    }
    if (errorLower.includes('assertionerror') ||
        errorLower.includes('expected') ||
        errorLower.includes('assert.equal') ||
        errorLower.includes('to be truthy')) {
        return constants_1.ERROR_TYPES.ASSERTION_FAILED;
    }
    if (errorLower.includes('network') ||
        errorLower.includes('fetch') ||
        errorLower.includes('err_network')) {
        return constants_1.ERROR_TYPES.NETWORK_ERROR;
    }
    return constants_1.ERROR_TYPES.UNKNOWN;
}
function categorizeTestIssue(errorMessage) {
    const message = errorMessage.toLowerCase();
    if (/element.*not found|could not find|never found/.test(message)) {
        return constants_1.TEST_ISSUE_CATEGORIES.ELEMENT_NOT_FOUND;
    }
    if (/timeout|timed out/.test(message)) {
        return constants_1.TEST_ISSUE_CATEGORIES.TIMEOUT;
    }
    if (/not visible|visibility|covered|hidden/.test(message)) {
        return constants_1.TEST_ISSUE_CATEGORIES.VISIBILITY;
    }
    if (/assertion|expected.*to/.test(message)) {
        return constants_1.TEST_ISSUE_CATEGORIES.ASSERTION;
    }
    if (/network|fetch|api|request/.test(message)) {
        return constants_1.TEST_ISSUE_CATEGORIES.NETWORK;
    }
    return constants_1.TEST_ISSUE_CATEGORIES.UNKNOWN;
}
function extractSelector(error) {
    const priorityPatterns = [
        /\b([a-zA-Z]+\[data-testid=["'][^"']+["']\])/g,
        /\b([a-zA-Z]+\[data-test=["'][^"']+["']\])/g,
        /\[data-testid=["']([^"']+)["']\]/g,
        /\[data-testid="([^"]+)"\]/g,
        /\[data-testid='([^']+)'\]/g,
        /\[data-test=["']([^"']+)["']\]/g,
        /\[data-test="([^"]+)"\]/g,
        /\[data-test='([^']+)'\]/g,
        /\[aria-label=["']([^"']+)["']\]/g,
        /\[aria-label="([^"]+)"\]/g,
        /\[aria-label='([^']+)'\]/g,
        /\[alt=["']([^"']+)["']\]/g,
        /\[alt="([^"]+)"\]/g,
        /\[alt='([^']+)'\]/g,
        /input\[type=["']([^"']+)["']\]/g,
        /\[type=["']([^"']+)["']\]/g,
        /\[([a-zA-Z-]+)=["']([^"']+)["']\]/g
    ];
    for (const pattern of priorityPatterns) {
        const matches = Array.from(error.matchAll(pattern));
        if (matches.length > 0) {
            const match = matches[0];
            return match[0];
        }
    }
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
            }
            else if (pattern.source.includes('data-test')) {
                return `[data-test="${match[2]}"]`;
            }
            else if (pattern.source.includes('id=')) {
                return '#' + match[2];
            }
            else if (pattern.source.includes('<input[^>]*#')) {
                return '#' + match[1];
            }
            else if (pattern.source.includes('class=')) {
                const classes = match[2].split(' ');
                return '.' + classes[0];
            }
        }
    }
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
            }
            else if (pattern.source.includes('class=')) {
                return '.' + match[1].split(' ')[0];
            }
        }
    }
    const cssPatterns = [
        /div\.([a-zA-Z0-9_-]+)\s*>\s*button\.([a-zA-Z0-9_-]+)/g,
        /form#([a-zA-Z0-9_-]+)\s+input/g,
        /\.([a-zA-Z][a-zA-Z0-9_-]*)/g,
        /#([a-zA-Z][a-zA-Z0-9_-]*)/g
    ];
    for (const pattern of cssPatterns) {
        const matches = Array.from(error.matchAll(pattern));
        if (matches.length > 0) {
            const match = matches[0];
            if (pattern.source.includes('>') || pattern.source.includes('\\s+')) {
                return match[0];
            }
            if (pattern.source.includes('\\.')) {
                return '.' + match[1];
            }
            else if (pattern.source.includes('#')) {
                return '#' + match[1];
            }
            else {
                return match[0];
            }
        }
    }
    return undefined;
}
function extractTestIssueEvidence(errorMessage) {
    const evidence = [];
    const selectorMatch = errorMessage.match(/\[([^\]]+)\]|#[\w-]+|\.[\w-]+/);
    if (selectorMatch) {
        evidence.push(`Selector involved: ${selectorMatch[0]}`);
    }
    const timeoutMatch = errorMessage.match(/(\d+)ms/);
    if (timeoutMatch) {
        evidence.push(`Timeout: ${timeoutMatch[0]}`);
    }
    if (/not visible|covered|hidden|display:\s*none/.test(errorMessage)) {
        evidence.push('Element visibility issue detected');
    }
    if (/async|await|promise|then/.test(errorMessage)) {
        evidence.push('Possible async/timing issue');
    }
    return evidence;
}
//# sourceMappingURL=error-classifier.js.map