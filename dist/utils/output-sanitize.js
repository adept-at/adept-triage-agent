"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeActionOutput = sanitizeActionOutput;
const DEFAULT_MAX_LEN = 5000;
const TRUNCATION_MARKER = '… [truncated]';
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
function sanitizeActionOutput(text, opts = {}) {
    if (!text)
        return '';
    const { maxLen = DEFAULT_MAX_LEN, singleLine = false } = opts;
    let cleaned = text.replace(CONTROL_CHARS, '');
    if (singleLine) {
        cleaned = cleaned.replace(/\r\n|\r|\n/g, ' · ').replace(/[ \t]{2,}/g, ' ').trim();
    }
    else {
        cleaned = cleaned.replace(/\r\n|\r/g, '\n');
    }
    if (cleaned.length > maxLen) {
        if (maxLen <= TRUNCATION_MARKER.length) {
            cleaned = cleaned.substring(0, maxLen);
        }
        else {
            const cutoff = maxLen - TRUNCATION_MARKER.length;
            cleaned = cleaned.substring(0, cutoff) + TRUNCATION_MARKER;
        }
    }
    return cleaned;
}
//# sourceMappingURL=output-sanitize.js.map