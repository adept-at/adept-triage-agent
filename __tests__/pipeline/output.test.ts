import * as core from '@actions/core';
import { setSuccessOutput } from '../../src/pipeline/output';
import { CHRONIC_FLAKINESS_THRESHOLD } from '../../src/config/constants';

jest.mock('@actions/core');
jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'test-owner', repo: 'test-repo' } },
}));

describe('setSuccessOutput — auto-fix skip signal', () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const outputs = new Map<string, string>();

  beforeEach(() => {
    jest.clearAllMocks();
    outputs.clear();
    mockCore.setOutput.mockImplementation((name: string, value: unknown) => {
      outputs.set(name, String(value));
    });
  });

  const baseResult = {
    verdict: 'TEST_ISSUE',
    confidence: 95,
    reasoning: 'chronic flaky spec',
    summary: 'spec summary',
    indicators: ['flaky'],
  };

  const errorData = {
    screenshots: [{ name: 'shot-1.png' }],
    logs: ['line one'],
  };

  it('defaults auto_fix_skipped to "false" when the field is absent', () => {
    setSuccessOutput(baseResult, errorData, null);

    expect(outputs.get('auto_fix_skipped')).toBe('false');
    expect(outputs.has('auto_fix_skipped_reason')).toBe(false);

    const triage = JSON.parse(outputs.get('triage_json')!);
    expect(triage.autoFixSkipped).toBeUndefined();
    expect(triage.metadata.autoFixSkipped).toBe(false);
  });

  it('emits auto_fix_skipped=true + reason when the coordinator withholds the fix', () => {
    const reason =
      'Chronic flakiness: auto-fixed 4 times in 3 days. Skipping — needs human refactor.';

    setSuccessOutput(
      {
        ...baseResult,
        autoFixSkipped: true,
        autoFixSkippedReason: reason,
      },
      errorData,
      null,
      {
        isFlaky: true,
        fixCount: 4,
        windowDays: 3,
        message: 'auto-fixed 4 times in 3 days',
      }
    );

    expect(outputs.get('auto_fix_skipped')).toBe('true');
    expect(outputs.get('auto_fix_skipped_reason')).toBe(reason);

    const triage = JSON.parse(outputs.get('triage_json')!);
    expect(triage.autoFixSkipped).toBe(true);
    expect(triage.autoFixSkippedReason).toBe(reason);
    expect(triage.metadata.autoFixSkipped).toBe(true);
    // Classification is still honest — verdict/confidence unchanged
    expect(triage.verdict).toBe('TEST_ISSUE');
    expect(triage.confidence).toBe(95);
    // Flakiness block is preserved for downstream dashboards
    expect(triage.flakiness).toEqual({
      isFlaky: true,
      fixCount: 4,
      windowDays: 3,
      message: 'auto-fixed 4 times in 3 days',
    });
  });

  it('logs a human-readable skip notice to core.info', () => {
    const infoCalls: string[] = [];
    mockCore.info.mockImplementation((msg: string) => {
      infoCalls.push(msg);
    });

    setSuccessOutput(
      {
        ...baseResult,
        autoFixSkipped: true,
        autoFixSkippedReason: 'needs human refactor',
      },
      errorData,
      null
    );

    expect(
      infoCalls.some(
        (m) =>
          m.includes('Auto-fix intentionally skipped') &&
          m.includes('needs human refactor')
      )
    ).toBe(true);
  });

  it('keeps auto_fix_applied=false and validation_status=skipped on the skip path', () => {
    setSuccessOutput(
      {
        ...baseResult,
        autoFixSkipped: true,
        autoFixSkippedReason: 'chronic flakiness',
      },
      errorData,
      null
    );

    expect(outputs.get('auto_fix_applied')).toBe('false');
    expect(outputs.get('validation_status')).toBe('skipped');
  });
});

describe('CHRONIC_FLAKINESS_THRESHOLD', () => {
  it('is exported as a positive integer', () => {
    expect(Number.isInteger(CHRONIC_FLAKINESS_THRESHOLD)).toBe(true);
    expect(CHRONIC_FLAKINESS_THRESHOLD).toBeGreaterThan(0);
  });

  it('is set to 3 — aligned with the default flakiness windows', () => {
    // The skill store marks isFlaky at 2 fixes in 3 days (short window) or
    // 3 in 7 days (long window). A threshold of 3 means we only skip after
    // the SECOND retry has already been tried (fixCount=3) — giving the
    // agent enough signal that its fixes aren't sticking.
    expect(CHRONIC_FLAKINESS_THRESHOLD).toBe(3);
  });
});
