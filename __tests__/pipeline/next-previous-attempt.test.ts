import {
  buildNextPreviousAttempt,
  FixResultForRetry,
} from '../../src/pipeline/validator';
import { FixRecommendation } from '../../src/types';

describe('buildNextPreviousAttempt (v1.49.1 staleness-avoidance)', () => {
  const makeFix = (overrides: Partial<FixRecommendation> = {}): FixRecommendation => ({
    confidence: 80,
    summary: 'Update selector',
    reasoning: 'Selector renamed',
    evidence: [],
    proposedChanges: [
      {
        file: 'test.cy.ts',
        line: 10,
        oldCode: 'cy.get(\'[data-testid="old"]\')',
        newCode: 'cy.get(\'[data-testid="new"]\')',
        justification: 'Renamed in product',
      },
    ],
    ...overrides,
  });

  it('builds a previousAttempt with the literal fields from fixResult', () => {
    const out = buildNextPreviousAttempt(
      2,
      makeFix(),
      { agentRootCause: 'SELECTOR_MISMATCH', agentInvestigationFindings: 'PR renamed data-testid' },
      'test failed after 30s'
    );

    expect(out.iteration).toBe(2);
    expect(out.priorAgentRootCause).toBe('SELECTOR_MISMATCH');
    expect(out.priorAgentInvestigationFindings).toBe('PR renamed data-testid');
    expect(out.validationLogs).toBe('test failed after 30s');
  });

  it("forwards the previousFix reference without copying", () => {
    const fix = makeFix();
    const out = buildNextPreviousAttempt(
      2,
      fix,
      { agentRootCause: 'X' },
      'logs'
    );
    expect(out.previousFix).toBe(fix);
  });

  // This is THE regression test for Finding 1 from the v1.49.1 review.
  // The reviewer correctly identified that the pre-v1.49.1 code pulled
  // priorAgent* fields from an outer-scope accumulator, so if iteration N
  // returned no investigation findings, iteration N+1 would still see
  // iteration N-1's findings presented as if iteration N had concluded
  // them. Using this helper makes that bug impossible by construction:
  // there is no outer-scope parameter to accidentally leak in.
  it('returns priorAgentInvestigationFindings=undefined when fixResult has no findings (Finding 1 regression)', () => {
    const out = buildNextPreviousAttempt(
      2,
      makeFix(),
      { agentRootCause: undefined, agentInvestigationFindings: undefined },
      'logs'
    );

    expect(out.priorAgentInvestigationFindings).toBeUndefined();
    expect(out.priorAgentRootCause).toBeUndefined();
  });

  it('returns priorAgentRootCause=undefined when fixResult omits it', () => {
    // Simulates a run where investigation produced findings but analysis
    // fell back to single-shot / infrastructure classification with no
    // structured root cause. priorAgentRootCause should still be
    // undefined, not pulled from a prior iteration.
    const out = buildNextPreviousAttempt(
      2,
      makeFix(),
      { agentInvestigationFindings: 'something' },
      'logs'
    );

    expect(out.priorAgentRootCause).toBeUndefined();
    expect(out.priorAgentInvestigationFindings).toBe('something');
  });

  it('is pure — calling it twice with different fixResults does not share state', () => {
    const fix = makeFix();
    const first = buildNextPreviousAttempt(
      2,
      fix,
      { agentRootCause: 'FIRST', agentInvestigationFindings: 'FIRST_FINDINGS' },
      'logs1'
    );
    const second = buildNextPreviousAttempt(
      3,
      fix,
      { agentRootCause: undefined, agentInvestigationFindings: undefined },
      'logs2'
    );

    // This is the scenario that triggered the bug: iteration 1 has
    // findings, iteration 2 does not. The second call's output MUST NOT
    // carry iteration 1's findings.
    expect(first.priorAgentInvestigationFindings).toBe('FIRST_FINDINGS');
    expect(second.priorAgentInvestigationFindings).toBeUndefined();
    expect(first.priorAgentRootCause).toBe('FIRST');
    expect(second.priorAgentRootCause).toBeUndefined();
  });

  it('accepts FixResultForRetry with extra fields (structural typing)', () => {
    // Real callers pass a larger object (the full generateFixRecommendation
    // return). Confirm the helper signature accepts it.
    const fullResult = {
      fix: makeFix(),
      lastResponseId: 'resp_123',
      agentRootCause: 'X',
      agentInvestigationFindings: 'Y',
    };
    const out = buildNextPreviousAttempt(
      2,
      makeFix(),
      fullResult as FixResultForRetry,
      'logs'
    );
    expect(out.priorAgentRootCause).toBe('X');
    expect(out.priorAgentInvestigationFindings).toBe('Y');
  });
});
