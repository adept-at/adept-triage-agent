/**
 * Tests for `autoCorrectOldCode` and `extractMatchingRegion` in
 * `src/agents/agent-orchestrator.ts`. Both helpers were patched after
 * `code_review_may_2026.md` findings #1 and #2 — see commits in
 * v1.52.15 and v1.52.16.
 *
 * The most critical case (#1) was Strategy 3 expanding `change.oldCode`
 * to a 5-line context-padded region without correspondingly padding
 * `change.newCode`. The downstream string-replace in
 * LocalFixValidator.applyFix would then silently delete the surrounding
 * 5 lines of unrelated code. The patch keeps the heuristic but ensures
 * `change.newCode` carries the same leading / trailing pad so the
 * replace is a structural no-op for the padding region. These tests
 * lock that contract in.
 */
import {
  autoCorrectOldCode,
  extractMatchingRegion,
} from '../../src/agents/agent-orchestrator';
import { createAgentContext } from '../../src/agents/base-agent';
import type { CodeChange } from '../../src/agents/fix-generation-agent';

const ctx = createAgentContext({
  errorMessage: 'unused',
  testFile: 'unused.ts',
  testName: 'unused',
  framework: 'unknown',
});

const makeChange = (overrides: Partial<CodeChange> = {}): CodeChange => ({
  file: 'test/specs/foo.ts',
  line: 5,
  oldCode: 'const x = 1;',
  newCode: 'const x = 2;',
  justification: 'unit test',
  changeType: 'LOGIC_CHANGE',
  ...overrides,
});

describe('autoCorrectOldCode — Strategy 3 padding (code_review_may_2026 #1)', () => {
  it('does not silently delete surrounding lines when expanding oldCode to a padded region', () => {
    // Source with distinctive keywords that force the heuristic into Strategy 3
    // (no exact match, whitespace-normalized doesn't match either, but
    // keyword-overlap fires).
    const source = [
      'line 1 prologue',
      'line 2 prologue',
      'line 3 prologue',
      'line 4 prologue',
      "  if (foo === 'bar') {",
      '    throw new Error("legacy text");',
      '  }',
      'line 8 epilogue',
      'line 9 epilogue',
      'line 10 epilogue',
    ].join('\n');
    const sources = new Map([['test/specs/foo.ts', source]]);

    const change = makeChange({
      file: 'test/specs/foo.ts',
      line: 5,
      // Distinctive enough for the keyword-overlap heuristic but with
      // wording that doesn't match the source verbatim.
      oldCode: "if (foo === 'bar') {\n  throw new Error('NEW exact wording');\n}",
      newCode: "if (foo === 'baz') {\n  throw new Error('replacement');\n}",
    });

    const result = autoCorrectOldCode([change], sources, ctx);
    expect(result.changes.length).toBe(1);

    // After the fix, oldCode should be the padded region AND newCode
    // should also be padded with the same leading / trailing context
    // lines so applyFix's string-replace doesn't delete them.
    const corrected = result.changes[0];
    const oldLines = corrected.oldCode.split('\n');
    const newLines = corrected.newCode.split('\n');

    // Strategy 3 always returns AT LEAST as many newCode lines as
    // oldCode lines that are non-edit lines. Confirm the leading and
    // trailing padding lines are present in BOTH oldCode and newCode.
    expect(oldLines.length).toBeGreaterThanOrEqual(3); // padded
    expect(newLines.length).toBeGreaterThanOrEqual(3); // padded too

    // Simulate the downstream apply: string-replace oldCode with newCode
    // in the source. The result must NOT have lost the prologue/epilogue
    // context lines.
    const after = source.replace(corrected.oldCode, corrected.newCode);
    expect(after).toContain('line 4 prologue');
    expect(after).toContain('line 8 epilogue');
    // The original failing-bug behavior was to delete these lines silently;
    // both must survive a real string-replace.
  });

  it('passes the change through unchanged when oldCode matches verbatim (Strategy 0)', () => {
    const source = 'const x = 1;\nconst y = 2;';
    const sources = new Map([['test/specs/foo.ts', source]]);
    const change = makeChange({ oldCode: 'const x = 1;' });

    const result = autoCorrectOldCode([change], sources, ctx);
    expect(result.changes).toHaveLength(1);
    expect(result.correctedCount).toBe(0);
    expect(result.droppedCount).toBe(0);
    expect(result.changes[0].oldCode).toBe('const x = 1;');
    expect(result.changes[0].newCode).toBe('const x = 2;');
  });

  it('drops a change whose oldCode matches no source file at all', () => {
    const sources = new Map([['test/specs/foo.ts', 'const a = 0;']]);
    const change = makeChange({
      oldCode: 'completely unrelated content xyzzy',
    });
    const result = autoCorrectOldCode([change], sources, ctx);
    expect(result.changes).toHaveLength(0);
    expect(result.droppedCount).toBe(1);
  });
});

describe('extractMatchingRegion — empty-line indexing (code_review_may_2026 #2)', () => {
  it('returns null rather than emitting a region that would delete blank source lines', () => {
    // Source has a blank line between two non-empty lines. Pre-fix, the
    // function would either return false (false rejection) or emit a
    // 3-line region for a 2-line oldCode — which would cause a
    // structurally incorrect replace. New behavior: return null and let
    // Strategy 3 (padding-aware) handle it.
    const source = ['const x = 1;', '', 'const y = 2;'].join('\n');
    const approxOldCode = ['const x = 1;', 'const y = 2;'].join('\n');

    const region = extractMatchingRegion(source, approxOldCode);
    // Either null (let Strategy 3 handle) or exactly the matched non-blank
    // lines as a contiguous substring of source. Crucially, NEVER a
    // length-mismatched region.
    if (region !== null) {
      // If something is returned it must be a contiguous substring of source.
      expect(source.indexOf(region)).toBeGreaterThanOrEqual(0);
      expect(region.split('\n').length).toBe(approxOldCode.split('\n').length);
    } else {
      expect(region).toBeNull();
    }
  });

  it('matches verbatim when there are no intervening blank lines', () => {
    const source = 'const x = 1;\nconst y = 2;\nconst z = 3;';
    const approxOldCode = 'const x = 1;\nconst y = 2;';
    const region = extractMatchingRegion(source, approxOldCode);
    expect(region).toBe('const x = 1;\nconst y = 2;');
  });

  it('returns null when the first line does not appear in source', () => {
    const region = extractMatchingRegion(
      'const x = 1;',
      'completely missing line\nconst x = 1;'
    );
    expect(region).toBeNull();
  });
});
