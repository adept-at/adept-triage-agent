"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyErrorType = classifyErrorType;
exports.extractSelector = extractSelector;
exports.buildRepairContext = buildRepairContext;
exports.enhanceAnalysisWithRepairContext = enhanceAnalysisWithRepairContext;
function classifyErrorType(error) {
    const errorLower = error.toLowerCase();
    if (errorLower.includes('expected to find element') ||
        errorLower.includes('element not found') ||
        errorLower.includes('could not find element') ||
        errorLower.includes('never found it')) {
        return 'ELEMENT_NOT_FOUND';
    }
    if (errorLower.includes('element is not visible') ||
        errorLower.includes('is not visible') ||
        errorLower.includes('visibility: hidden') ||
        errorLower.includes('element exists but is not visible')) {
        return 'ELEMENT_NOT_VISIBLE';
    }
    if (errorLower.includes('timed out') ||
        errorLower.includes('timeouterror') ||
        errorLower.includes('timeout of') ||
        errorLower.includes('operation timed out')) {
        return 'TIMEOUT';
    }
    if (errorLower.includes('assertionerror') ||
        errorLower.includes('expected') ||
        errorLower.includes('assert.equal') ||
        errorLower.includes('to be truthy')) {
        return 'ASSERTION_FAILED';
    }
    if (errorLower.includes('network') ||
        errorLower.includes('fetch') ||
        errorLower.includes('err_network')) {
        return 'NETWORK_ERROR';
    }
    if (errorLower.includes('detached from the dom') ||
        errorLower.includes('element is detached')) {
        return 'ELEMENT_DETACHED';
    }
    if (errorLower.includes('covered by another element') ||
        errorLower.includes('element is covered')) {
        return 'ELEMENT_COVERED';
    }
    if (errorLower.includes('can only be called on') ||
        errorLower.includes('invalid element type')) {
        return 'INVALID_ELEMENT_TYPE';
    }
    return 'UNKNOWN';
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
function buildRepairContext(analysisData) {
    const errorType = classifyErrorType(analysisData.errorMessage);
    const errorSelector = extractSelector(analysisData.errorMessage);
    return {
        testFile: analysisData.testFile,
        errorLine: analysisData.errorLine,
        testName: analysisData.testName,
        errorType,
        errorSelector,
        errorMessage: analysisData.errorMessage,
        workflowRunId: analysisData.workflowRunId,
        jobName: analysisData.jobName,
        commitSha: analysisData.commitSha,
        branch: analysisData.branch,
        repository: analysisData.repository,
        prNumber: analysisData.prNumber,
        targetAppPrNumber: analysisData.targetAppPrNumber
    };
}
function enhanceAnalysisWithRepairContext(analysisResult, testData) {
    if (analysisResult.verdict !== 'TEST_ISSUE') {
        return analysisResult;
    }
    const repairContext = buildRepairContext(testData);
    return {
        ...analysisResult,
        repairContext
    };
}
//# sourceMappingURL=repair-context.js.map