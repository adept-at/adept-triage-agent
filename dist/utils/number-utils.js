"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clampConfidence = clampConfidence;
function clampConfidence(value, fallback = 50) {
    const numeric = typeof value === 'number' && Number.isFinite(value)
        ? value
        : fallback;
    return Math.max(0, Math.min(100, numeric));
}
//# sourceMappingURL=number-utils.js.map