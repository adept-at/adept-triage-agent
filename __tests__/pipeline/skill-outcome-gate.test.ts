import { shouldWriteSkillOutcome } from '../../src/pipeline/coordinator';
import { ApplyResult } from '../../src/repair/fix-applier';

describe('shouldWriteSkillOutcome', () => {
  it('does not write skill outcomes when no auto-fix result exists', () => {
    expect(shouldWriteSkillOutcome(null)).toBe(false);
    expect(shouldWriteSkillOutcome(undefined)).toBe(false);
  });

  it('does not write skill outcomes while remote validation is pending', () => {
    const result: ApplyResult = {
      success: true,
      modifiedFiles: ['spec.ts'],
      validationStatus: 'pending',
      validationResult: {
        status: 'pending',
        mode: 'remote',
        conclusion: 'dispatched-run-not-found',
      },
    };

    expect(shouldWriteSkillOutcome(result)).toBe(false);
  });

  it('writes skill outcomes only for terminal validation statuses that should learn', () => {
    for (const status of ['passed', 'failed'] as const) {
      const result: ApplyResult = {
        success: status === 'passed',
        modifiedFiles: ['spec.ts'],
        validationStatus: status,
        validationResult: {
          status,
          mode: 'remote',
          conclusion: status,
        },
      };

      expect(shouldWriteSkillOutcome(result)).toBe(true);
    }

    const inconclusive: ApplyResult = {
      success: false,
      modifiedFiles: ['spec.ts'],
      validationStatus: 'inconclusive',
      validationResult: {
        status: 'inconclusive',
        mode: 'remote',
        conclusion: 'inconclusive',
      },
    };
    expect(shouldWriteSkillOutcome(inconclusive)).toBe(false);
  });

  it('does not treat skipped validation as falsified fix evidence', () => {
    const result: ApplyResult = {
      success: true,
      modifiedFiles: ['spec.ts'],
      validationStatus: 'skipped',
    };

    expect(shouldWriteSkillOutcome(result)).toBe(false);
  });

});
