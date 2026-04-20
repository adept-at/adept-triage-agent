import { summarizeInvestigationForRetry } from '../../src/repair/simplified-repair-agent';
import {
  InvestigationOutput,
  InvestigationFinding,
} from '../../src/agents/investigation-agent';

describe('summarizeInvestigationForRetry (v1.49.1 Finding 2)', () => {
  const makeFinding = (
    overrides: Partial<InvestigationFinding> = {}
  ): InvestigationFinding => ({
    type: 'SELECTOR_CHANGE',
    severity: 'HIGH',
    description: 'Selector renamed in product code',
    evidence: ['PR diff shows data-testid rename'],
    relationToError: 'Direct cause of element-not-found',
    ...overrides,
  });

  const makeInvestigation = (
    overrides: Partial<InvestigationOutput> = {}
  ): InvestigationOutput => ({
    findings: [makeFinding()],
    primaryFinding: makeFinding(),
    isTestCodeFixable: true,
    recommendedApproach: 'Update selector to new data-testid',
    selectorsToUpdate: [],
    confidence: 85,
    ...overrides,
  });

  it('returns undefined when investigation is undefined', () => {
    expect(summarizeInvestigationForRetry(undefined)).toBeUndefined();
  });

  it('renders primary finding with severity, description, relationToError, and evidence', () => {
    const out = summarizeInvestigationForRetry(makeInvestigation());
    expect(out).toContain('Primary finding: [HIGH] Selector renamed in product code');
    expect(out).toContain('Relation to error: Direct cause of element-not-found');
    expect(out).toContain('Evidence: PR diff shows data-testid rename');
  });

  it('renders isTestCodeFixable boolean', () => {
    const fixable = summarizeInvestigationForRetry(makeInvestigation({ isTestCodeFixable: true }));
    const notFixable = summarizeInvestigationForRetry(makeInvestigation({ isTestCodeFixable: false }));
    expect(fixable).toContain('Is test-code fixable: true');
    expect(notFixable).toContain('Is test-code fixable: false');
  });

  it('renders recommendedApproach', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({ recommendedApproach: 'Widen the timeout to 30s' })
    );
    expect(out).toContain('Recommended approach: Widen the timeout to 30s');
  });

  // THIS is one of the key signals Finding 2 called out as dropped pre-v1.49.1.
  it('renders verdictOverride with suggestedLocation, confidence, and evidence', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        verdictOverride: {
          suggestedLocation: 'APP_CODE',
          confidence: 80,
          evidence: [
            'Product transcript API returning 500',
            'Same failure on 3 other specs this run',
            'Investigation found no recent test-code change for selector',
          ],
        },
      })
    );
    expect(out).toContain('Verdict override: APP_CODE (80% confidence)');
    expect(out).toContain('Product transcript API returning 500');
    expect(out).toContain('Same failure on 3 other specs this run');
  });

  it('truncates verdictOverride.evidence to 3 items', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        verdictOverride: {
          suggestedLocation: 'APP_CODE',
          confidence: 80,
          evidence: ['e1', 'e2', 'e3', 'e4', 'e5'],
        },
      })
    );
    expect(out).toContain('e1; e2; e3');
    expect(out).not.toContain('e4');
    expect(out).not.toContain('e5');
  });

  it('omits verdictOverride.evidence section when empty', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        verdictOverride: {
          suggestedLocation: 'APP_CODE',
          confidence: 70,
          evidence: [],
        },
      })
    );
    expect(out).toContain('Verdict override: APP_CODE (70% confidence)');
    // The nested "Evidence:" line comes right after "Verdict override:"
    // when present. Verify the immediate-next line isn't an Evidence line.
    const lines = (out ?? '').split('\n');
    const verdictIdx = lines.findIndex((l) => l.includes('Verdict override'));
    expect(lines[verdictIdx + 1] ?? '').not.toMatch(/Evidence:/);
  });

  // Also dropped pre-v1.49.1.
  it('renders selectorsToUpdate with current, reason, and suggestedReplacement', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        selectorsToUpdate: [
          {
            current: '[data-testid="submit"]',
            reason: 'Renamed to submit-button',
            suggestedReplacement: '[data-testid="submit-button"]',
          },
          {
            current: '.old-class',
            reason: 'Replaced with aria-label',
          },
        ],
      })
    );
    expect(out).toContain('Selectors flagged for update:');
    expect(out).toContain('`[data-testid="submit"]`: Renamed to submit-button');
    expect(out).toContain('suggested: `[data-testid="submit-button"]`');
    expect(out).toContain('`.old-class`: Replaced with aria-label');
  });

  it('truncates selectorsToUpdate to 5 items', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        selectorsToUpdate: Array.from({ length: 10 }, (_, i) => ({
          current: `.selector-${i}`,
          reason: `reason ${i}`,
        })),
      })
    );
    expect(out).toContain('.selector-0');
    expect(out).toContain('.selector-4');
    expect(out).not.toContain('.selector-5');
  });

  it('renders secondary findings (excluding primary) with severity, description, and relation', () => {
    const primary = makeFinding({ description: 'Primary description' });
    const secondary1 = makeFinding({
      severity: 'MEDIUM',
      description: 'Secondary one',
      relationToError: 'Contributing factor',
    });
    const secondary2 = makeFinding({
      severity: 'LOW',
      description: 'Secondary two',
      relationToError: 'Background signal',
    });
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        primaryFinding: primary,
        findings: [primary, secondary1, secondary2],
      })
    );
    expect(out).toContain('Other findings:');
    expect(out).toContain('[MEDIUM] Secondary one (Contributing factor)');
    expect(out).toContain('[LOW] Secondary two (Background signal)');
    // Primary should only appear once — as the "Primary finding" block
    expect(out!.match(/Primary description/g)?.length).toBe(1);
  });

  it('does NOT render "Other findings:" when findings list has only the primary', () => {
    const primary = makeFinding();
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        primaryFinding: primary,
        findings: [primary],
      })
    );
    expect(out).not.toContain('Other findings:');
  });

  it('truncates secondary findings to 3 items', () => {
    const primary = makeFinding({ description: 'primary' });
    const secondaries = Array.from({ length: 6 }, (_, i) =>
      makeFinding({ description: `secondary-${i}` })
    );
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        primaryFinding: primary,
        findings: [primary, ...secondaries],
      })
    );
    expect(out).toContain('secondary-0');
    expect(out).toContain('secondary-2');
    expect(out).not.toContain('secondary-3');
  });

  it('matches primary by description+severity when the primary ref is a separate clone', () => {
    // The orchestrator sometimes returns primaryFinding as a separate
    // object with the same data as an entry in findings[]. In that case
    // identity-equality won't dedupe — fall back to structural match.
    const primaryClone = makeFinding({ description: 'clone-primary', severity: 'HIGH' });
    const inList = makeFinding({ description: 'clone-primary', severity: 'HIGH' });
    const other = makeFinding({ description: 'other-finding' });
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        primaryFinding: primaryClone,
        findings: [inList, other],
      })
    );
    expect(out).toContain('clone-primary');
    expect(out).toContain('other-finding');
    // "clone-primary" should only appear once (in primary section), not in
    // the "Other findings:" block.
    expect(out!.match(/clone-primary/g)?.length).toBe(1);
  });

  it('returns undefined when every branch is empty (no signal at all)', () => {
    const out = summarizeInvestigationForRetry({
      findings: [],
      primaryFinding: undefined,
      isTestCodeFixable: undefined as unknown as boolean,
      recommendedApproach: '',
      selectorsToUpdate: [],
      confidence: 0,
    });
    expect(out).toBeUndefined();
  });

  it('omits primary-finding evidence block when evidence is empty', () => {
    const out = summarizeInvestigationForRetry(
      makeInvestigation({
        primaryFinding: makeFinding({ evidence: [] }),
        findings: [makeFinding({ evidence: [] })],
      })
    );
    expect(out).not.toMatch(/Primary finding:.*\n.*Evidence:/);
  });

  it('full-signal integration: every populated section appears in expected order', () => {
    const investigation = makeInvestigation({
      primaryFinding: makeFinding({
        severity: 'HIGH',
        description: 'primary desc',
        relationToError: 'primary rel',
        evidence: ['p-ev1'],
      }),
      isTestCodeFixable: false,
      recommendedApproach: 'approach text',
      verdictOverride: {
        suggestedLocation: 'APP_CODE',
        confidence: 77,
        evidence: ['vo-ev'],
      },
      selectorsToUpdate: [
        { current: 'a', reason: 'r', suggestedReplacement: 'b' },
      ],
      findings: [
        makeFinding({ severity: 'HIGH', description: 'primary desc' }),
        makeFinding({ severity: 'LOW', description: 'secondary' }),
      ],
    });
    const out = summarizeInvestigationForRetry(investigation) ?? '';

    // Rough ordering check — the helper renders sections in a fixed order.
    const order = [
      out.indexOf('Primary finding:'),
      out.indexOf('Is test-code fixable:'),
      out.indexOf('Recommended approach:'),
      out.indexOf('Verdict override:'),
      out.indexOf('Selectors flagged for update:'),
      out.indexOf('Other findings:'),
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i]).toBeGreaterThan(-1);
      expect(order[i]).toBeLessThan(order[i + 1]);
    }
  });
});
