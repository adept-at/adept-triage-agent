/**
 * Defensive sanitizer for action outputs that flow into shell scripts.
 *
 * GitHub Actions writes string outputs using a delimited multi-line
 * protocol (`name<<EOF\nvalue\nEOF`), so newlines are technically safe
 * at the GHA layer. The real failure mode is consumer workflows that
 * interpolate `${{ steps.triage.outputs.<name> }}` directly into a
 * bash script body; embedded `"`, parens, or newlines in the action's
 * output then break the consuming bash parser. The bash injection
 * incident in adept-common's `triage-failed-tests.yml` (May 2026) is
 * the canonical case — fix landed on the workflow side, this helper
 * is the in-agent defense in depth so a future consumer regression
 * cannot wedge the agent again.
 *
 * The sanitizer is intentionally conservative:
 *  - Strip ASCII control characters that have no place in action
 *    outputs (NUL, BEL, etc.). Tab, LF, and CR are preserved unless
 *    `singleLine` is set.
 *  - In `singleLine` mode, collapse all line terminators to a single
 *    space so workflow consumers can interpolate the value into a
 *    quoted string without breaking out of the quotes.
 *  - Cap length so a runaway LLM emission cannot dump tens of KB into
 *    `${{ outputs }}` (where each char is interpolated literally on
 *    consumer side).
 *
 * `triage_json` and other JSON-encoded outputs do NOT need this — JSON
 * encoding already escapes the relevant characters. Apply only to raw
 * string outputs (`reasoning`, `summary`, `repair_summary`, etc.).
 */
export interface SanitizeOpts {
  /** Cap the output at this many characters (after sanitation). */
  maxLen?: number;
  /**
   * Replace all line terminators with a single space. Use for outputs
   * that consumers may interpolate into single-quoted shell strings.
   */
  singleLine?: boolean;
}

/**
 * Default cap: 5 KB is generous for any single action output and well
 * below the GitHub Actions per-output ceiling. Reasoning is the largest
 * legitimate consumer here and a verbose LLM reasoning paragraph fits
 * comfortably under this cap.
 */
const DEFAULT_MAX_LEN = 5000;

const TRUNCATION_MARKER = '… [truncated]';

/**
 * Strip control characters (excluding TAB \t = 0x09, LF \n = 0x0A, CR \r = 0x0D)
 * and DEL (0x7F). These have no semantic role in action outputs and have
 * been observed to leak through from sanitized log tails on rare runs.
 *
 * The `no-control-regex` rule is suppressed here because matching control
 * characters is the explicit purpose of this regex.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeActionOutput(
  text: string | undefined | null,
  opts: SanitizeOpts = {}
): string {
  if (!text) return '';
  const { maxLen = DEFAULT_MAX_LEN, singleLine = false } = opts;

  let cleaned = text.replace(CONTROL_CHARS, '');

  if (singleLine) {
    // Replace any line terminator with " · " (a unicode middle dot
    // surrounded by spaces) so the output is single-line yet still
    // visually distinguishes original line breaks. Then collapse runs
    // of whitespace to keep the result tidy.
    cleaned = cleaned.replace(/\r\n|\r|\n/g, ' · ').replace(/[ \t]{2,}/g, ' ').trim();
  } else {
    cleaned = cleaned.replace(/\r\n|\r/g, '\n');
  }

  if (cleaned.length > maxLen) {
    const cutoff = Math.max(0, maxLen - TRUNCATION_MARKER.length);
    cleaned = cleaned.substring(0, cutoff) + TRUNCATION_MARKER;
  }

  return cleaned;
}
