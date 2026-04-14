"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferRootCauseCategoryFromText = inferRootCauseCategoryFromText;
function inferRootCauseCategoryFromText(text, errorType) {
    const normalizedText = text.toLowerCase();
    if (/selector|data-testid|aria-label|locator|queryselector|no such element|unable to locate|expected to find element|element not found/.test(normalizedText)) {
        return 'SELECTOR_MISMATCH';
    }
    if (/\btimeout\b|timing|race|retry|not ready/.test(normalizedText)) {
        return 'TIMING_ISSUE';
    }
    if (/\bnetwork\b|\bgraphql\b|\bapi\b|request failed|failed to fetch|\bxhr\b|\bbackend\b|\bserver\b|status code|http \d{3}|response code/.test(normalizedText)) {
        return 'NETWORK_ISSUE';
    }
    if (/\bfixture\b|\bseed\b|\btest data\b|\bmissing data\b|\bcontent missing\b|\brecord missing\b/.test(normalizedText)) {
        return 'DATA_DEPENDENCY';
    }
    if (/visible|visibility|hidden|overlay|covered|clickable|viewport|scroll/.test(normalizedText)) {
        return 'ELEMENT_VISIBILITY';
    }
    if (/assert|expect|mismatch|wrong value|comparison/.test(normalizedText)) {
        return 'ASSERTION_MISMATCH';
    }
    if (/\bstate\b|session|auth|login|\bsetup\b|precondition|not set up/.test(normalizedText)) {
        return 'STATE_DEPENDENCY';
    }
    if (/environment|provider|browser crash|session finished|infrastructure|deployment|config/.test(normalizedText)) {
        return 'ENVIRONMENT_ISSUE';
    }
    switch (errorType) {
        case 'ELEMENT_NOT_FOUND':
            return 'SELECTOR_MISMATCH';
        case 'TIMEOUT':
            return 'TIMING_ISSUE';
        case 'ASSERTION_FAILED':
            return 'ASSERTION_MISMATCH';
        case 'NETWORK_ERROR':
            return 'NETWORK_ISSUE';
        case 'ELEMENT_NOT_VISIBLE':
        case 'ELEMENT_COVERED':
        case 'ELEMENT_DETACHED':
            return 'ELEMENT_VISIBILITY';
        default:
            return 'UNKNOWN';
    }
}
//# sourceMappingURL=root-cause-category.js.map