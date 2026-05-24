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

  // -----------------------------------------------------------------
  // v1.52.14 — semantic blast-radius factors
  //   - GLOBAL_TIMEOUT_BOOST when newCode introduces a >=30s timeout
  //   - HELPER_CONTRACT_CHANGE_BOOST when shared-file edit adds `throw`
  // v1.52.14 — recent-failed-trajectory penalty
  //   - RECENT_FAILED_TRAJECTORY_BOOST per recent failure (capped)
  // -----------------------------------------------------------------
  describe('semantic blast-radius factors (v1.52.14)', () => {
    const makeFixWith = (
      file: string,
      oldCode: string,
      newCode: string
    ): FixRecommendation => ({
      confidence: 80,
      summary: 'test',
      reasoning: 'test',
      evidence: [],
      proposedChanges: [
        { file, line: 1, oldCode, newCode, justification: 'j' },
      ],
    });

    it('adds GLOBAL_TIMEOUT_BOOST when newCode introduces a >=30s timeout: literal', () => {
      const { required, reasons } = requiredConfidence(
        makeFixWith(
          'test/specs/foo.ts',
          'wait until ready',
          '{ timeout: 60000 }'
        ),
        70
      );
      expect(required).toBe(70 + BLAST_RADIUS.GLOBAL_TIMEOUT_BOOST);
      expect(reasons.some((r) => r.includes('global timeout'))).toBe(true);
    });

    it('adds GLOBAL_TIMEOUT_BOOST for setTimeout with large delay', () => {
      const { required, reasons } = requiredConfidence(
        makeFixWith(
          'test/specs/foo.ts',
          'doThing()',
          'setTimeout(doThing, 60000)'
        ),
        70
      );
      expect(required).toBe(70 + BLAST_RADIUS.GLOBAL_TIMEOUT_BOOST);
      expect(reasons.some((r) => r.includes('global timeout'))).toBe(true);
    });

    it('does NOT add GLOBAL_TIMEOUT_BOOST for small timeouts', () => {
      const { required } = requiredConfidence(
        makeFixWith(
          'test/specs/foo.ts',
          'timeout: 1000',
          'timeout: 5000'
        ),
        70
      );
      expect(required).toBe(70);
    });

    it('does NOT add GLOBAL_TIMEOUT_BOOST when oldCode already had the same large timeout', () => {
      const { required } = requiredConfidence(
        makeFixWith(
          'test/specs/foo.ts',
          'timeout: 60000,',
          'timeout: 60000, // refactor only'
        ),
        70
      );
      expect(required).toBe(70);
    });

    it('adds HELPER_CONTRACT_CHANGE_BOOST when shared file adds throw where none existed', () => {
      const { required, reasons } = requiredConfidence(
        makeFixWith(
          'test/helpers/api-client.ts',
          'console.error(error);',
          'console.error(error); throw error;'
        ),
        70
      );
      // Both SHARED_CODE and HELPER_CONTRACT fire.
      expect(required).toBe(
        70 +
          BLAST_RADIUS.SHARED_CODE_BOOST +
          BLAST_RADIUS.HELPER_CONTRACT_CHANGE_BOOST
      );
      expect(reasons.some((r) => r.includes('helper contract change'))).toBe(true);
    });

    it('does NOT add HELPER_CONTRACT_CHANGE_BOOST when oldCode already threw', () => {
      const { required, reasons } = requiredConfidence(
        makeFixWith(
          'test/helpers/api-client.ts',
          'throw new Error("a");',
          'throw new Error("b"); // refactored'
        ),
        70
      );
      // Only SHARED_CODE fires; helper-contract change is suppressed.
      expect(required).toBe(70 + BLAST_RADIUS.SHARED_CODE_BOOST);
      expect(reasons.some((r) => r.includes('helper contract change'))).toBe(false);
    });
  });

  describe('recent-failed-trajectory penalty (v1.52.14)', () => {
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

    it('does not change required when no recent failed trajectories exist', () => {
      const { required } = requiredConfidence(
        makeFix(['test/specs/foo.ts']),
        70,
        { recentFailedTrajectories: 0 }
      );
      expect(required).toBe(70);
    });

    it('adds RECENT_FAILED_TRAJECTORY_BOOST per recent failure', () => {
      const { required } = requiredConfidence(
        makeFix(['test/specs/foo.ts']),
        70,
        { recentFailedTrajectories: 1 }
      );
      expect(required).toBe(70 + BLAST_RADIUS.RECENT_FAILED_TRAJECTORY_BOOST);
    });

    it('caps the penalty at RECENT_FAILED_MAX_BOOST regardless of count', () => {
      const { required, reasons } = requiredConfidence(
        makeFix(['test/specs/foo.ts']),
        70,
        { recentFailedTrajectories: 100 }
      );
      expect(required).toBe(70 + BLAST_RADIUS.RECENT_FAILED_MAX_BOOST);
      expect(reasons.some((r) => r.includes('recent failed'))).toBe(true);
    });

    it('combines with blast-radius scaling for shared code', () => {
      const { required } = requiredConfidence(
        makeFix(['test/helpers/foo.ts']),
        70,
        { recentFailedTrajectories: 1 }
      );
      expect(required).toBe(
        70 +
          BLAST_RADIUS.SHARED_CODE_BOOST +
          BLAST_RADIUS.RECENT_FAILED_TRAJECTORY_BOOST
      );
    });
  });
});
