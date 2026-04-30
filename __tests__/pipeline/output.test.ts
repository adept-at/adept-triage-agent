import * as core from '@actions/core';
import { finalizeRepairTelemetry, setSuccessOutput } from '../../src/pipeline/output';
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
    expect(triage.repair.status).toBe('not_started');
    expect(outputs.get('repair_status')).toBe('not_started');
    expect(outputs.get('repair_summary')).toContain('Repair did not run');
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

  it('emits structured remote validation details in triage_json and outputs', () => {
    setSuccessOutput(
      {
        ...baseResult,
        fixRecommendation: {
          confidence: 84,
          summary: 'wait for persisted image',
          proposedChanges: [
            {
              file: 'cypress/spec.cy.ts',
              line: 42,
              oldCode: 'cy.wait(2000)',
              newCode: "cy.wait('@save')",
              justification: 'replace fixed sleep with network synchronization',
            },
          ],
          evidence: ['validation evidence'],
          reasoning: 'the fixed wait was not deterministic',
        },
      },
      errorData,
      {
        success: true,
        modifiedFiles: ['cypress/spec.cy.ts'],
        commitSha: 'abc123',
        branchName: 'fix/triage-agent/spec-20260430-001',
        validationRunId: 123,
        validationStatus: 'failed',
        validationUrl: 'https://github.com/test-owner/test-repo/actions/runs/123',
        validationResult: {
          status: 'failed',
          mode: 'remote',
          runId: 123,
          url: 'https://github.com/test-owner/test-repo/actions/runs/123',
          conclusion: 'failure',
          failure: {
            primaryError: 'AssertionError: expected undefined to exist',
            failedAssertion: 'expected undefined to exist',
            failureStage: 'validation',
          },
        },
      }
    );

    expect(outputs.get('auto_fix_applied')).toBe('true');
    expect(outputs.get('validation_status')).toBe('failed');
    expect(outputs.get('validation_run_id')).toBe('123');

    const triage = JSON.parse(outputs.get('triage_json')!);
    const expectedValidation = {
      status: 'failed',
      mode: 'remote',
      runId: 123,
      url: 'https://github.com/test-owner/test-repo/actions/runs/123',
      conclusion: 'failure',
      failure: {
        primaryError: 'AssertionError: expected undefined to exist',
        failedAssertion: 'expected undefined to exist',
        failureStage: 'validation',
      },
    };
    expect(triage.autoFix.validation).toEqual(expectedValidation);
    expect(triage.validation).toEqual(expectedValidation);
  });

  it('keeps pending remote validation mode when no run id was found', () => {
    setSuccessOutput(
      {
        ...baseResult,
        fixRecommendation: {
          confidence: 84,
          summary: 'wait for persisted image',
          proposedChanges: [
            {
              file: 'cypress/spec.cy.ts',
              line: 42,
              oldCode: 'cy.wait(2000)',
              newCode: "cy.wait('@save')",
              justification: 'replace fixed sleep with network synchronization',
            },
          ],
          evidence: ['validation dispatched'],
          reasoning: 'remote validation is still pending',
        },
      },
      errorData,
      {
        success: true,
        modifiedFiles: ['cypress/spec.cy.ts'],
        commitSha: 'abc123',
        branchName: 'fix/triage-agent/spec-20260430-001',
        validationStatus: 'pending',
        validationResult: {
          status: 'pending',
          mode: 'remote',
          conclusion: 'dispatched-run-not-found',
        },
      }
    );

    expect(outputs.get('validation_status')).toBe('pending');
    const triage = JSON.parse(outputs.get('triage_json')!);
    expect(triage.autoFix.validation).toEqual({
      status: 'pending',
      mode: 'remote',
      conclusion: 'dispatched-run-not-found',
    });
    expect(triage.validation).toEqual({
      status: 'pending',
      mode: 'remote',
      conclusion: 'dispatched-run-not-found',
    });
  });

  it('emits validation details even when push failed after local validation passed', () => {
    setSuccessOutput(
      {
        ...baseResult,
        fixRecommendation: {
          confidence: 84,
          summary: 'wait for persisted image',
          proposedChanges: [
            {
              file: 'cypress/spec.cy.ts',
              line: 42,
              oldCode: 'cy.wait(2000)',
              newCode: "cy.wait('@save')",
              justification: 'replace fixed sleep with network synchronization',
            },
          ],
          evidence: ['local validation passed'],
          reasoning: 'validation passed before push failed',
        },
      },
      errorData,
      {
        success: false,
        modifiedFiles: ['cypress/spec.cy.ts'],
        error: 'Push failed after successful test',
        validationStatus: 'passed',
        validationResult: {
          status: 'passed',
          mode: 'local',
          conclusion: 'success',
        },
      }
    );

    expect(outputs.get('auto_fix_applied')).toBe('false');
    expect(outputs.get('validation_status')).toBe('passed');
    const triage = JSON.parse(outputs.get('triage_json')!);
    expect(triage.autoFix).toBeUndefined();
    expect(triage.validation).toEqual({
      status: 'passed',
      mode: 'local',
      conclusion: 'success',
    });
  });

  it('emits repair_* outputs and triage_json.repair for review_rejected telemetry', () => {
    setSuccessOutput(
      {
        ...baseResult,
        repairTelemetry: {
          status: 'review_rejected',
          summary:
            'No auto-fix applied. Generated fix was rejected by review: trace too vague',
          iterations: 1,
          lastStage: 'review',
          lastReviewIssues: ['[CRITICAL] failureModeTrace too vague'],
          lastReviewAssessment: 'Reject',
          lastFixSummary: 'Add wait',
          lastFixConfidence: 85,
          elapsedMs: 1200,
        },
      },
      errorData,
      null
    );

    expect(outputs.get('repair_status')).toBe('review_rejected');
    expect(outputs.get('repair_summary')).toContain('rejected by review');
    expect(outputs.get('repair_iterations')).toBe('1');
    expect(outputs.get('repair_last_stage')).toBe('review');
    expect(outputs.get('repair_review_issues')).toContain('CRITICAL');

    const triage = JSON.parse(outputs.get('triage_json')!);
    expect(triage.repair.status).toBe('review_rejected');
    expect(triage.repair.iterations).toBe(1);
  });

  it('finalizeRepairTelemetry promotes approved to validated when validation passed', () => {
    const merged = finalizeRepairTelemetry(
      {
        status: 'approved',
        summary: 'Fix passed review',
        iterations: 1,
        elapsedMs: 100,
      },
      null,
      {
        success: true,
        modifiedFiles: ['a.ts'],
        commitSha: 'c1',
        branchName: 'fix/b',
        validationResult: { status: 'passed', mode: 'remote', conclusion: 'success' },
        validationStatus: 'passed',
      }
    );
    expect(merged.status).toBe('validated');
    expect(merged.summary).toBe('Auto-fix validated.');
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
