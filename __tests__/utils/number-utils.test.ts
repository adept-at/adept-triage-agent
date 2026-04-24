import { clampConfidence } from '../../src/utils/number-utils';

describe('clampConfidence', () => {
  it('keeps valid confidence values unchanged', () => {
    expect(clampConfidence(0)).toBe(0);
    expect(clampConfidence(85)).toBe(85);
    expect(clampConfidence(100)).toBe(100);
  });

  it('clamps out-of-range model values to confidence bounds', () => {
    expect(clampConfidence(-10)).toBe(0);
    expect(clampConfidence(1000)).toBe(100);
  });

  it('uses fallback for non-finite or non-number values', () => {
    expect(clampConfidence('high')).toBe(50);
    expect(clampConfidence(Number.NaN)).toBe(50);
    expect(clampConfidence(undefined, 70)).toBe(70);
  });
});
