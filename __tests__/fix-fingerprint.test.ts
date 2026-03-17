import { fixFingerprint } from '../src/index';
import { FixRecommendation } from '../src/types';

describe('fixFingerprint', () => {
  const makeFix = (
    changes: Array<{ file: string; oldCode: string; newCode: string }>
  ): FixRecommendation => ({
    confidence: 85,
    summary: 'test fix',
    proposedChanges: changes.map((c) => ({
      ...c,
      line: 1,
      justification: 'test',
    })),
    evidence: [],
    reasoning: 'test',
  });

  it('should produce identical fingerprints for identical fixes', () => {
    const fix1 = makeFix([
      { file: 'a.ts', oldCode: 'const x = 1;', newCode: 'const x = 2;' },
    ]);
    const fix2 = makeFix([
      { file: 'a.ts', oldCode: 'const x = 1;', newCode: 'const x = 2;' },
    ]);

    expect(fixFingerprint(fix1)).toBe(fixFingerprint(fix2));
  });

  it('should produce different fingerprints for different fixes', () => {
    const fix1 = makeFix([
      { file: 'a.ts', oldCode: 'const x = 1;', newCode: 'const x = 2;' },
    ]);
    const fix2 = makeFix([
      { file: 'a.ts', oldCode: 'const x = 1;', newCode: 'const x = 3;' },
    ]);

    expect(fixFingerprint(fix1)).not.toBe(fixFingerprint(fix2));
  });

  it('should normalize whitespace so trivial reformulations match', () => {
    const fix1 = makeFix([
      { file: 'a.ts', oldCode: 'const  x  =  1;', newCode: 'const  x  =  2;' },
    ]);
    const fix2 = makeFix([
      { file: 'a.ts', oldCode: 'const x = 1;', newCode: 'const x = 2;' },
    ]);

    expect(fixFingerprint(fix1)).toBe(fixFingerprint(fix2));
  });

  it('should be order-independent (sorted by signature)', () => {
    const fix1 = makeFix([
      { file: 'b.ts', oldCode: 'old2', newCode: 'new2' },
      { file: 'a.ts', oldCode: 'old1', newCode: 'new1' },
    ]);
    const fix2 = makeFix([
      { file: 'a.ts', oldCode: 'old1', newCode: 'new1' },
      { file: 'b.ts', oldCode: 'old2', newCode: 'new2' },
    ]);

    expect(fixFingerprint(fix1)).toBe(fixFingerprint(fix2));
  });

  it('should distinguish fixes targeting different files with same code', () => {
    const fix1 = makeFix([
      { file: 'a.ts', oldCode: 'old', newCode: 'new' },
    ]);
    const fix2 = makeFix([
      { file: 'b.ts', oldCode: 'old', newCode: 'new' },
    ]);

    expect(fixFingerprint(fix1)).not.toBe(fixFingerprint(fix2));
  });

  it('should distinguish fixes with different number of changes', () => {
    const fix1 = makeFix([
      { file: 'a.ts', oldCode: 'old', newCode: 'new' },
    ]);
    const fix2 = makeFix([
      { file: 'a.ts', oldCode: 'old', newCode: 'new' },
      { file: 'b.ts', oldCode: 'old2', newCode: 'new2' },
    ]);

    expect(fixFingerprint(fix1)).not.toBe(fixFingerprint(fix2));
  });
});
