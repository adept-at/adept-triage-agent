"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTestEvidence = verifyTestEvidence;
const NO_TESTS_RAN_PATTERNS = [
    /Can't run because no spec files were found/i,
    /No spec files? (?:were )?found/i,
    /No tests? (?:were )?run/i,
    /running\s+0\s+tests?\b/i,
    /Tests:\s+0,/i,
    /\b0\s+passing\b/i,
    /\b0\s+tests?\s+passed\b/i,
    /Spec Files:\s+0\s+passed,\s+0\s+failed,\s+0\s+total/i,
];
const POSITIVE_EVIDENCE_PATTERNS = [
    /(\d+)\s+passing\b/i,
    /Tests?:\s+(\d+)\s+passed/i,
    /✔\s+All specs passed/i,
    /\bPASS\b\s+\S+/,
    /Spec Files:\s+(\d+)\s+passed,\s+0\s+failed/i,
];
function verifyTestEvidence(logs) {
    if (!logs || logs.length === 0) {
        return {
            trustworthy: false,
            reason: 'no logs available to verify test evidence',
        };
    }
    for (const pattern of NO_TESTS_RAN_PATTERNS) {
        const match = logs.match(pattern);
        if (match) {
            return {
                trustworthy: false,
                reason: `runner reported zero tests ran (matched "${match[0]}")`,
                matched: match[0],
            };
        }
    }
    for (const pattern of POSITIVE_EVIDENCE_PATTERNS) {
        const match = logs.match(pattern);
        if (match) {
            return {
                trustworthy: true,
                reason: `concrete pass evidence (matched "${match[0]}")`,
                matched: match[0],
            };
        }
    }
    return {
        trustworthy: false,
        reason: 'no concrete pass evidence found in logs (neither "N passing" nor a known runner success marker present)',
    };
}
//# sourceMappingURL=test-evidence.js.map