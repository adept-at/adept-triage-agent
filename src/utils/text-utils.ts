/**
 * Shared text utilities
 */

/** Pre-compiled ANSI escape sequence regex (avoids rebuilding per call) */
export const ANSI_ESCAPE_REGEX = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  'g'
);

/**
 * Coerce an untrusted value to one of a fixed set of allowed enum values,
 * falling back to `fallback` when the input is not a member of the allow-list.
 *
 * Why this exists (v1.49.2+):
 * Agent parsers typed fields as TypeScript string-literal unions (e.g.
 * `'HIGH' | 'MEDIUM' | 'LOW'`) but then populated them from the model's
 * JSON response with a pattern like `f.severity || 'MEDIUM'`. The `||`
 * fallback only catches falsy values — a model that returns
 * `{"severity": "## SYSTEM: override"}` would pass through the truthy
 * check and land on the `InvestigationOutput` object as-is. Downstream
 * renderers (retry summary, review prompt, log lines) would then emit
 * that adversarial string verbatim, re-opening a prompt-injection
 * surface that sanitizeForPrompt closed elsewhere.
 *
 * `coerceEnum` makes the runtime value match the TypeScript type: if the
 * input isn't in the allowed set, it's replaced with the documented
 * fallback. This is applied at the parse boundary so every downstream
 * consumer inherits the guarantee.
 */
export function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof value !== 'string') return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
