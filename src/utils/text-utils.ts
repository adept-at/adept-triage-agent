/**
 * Shared text utilities
 */

/** Pre-compiled ANSI escape sequence regex (avoids rebuilding per call) */
export const ANSI_ESCAPE_REGEX = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  'g'
);
