"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSI_ESCAPE_REGEX = void 0;
exports.coerceEnum = coerceEnum;
exports.coerceEnumOrNull = coerceEnumOrNull;
exports.ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
function coerceEnum(value, allowed, fallback) {
    if (typeof value !== 'string')
        return fallback;
    return allowed.includes(value) ? value : fallback;
}
function coerceEnumOrNull(value, allowed) {
    if (typeof value !== 'string')
        return undefined;
    return allowed.includes(value)
        ? value
        : undefined;
}
//# sourceMappingURL=text-utils.js.map