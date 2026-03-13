"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSI_ESCAPE_REGEX = void 0;
exports.ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
//# sourceMappingURL=text-utils.js.map