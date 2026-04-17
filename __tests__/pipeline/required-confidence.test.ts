import { requiredConfidence } from '../../src/index';
import { BLAST_RADIUS, AUTO_FIX } from '../../src/config/constants';
import { FixRecommendation } from '../../src/types';

describe('requiredConfidence (blast-radius scaling)', () => {
  const makeFix = (
    files: string[],
    confidence = 80
  ): FixRecommendation => ({
    confidence,
    summary: 'test',
    reasoning: 'test',
    evidence: [],
    proposedChanges: files.map((file) => ({
      file,
      line: 1,
      oldCode: 'old',
      newCode: 'new',
      justification: 'j',
    })),
  });

  it('returns the base threshold when fix touches only a single spec file', () => {
    const { required, reasons } = requiredConfidence(
      makeFix(['test/specs/login.spec.ts']),
      AUTO_FIX.DEFAULT_MIN_CONFIDENCE
    );
    expect(required).toBe(AUTO_FIX.DEFAULT_MIN_CONFIDENCE);
    expect(reasons).toEqual([]);
  });

  it('adds SHARED_CODE_BOOST when fix touches a page object', () => {
    const { required, reasons } = requiredConfidence(
      makeFix(['test/pageobjects/video-player.page.ts']),
      70
    );
    expect(required).toBe(70 + BLAST_RADIUS.SHARED_CODE_BOOST);
    expect(reasons.some((r) => r.includes('shared code'))).toBe(true);
  });

  it('adds SHARED_CODE_BOOST for helpers / commands / fixtures', () => {
    const patterns = [
      'test/helpers/auth.ts',
      'cypress/support/commands.ts',
      'test/fixtures/videos.ts',
      'src/utils/shared-timing.ts',
    ];
    for (const path of patterns) {
      const { required } = requiredConfidence(makeFix([path]), 70);
      expect(required).toBe(70 + BLAST_RADIUS.SHARED_CODE_BOOST);
    }
  });

  it('adds MULTI_FILE_BOOST when fix touches 2+ files', () => {
    const { required, reasons } = requiredConfidence(
      makeFix(['test/specs/a.ts', 'test/specs/b.ts']),
      70
    );
    expect(required).toBe(70 + BLAST_RADIUS.MULTI_FILE_BOOST);
    expect(reasons.some((r) => r.includes('spans 2 files'))).toBe(true);
  });

  it('stacks SHARED_CODE_BOOST + MULTI_FILE_BOOST when both apply', () => {
    const { required, reasons } = requiredConfidence(
      makeFix([
        'test/pageobjects/video-player.page.ts',
        'test/specs/video.spec.ts',
      ]),
      70
    );
    expect(required).toBe(
      70 + BLAST_RADIUS.SHARED_CODE_BOOST + BLAST_RADIUS.MULTI_FILE_BOOST
    );
    expect(reasons.length).toBe(2);
  });

  it('caps the required confidence at MAX_REQUIRED_CONFIDENCE', () => {
    const { required } = requiredConfidence(
      makeFix([
        'test/pageobjects/a.ts',
        'test/helpers/b.ts',
        'test/commands/c.ts',
      ]),
      90
    );
    expect(required).toBe(BLAST_RADIUS.MAX_REQUIRED_CONFIDENCE);
  });

  it('deduplicates files so same-path changes only count once for the multi-file boost', () => {
    const fix = makeFix(['test/specs/a.ts', 'test/specs/a.ts']);
    const { required, reasons } = requiredConfidence(fix, 70);
    expect(required).toBe(70);
    expect(reasons).toEqual([]);
  });
});
