import {
  buildPriorAttemptContext,
  PriorAttemptContext,
} from '../../src/repair/simplified-repair-agent';
import { FixRecommendation } from '../../src/types';

describe('buildPriorAttemptContext (R4)', () => {
  const makeFix = (overrides: Partial<FixRecommendation> = {}): FixRecommendation => ({
    confidence: 80,
    summary: 'Update selector',
    reasoning: 'Selector renamed in product code',
    evidence: [],
    proposedChanges: [
      {
        file: 'test.cy.ts',
        line: 42,
        oldCode: 'cy.get(\'[data-testid="old"]\')',
        newCode: 'cy.get(\'[data-testid="new"]\')',
        justification: 'Renamed in product',
      },
    ],
    ...overrides,
  });

  const makePrior = (
    overrides: Partial<PriorAttemptContext> = {}
  ): PriorAttemptContext => ({
    iteration: 2,
    previousFix: makeFix(),
    validationLogs: 'test failed after 30s: element not found',
    ...overrides,
  });

  it('renders the PREVIOUS FIX ATTEMPT header with the iteration number', () => {
    const out = buildPriorAttemptContext(makePrior({ iteration: 3 }));
    expect(out).toContain('PREVIOUS FIX ATTEMPT #3 — FAILED VALIDATION');
  });

  it('renders the previous fix diff (file, oldCode, newCode)', () => {
    const out = buildPriorAttemptContext(makePrior());
    expect(out).toContain('File: test.cy.ts');
    expect(out).toContain('cy.get(\'[data-testid="old"]\')');
    expect(out).toContain('cy.get(\'[data-testid="new"]\')');
  });

  it('renders validation failure logs', () => {
    const out = buildPriorAttemptContext(makePrior());
    expect(out).toContain('Validation Failure Logs');
    expect(out).toContain('test failed after 30s: element not found');
  });

  it('truncates validation logs to the default 8000-char budget', () => {
    const longLogs = 'x'.repeat(12000);
    const out = buildPriorAttemptContext(makePrior({ validationLogs: longLogs }));
    // The rendered log slice should be exactly 8000 chars of x's; full 12000 should NOT be present.
    expect(out).toContain('x'.repeat(8000));
    expect(out).not.toContain('x'.repeat(8001));
  });

  it('respects a custom logBudget option (single-shot path uses 6000)', () => {
    const longLogs = 'y'.repeat(9000);
    const out = buildPriorAttemptContext(makePrior({ validationLogs: longLogs }), {
      logBudget: 6000,
    });
    expect(out).toContain('y'.repeat(6000));
    expect(out).not.toContain('y'.repeat(6001));
  });

  it('renders the prior agent reasoning section when priorAgentRootCause is set', () => {
    const out = buildPriorAttemptContext(
      makePrior({ priorAgentRootCause: 'SELECTOR_MISMATCH' })
    );
    expect(out).toContain("Prior iteration's agent reasoning");
    expect(out).toContain('Root cause (from analysis):** SELECTOR_MISMATCH');
  });

  it('renders prior investigation findings when provided', () => {
    const out = buildPriorAttemptContext(
      makePrior({
        priorAgentInvestigationFindings:
          'Test waits 3s but product now loads lazily up to 8s',
      })
    );
    expect(out).toContain('Investigation findings');
    expect(out).toContain('lazily up to 8s');
  });

  it("renders fix-gen's reasoning (FixRecommendation.reasoning)", () => {
    const out = buildPriorAttemptContext(
      makePrior({
        previousFix: makeFix({ reasoning: 'Selector data-testid was renamed in the product' }),
      })
    );
    expect(out).toContain("Fix-gen's reasoning");
    expect(out).toContain('Selector data-testid was renamed in the product');
  });

  it('renders all four failureModeTrace fields when present', () => {
    const out = buildPriorAttemptContext(
      makePrior({
        previousFix: makeFix({
          failureModeTrace: {
            originalState: 'element absent at t=3s',
            rootMechanism: 'product now lazy-loads after 5s',
            newStateAfterFix: 'wait increased to 10s',
            whyAssertionPassesNow: 'element loads within new window',
          },
        }),
      })
    );
    expect(out).toContain('failureModeTrace');
    expect(out).toContain('element absent at t=3s');
    expect(out).toContain('product now lazy-loads after 5s');
    expect(out).toContain('wait increased to 10s');
    expect(out).toContain('element loads within new window');
  });

  it('shows (empty) placeholder for missing trace sub-fields', () => {
    const out = buildPriorAttemptContext(
      makePrior({
        previousFix: makeFix({
          failureModeTrace: {
            originalState: 'concrete value',
            rootMechanism: '',
            newStateAfterFix: '',
            whyAssertionPassesNow: '',
          },
        }),
      })
    );
    expect(out).toContain('originalState: concrete value');
    expect(out).toContain('rootMechanism: (empty)');
    expect(out).toContain('newStateAfterFix: (empty)');
    expect(out).toContain('whyAssertionPassesNow: (empty)');
  });

  it("omits the prior reasoning section entirely when no reasoning signal is present", () => {
    const out = buildPriorAttemptContext(
      makePrior({
        previousFix: makeFix({ reasoning: '', failureModeTrace: undefined }),
        priorAgentRootCause: undefined,
        priorAgentInvestigationFindings: undefined,
      })
    );
    expect(out).not.toContain("Prior iteration's agent reasoning");
  });

  it('always includes the "try a DIFFERENT approach" instructions', () => {
    const out = buildPriorAttemptContext(makePrior());
    expect(out).toContain('Instructions for this iteration');
    expect(out).toMatch(/Re-analyze from scratch/i);
    expect(out).toMatch(/Do NOT repeat the same fix/i);
  });

  it('joins multiple proposedChanges into the diff section', () => {
    const multiChangeFix = makeFix({
      proposedChanges: [
        {
          file: 'a.ts',
          line: 1,
          oldCode: 'old-a',
          newCode: 'new-a',
          justification: 'x',
        },
        {
          file: 'b.ts',
          line: 2,
          oldCode: 'old-b',
          newCode: 'new-b',
          justification: 'y',
        },
      ],
    });
    const out = buildPriorAttemptContext(makePrior({ previousFix: multiChangeFix }));
    expect(out).toContain('File: a.ts');
    expect(out).toContain('File: b.ts');
    expect(out).toContain('old-a');
    expect(out).toContain('old-b');
  });

  it('renders full reasoning block when priorAgentRootCause, investigation findings, reasoning, and trace are all present', () => {
    const out = buildPriorAttemptContext(
      makePrior({
        priorAgentRootCause: 'TIMING_RACE',
        priorAgentInvestigationFindings: 'Product lazy-loads at 5s',
        previousFix: makeFix({
          reasoning: 'Increase wait timeout',
          failureModeTrace: {
            originalState: 't=3s: not loaded',
            rootMechanism: 'race between test + lazy load',
            newStateAfterFix: 't=10s: loaded',
            whyAssertionPassesNow: 'product always loads within 10s',
          },
        }),
      })
    );
    expect(out).toContain('TIMING_RACE');
    expect(out).toContain('Product lazy-loads at 5s');
    expect(out).toContain('Increase wait timeout');
    expect(out).toContain('race between test + lazy load');
  });
});
