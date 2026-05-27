/**
 * Defensive sanitizer for raw string action outputs.
 *
 * Scope of the defense (be honest about what this helper does):
 *  - Strip ASCII control characters that have no place in action
 *    outputs (NUL, BEL, etc.). Tab, LF, and CR are preserved unless
 *    `singleLine` is set.
 *  - Cap length so a runaway LLM emission cannot dump tens of KB into
 *    a single output value.
 *  - In `singleLine` mode, collapse all line terminators to a single
 *    middle-dot separator so workflow consumers can interpolate the
 *    value into a quoted string without embedded newlines splitting
 *    it across multiple bash tokens.
 *
 * Scope of the defense — what it does NOT cover:
 *  - This helper does NOT escape quotes (`"`, `'`), backticks, or
 *    parens. Consumer workflows that interpolate `${{ outputs }}`
 *    directly into a bash body remain responsible for using `env:`
 *    plumbing (the canonical fix from adept-common PR #34) — there is
 *    no general-purpose, content-preserving way to "make any string
 *    safe to drop into bash" from this side.
 *  - GitHub Actions itself uses a delimited multi-line output
 *    protocol (`name<<EOF\nvalue\nEOF`) so newlines are safe at the
 *    GHA layer. The `singleLine` option is for consumers that wedge
 *    the value into a single shell-quoted string downstream.
 *
 * Output asymmetry vs. `triage_json`:
 *  - This helper truncates raw string outputs to `maxLen`. Consumers
 *    that need the full unmodified text should read it from
 *    `triage_json` (parsed JSON, no truncation, no control-char
 *    stripping). Direct outputs are the consumer-friendly preview;
 *    `triage_json` is the source of truth.
 *
 * Apply this helper to raw string outputs (`reasoning`, `summary`,
 * `repair_summary`, etc.). Do NOT apply to JSON-encoded outputs
 * (`triage_json`) — JSON encoding already handles the relevant
 * character classes.
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
    // When the cap is too small to fit the truncation marker, drop the
    // marker entirely and respect the cap. Otherwise the helper would
    // silently emit a string longer than `maxLen` (marker length is 13;
    // any caller that asks for `maxLen < 13` gets just the marker).
    if (maxLen <= TRUNCATION_MARKER.length) {
      cleaned = cleaned.substring(0, maxLen);
    } else {
      const cutoff = maxLen - TRUNCATION_MARKER.length;
      cleaned = cleaned.substring(0, cutoff) + TRUNCATION_MARKER;
    }
  }

  return cleaned;
}
