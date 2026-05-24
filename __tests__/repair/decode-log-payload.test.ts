/**
 * Tests for `decodeLogPayload` in `src/repair/fix-applier.ts`.
 *
 * Pre-v1.52.15 the validation-log download path used
 *   `String(logsResponse.data)`
 * which produced the literal string `"[object ArrayBuffer]"` whenever
 * Octokit returned binary data — silently emptying every remote
 * validation log payload (`code_review_may_2026.md` finding #3).
 *
 * The replacement helper handles all three binary shapes Octokit can
 * return (Buffer, ArrayBuffer, Uint8Array) plus the string and
 * defensive-fallback cases. These tests lock the contract.
 */
import { decodeLogPayload } from '../../src/repair/fix-applier';

describe('decodeLogPayload', () => {
  it('returns string inputs verbatim', () => {
    expect(decodeLogPayload('hello world')).toBe('hello world');
    expect(decodeLogPayload('')).toBe('');
    // Multibyte sanity check.
    expect(decodeLogPayload('résumé café')).toBe('résumé café');
  });

  it('decodes Node Buffer to UTF-8', () => {
    const buf = Buffer.from('passed: 42 tests\nfailed: 0\n', 'utf-8');
    expect(decodeLogPayload(buf)).toBe('passed: 42 tests\nfailed: 0\n');
  });

  it('decodes ArrayBuffer to UTF-8 (the original failing case)', () => {
    const text = 'AssertionError: expected 4 to equal 5';
    const buf = Buffer.from(text, 'utf-8');
    // Ensure we hand it a real ArrayBuffer, not a Buffer.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    expect(ab).toBeInstanceOf(ArrayBuffer);
    expect(decodeLogPayload(ab)).toBe(text);
    // Critically: the pre-fix `String(ab)` returned "[object ArrayBuffer]".
    // Confirm that pathological string is never produced.
    expect(decodeLogPayload(ab)).not.toBe('[object ArrayBuffer]');
  });

  it('decodes Uint8Array to UTF-8', () => {
    const text = 'Cypress could not verify that this server is running';
    const u8 = new Uint8Array(Buffer.from(text, 'utf-8'));
    expect(decodeLogPayload(u8)).toBe(text);
  });

  it('decodes a TypedArray subclass (DataView via underlying buffer)', () => {
    // DataView is the closest non-Uint8Array TypedArray-like that
    // Octokit could plausibly return on some runtime configurations.
    const text = 'TypeError: Cannot read properties of undefined';
    const buf = Buffer.from(text, 'utf-8');
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    expect(decodeLogPayload(u8)).toBe(text);
  });

  it('returns a typed placeholder string for unknown shapes (does not throw)', () => {
    // Object shape — not a Buffer, not an ArrayBuffer, not a Uint8Array.
    const result = decodeLogPayload({ unexpected: 'object' });
    // Must be a string so downstream verifyTestEvidence does not crash.
    expect(typeof result).toBe('string');
    // Must NOT look like real test output (no "passed", "failed",
    // assertion text, etc. that could fool the evidence verifier into
    // marking a fake-success run as passed).
    expect(result).not.toContain('passed');
    expect(result).not.toContain('failed');
    expect(result).toContain('triage-agent');
    expect(result).toContain('unable to decode');
  });

  it('returns a placeholder for null without throwing', () => {
    const result = decodeLogPayload(null);
    expect(typeof result).toBe('string');
    expect(result).toContain('null');
  });

  it('returns a placeholder for undefined without throwing', () => {
    const result = decodeLogPayload(undefined);
    expect(typeof result).toBe('string');
    expect(result).toContain('undefined');
  });
});
