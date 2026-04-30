import { verifyTestEvidence } from '../../src/services/test-evidence';

describe('verifyTestEvidence', () => {
  it('accepts concrete Mocha/Cypress passing evidence', () => {
    expect(verifyTestEvidence('2 passing (12s)')).toEqual({
      trustworthy: true,
      reason: 'concrete pass evidence (matched "2 passing")',
      matched: '2 passing',
    });
  });

  it('rejects zero-test sentinels even when process exit would be zero', () => {
    const result = verifyTestEvidence("Can't run because no spec files were found");

    expect(result.trustworthy).toBe(false);
    expect(result.reason).toContain('zero tests ran');
  });

  it('rejects 0 passing as zero-test evidence', () => {
    const result = verifyTestEvidence('0 passing');

    expect(result.trustworthy).toBe(false);
    expect(result.matched).toBe('0 passing');
  });

  it('rejects empty logs', () => {
    expect(verifyTestEvidence('').trustworthy).toBe(false);
    expect(verifyTestEvidence(undefined).trustworthy).toBe(false);
  });

  it('rejects ambiguous logs without pass markers', () => {
    const result = verifyTestEvidence('Cypress completed with no explicit summary');

    expect(result.trustworthy).toBe(false);
    expect(result.reason).toContain('no concrete pass evidence');
  });
});
