import {
  SkillStore,
  TriageSkill,
  normalizeError,
  normalizeFramework,
  buildSkill,
  describeFixPattern,
  formatSkillsForPrompt,
  FlakinessSignal,
} from '../../src/services/skill-store';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

// Mock the AWS SDK modules so both static and dynamic imports resolve to
// lightweight fakes. The command classes are named so `constructor.name`
// works for assertion.
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class DynamoDBClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_cfg: any) {}
  },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const sharedSend = jest.fn();
  return {
    __send: sharedSend,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    QueryCommand: class QueryCommand { constructor(public input: any) {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PutCommand: class PutCommand { constructor(public input: any) {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DeleteCommand: class DeleteCommand { constructor(public input: any) {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    UpdateCommand: class UpdateCommand { constructor(public input: any) {} },
    DynamoDBDocumentClient: {
      from: () => ({ send: sharedSend }),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockSend = require('@aws-sdk/lib-dynamodb').__send as jest.Mock;

function makeSkill(overrides: Partial<TriageSkill> = {}): TriageSkill {
  return {
    id: 'skill-1',
    createdAt: new Date().toISOString(),
    repo: 'adept-at/lib-wdio-8-e2e-ts',
    spec: 'test/specs/skills/lms.video.plays.e2e.ts',
    testName: 'should play video',
    framework: 'webdriverio',
    errorPattern: 'element ("mux-player") still not clickable after {timeout}ms',
    rootCauseCategory: 'WAIT_ADDITION',
    fix: {
      file: 'test/specs/skills/lms.video.plays.e2e.ts',
      changeType: 'WAIT_ADDITION',
      summary: 'Added waitForClickable before click',
      pattern: 'Added waitForClickable with extended timeout before clicking mux-player element',
    },
    confidence: 85,
    iterations: 1,
    prUrl: 'https://github.com/adept-at/lib-wdio-8-e2e-ts/pull/42',
    validatedLocally: true,
    priorSkillCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeError
// ---------------------------------------------------------------------------
describe('normalizeError', () => {
  it('replaces timeout values with placeholder', () => {
    expect(normalizeError('element not clickable after 15000ms')).toBe(
      'element not clickable after {timeout}ms'
    );
  });

  it('replaces line:col references', () => {
    expect(normalizeError('error at file.ts:42:5')).toBe(
      'error at file.ts:{line}:{col}'
    );
  });

  it('replaces commit SHAs', () => {
    expect(normalizeError('at commit abc1234')).toBe('at commit {sha}');
  });

  it('replaces ISO timestamps', () => {
    const result = normalizeError('failed at 2026-04-06T12:30:00.000Z');
    expect(result).toContain('{timestamp}');
    expect(result).not.toContain('2026-04-06');
  });

  it('collapses whitespace', () => {
    expect(normalizeError('too   many    spaces')).toBe('too many spaces');
  });

  it('truncates to 300 chars', () => {
    const long = 'x'.repeat(500);
    expect(normalizeError(long).length).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// normalizeFramework
// ---------------------------------------------------------------------------
describe('normalizeFramework', () => {
  it('returns cypress for "cypress"', () => {
    expect(normalizeFramework('cypress')).toBe('cypress');
  });

  it('returns webdriverio for "webdriverio"', () => {
    expect(normalizeFramework('webdriverio')).toBe('webdriverio');
  });

  it('is case-insensitive', () => {
    expect(normalizeFramework('Cypress')).toBe('cypress');
    expect(normalizeFramework('WebDriverIO')).toBe('webdriverio');
    expect(normalizeFramework('WEBDRIVERIO')).toBe('webdriverio');
  });

  it('returns unknown for "javascript"', () => {
    expect(normalizeFramework('javascript')).toBe('unknown');
  });

  it('returns unknown for undefined', () => {
    expect(normalizeFramework(undefined)).toBe('unknown');
  });

  it('returns unknown for empty string', () => {
    expect(normalizeFramework('')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// buildSkill
// ---------------------------------------------------------------------------
describe('buildSkill', () => {
  it('creates a skill with normalized framework and error', () => {
    const skill = buildSkill({
      repo: 'adept-at/test-repo',
      spec: 'test.ts',
      testName: 'my test',
      framework: 'javascript',
      errorMessage: 'failed after 5000ms at file.ts:10:5',
      rootCauseCategory: 'TIMEOUT',
      fix: { file: 'test.ts', changeType: 'WAIT_ADDITION', summary: 'add wait', pattern: 'added wait' },
      confidence: 80,
      iterations: 1,
      prUrl: 'https://example.com/pr/1',
      validatedLocally: true,
      priorSkillCount: 0,
    });

    expect(skill.framework).toBe('unknown');
    expect(skill.errorPattern).toContain('{timeout}ms');
    expect(skill.errorPattern).toContain('{line}:{col}');
    expect(skill.id).toBeDefined();
    expect(skill.createdAt).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // R3: failureModeTrace persistence
  // ---------------------------------------------------------------------------
  it('persists failureModeTrace when provided', () => {
    const trace = {
      originalState: 'element absent at t=3s',
      rootMechanism: 'product lazy-loads after 5s',
      newStateAfterFix: 'wait extended to 10s',
      whyAssertionPassesNow: 'product always ready within 10s',
    };
    const skill = buildSkill({
      repo: 'adept-at/test-repo',
      spec: 'test.ts',
      testName: 'my test',
      framework: 'webdriverio',
      errorMessage: 'element not clickable',
      rootCauseCategory: 'TIMEOUT',
      fix: { file: 'test.ts', changeType: 'WAIT_ADDITION', summary: 'add wait', pattern: 'waitForClickable' },
      confidence: 85,
      iterations: 1,
      prUrl: '',
      validatedLocally: true,
      priorSkillCount: 0,
      failureModeTrace: trace,
    });

    expect(skill.failureModeTrace).toEqual(trace);
  });

  it('leaves failureModeTrace undefined when not provided (no empty object)', () => {
    const skill = buildSkill({
      repo: 'adept-at/test-repo',
      spec: 'test.ts',
      testName: 'my test',
      framework: 'webdriverio',
      errorMessage: 'boom',
      rootCauseCategory: 'UNKNOWN',
      fix: { file: 'test.ts', changeType: 'OTHER', summary: 'x', pattern: 'x' },
      confidence: 70,
      iterations: 1,
      prUrl: '',
      validatedLocally: false,
      priorSkillCount: 0,
    });

    expect(skill.failureModeTrace).toBeUndefined();
    // The key should not even be present in the object — keeps DynamoDB
    // items lean and makes `skill.failureModeTrace` truthy-checks work.
    expect(Object.prototype.hasOwnProperty.call(skill, 'failureModeTrace')).toBe(false);
  });

  it('persists a partially-populated trace (e.g. only originalState has content)', () => {
    const skill = buildSkill({
      repo: 'adept-at/test-repo',
      spec: 'test.ts',
      testName: 'my test',
      framework: 'cypress',
      errorMessage: 'boom',
      rootCauseCategory: 'UNKNOWN',
      fix: { file: 'test.cy.ts', changeType: 'OTHER', summary: 'x', pattern: 'x' },
      confidence: 70,
      iterations: 1,
      prUrl: '',
      validatedLocally: true,
      priorSkillCount: 0,
      failureModeTrace: {
        originalState: 'concrete value captured',
        rootMechanism: '',
        newStateAfterFix: '',
        whyAssertionPassesNow: '',
      },
    });

    expect(skill.failureModeTrace?.originalState).toBe('concrete value captured');
    expect(skill.failureModeTrace?.rootMechanism).toBe('');
  });
});

// ---------------------------------------------------------------------------
// describeFixPattern
// ---------------------------------------------------------------------------
describe('describeFixPattern', () => {
  it('uses justification when available', () => {
    const result = describeFixPattern([
      { file: 'a.ts', oldCode: 'old', newCode: 'new', justification: 'Added wait for element' },
    ]);
    expect(result).toBe('Added wait for element');
  });

  it('falls back to file description when no justification', () => {
    const result = describeFixPattern([
      { file: 'b.ts', oldCode: 'old', newCode: 'new' },
    ]);
    expect(result).toBe('Modified b.ts');
  });

  it('joins multiple changes with semicolons', () => {
    const result = describeFixPattern([
      { file: 'a.ts', oldCode: 'o', newCode: 'n', justification: 'Fix A' },
      { file: 'b.ts', oldCode: 'o', newCode: 'n', justification: 'Fix B' },
    ]);
    expect(result).toBe('Fix A; Fix B');
  });

  it('prefixes with [changeType] when provided', () => {
    const result = describeFixPattern([
      { file: 'a.ts', oldCode: 'o', newCode: 'n', justification: 'Added wait', changeType: 'WAIT_ADDITION' },
    ]);
    expect(result).toBe('[WAIT_ADDITION] Added wait');
  });

  it('handles mixed entries with and without changeType', () => {
    const result = describeFixPattern([
      { file: 'a.ts', oldCode: 'o', newCode: 'n', justification: 'Fix selector', changeType: 'SELECTOR_UPDATE' },
      { file: 'b.ts', oldCode: 'o', newCode: 'n', justification: 'Add timeout' },
    ]);
    expect(result).toBe('[SELECTOR_UPDATE] Fix selector; Add timeout');
  });
});

// ---------------------------------------------------------------------------
// SkillStore.findRelevant
// ---------------------------------------------------------------------------
describe('SkillStore.findRelevant', () => {
  function storeWith(skills: TriageSkill[]): SkillStore {
    const store = new SkillStore('us-east-1', 'test-table', 'adept-at', 'test');
    (store as any).skills = skills;
    return store;
  }

  it('returns exact spec matches', () => {
    const s = makeSkill({ spec: 'target.ts', framework: 'cypress' });
    const store = storeWith([s]);

    const result = store.findRelevant({ framework: 'cypress', spec: 'target.ts' });
    expect(result).toHaveLength(1);
    expect(result[0].spec).toBe('target.ts');
  });

  it('returns empty when framework does not match', () => {
    const s = makeSkill({ framework: 'cypress' });
    const store = storeWith([s]);

    const result = store.findRelevant({ framework: 'webdriverio', spec: s.spec });
    expect(result).toEqual([]);
  });

  it('includes unknown-framework skills as fallback', () => {
    const s = makeSkill({ framework: 'unknown' });
    const store = storeWith([s]);

    const result = store.findRelevant({ framework: 'webdriverio', spec: s.spec });
    expect(result).toHaveLength(1);
  });

  it('normalizes incoming framework on read', () => {
    const s = makeSkill({ framework: 'cypress' });
    const store = storeWith([s]);

    const result = store.findRelevant({ framework: 'Cypress', spec: s.spec });
    expect(result).toHaveLength(1);
  });

  it('scores by error similarity when no spec match', () => {
    const s1 = makeSkill({
      id: 's1',
      spec: 'other.ts',
      errorPattern: 'element ("mux-player") still not clickable after {timeout}ms',
    });
    const s2 = makeSkill({
      id: 's2',
      spec: 'other2.ts',
      errorPattern: 'completely different error about network failure',
    });
    const store = storeWith([s1, s2]);

    const result = store.findRelevant({
      framework: 'webdriverio',
      errorMessage: 'element ("mux-player") still not clickable after 20000ms',
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('s1');
  });

  it('normalizes incoming errorMessage before comparison', () => {
    const s = makeSkill({
      errorPattern: 'failed after {timeout}ms at file.ts:{line}:{col}',
    });
    const store = storeWith([s]);

    const result = store.findRelevant({
      framework: 'webdriverio',
      spec: s.spec,
      errorMessage: 'failed after 9999ms at file.ts:42:5',
    });
    expect(result).toHaveLength(1);
  });

  it('respects limit parameter', () => {
    const skills = Array.from({ length: 10 }, (_, i) =>
      makeSkill({ id: `s-${i}`, spec: 'same.ts' })
    );
    const store = storeWith(skills);

    const result = store.findRelevant({ framework: 'webdriverio', spec: 'same.ts', limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('returns empty for no matching spec or error', () => {
    const s = makeSkill({ spec: 'other.ts' });
    const store = storeWith([s]);

    const result = store.findRelevant({ framework: 'webdriverio' });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SkillStore.detectFlakiness
// ---------------------------------------------------------------------------
describe('SkillStore.detectFlakiness', () => {
  function storeWith(skills: TriageSkill[]): SkillStore {
    const store = new SkillStore('us-east-1', 'test-table', 'adept-at', 'test');
    (store as any).skills = skills;
    return store;
  }

  it('returns not flaky when no skills exist', () => {
    const store = storeWith([]);
    const result = store.detectFlakiness('any-spec.ts');
    expect(result.isFlaky).toBe(false);
    expect(result.fixCount).toBe(0);
  });

  it('returns not flaky with 1 fix in 3 days', () => {
    const store = storeWith([
      makeSkill({ spec: 'test.ts', createdAt: new Date(Date.now() - 86_400_000).toISOString() }),
    ]);
    const result = store.detectFlakiness('test.ts');
    expect(result.isFlaky).toBe(false);
  });

  it('detects flakiness with 2 fixes in 3 days', () => {
    const store = storeWith([
      makeSkill({ id: '1', spec: 'test.ts', createdAt: new Date(Date.now() - 86_400_000).toISOString() }),
      makeSkill({ id: '2', spec: 'test.ts', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
    ]);
    const result = store.detectFlakiness('test.ts');
    expect(result.isFlaky).toBe(true);
    expect(result.windowDays).toBe(3);
  });

  it('detects flakiness with 3 fixes in 7 days', () => {
    const store = storeWith([
      makeSkill({ id: '1', spec: 'test.ts', createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString() }),
      makeSkill({ id: '2', spec: 'test.ts', createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }),
      makeSkill({ id: '3', spec: 'test.ts', createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString() }),
    ]);
    const result = store.detectFlakiness('test.ts');
    expect(result.isFlaky).toBe(true);
    expect(result.windowDays).toBe(7);
  });

  it('ignores skills for other specs', () => {
    const store = storeWith([
      makeSkill({ id: '1', spec: 'other.ts', createdAt: new Date().toISOString() }),
      makeSkill({ id: '2', spec: 'other.ts', createdAt: new Date().toISOString() }),
      makeSkill({ id: '3', spec: 'other.ts', createdAt: new Date().toISOString() }),
    ]);
    const result = store.detectFlakiness('test.ts');
    expect(result.isFlaky).toBe(false);
  });

  it('ignores old skills outside the 7-day window', () => {
    const store = storeWith([
      makeSkill({ id: '1', spec: 'test.ts', createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString() }),
      makeSkill({ id: '2', spec: 'test.ts', createdAt: new Date(Date.now() - 11 * 86_400_000).toISOString() }),
      makeSkill({ id: '3', spec: 'test.ts', createdAt: new Date(Date.now() - 12 * 86_400_000).toISOString() }),
    ]);
    const result = store.detectFlakiness('test.ts');
    expect(result.isFlaky).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatSkillsForPrompt
// ---------------------------------------------------------------------------
describe('formatSkillsForPrompt', () => {
  it('returns empty string when no skills and not flaky', () => {
    expect(formatSkillsForPrompt([], 'fix_generation')).toBe('');
  });

  it('returns flakiness signal even with no skills', () => {
    const flakiness: FlakinessSignal = {
      isFlaky: true,
      fixCount: 3,
      windowDays: 3,
      message: 'Spec fixed 3 times in 3 days',
    };
    const result = formatSkillsForPrompt([], 'fix_generation', flakiness);
    expect(result).toContain('FLAKINESS SIGNAL');
    expect(result).toContain('Spec fixed 3 times in 3 days');
  });

  it('uses investigation framing for investigation role', () => {
    const result = formatSkillsForPrompt([makeSkill()], 'investigation');
    expect(result).toContain('do NOT anchor on prior patterns');
    expect(result).toContain('Agent Memory: Prior Fixes');
  });

  it('uses fix_generation framing for fix_generation role', () => {
    const result = formatSkillsForPrompt([makeSkill()], 'fix_generation');
    expect(result).toContain('CONSIDER these approaches');
    expect(result).toContain('Prior Fix Patterns');
  });

  it('uses review framing for review role', () => {
    const result = formatSkillsForPrompt([makeSkill()], 'review');
    expect(result).toContain('contradicts a prior pattern');
    expect(result).toContain('Prior Successful Fixes');
  });

  it('includes skill details in output', () => {
    const skill = makeSkill({
      createdAt: '2026-03-31T12:00:00.000Z',
      confidence: 85,
      iterations: 2,
    });
    const result = formatSkillsForPrompt([skill], 'fix_generation');
    expect(result).toContain('2026-03-31');
    expect(result).toContain('85% confidence');
    expect(result).toContain('2 iterations');
    expect(result).toContain(skill.errorPattern);
    expect(result).toContain(skill.fix.pattern);
  });

  it('appends flakiness signal when present', () => {
    const flakiness: FlakinessSignal = {
      isFlaky: true,
      fixCount: 4,
      windowDays: 7,
      message: 'Auto-fixed 4 times',
    };
    const result = formatSkillsForPrompt([makeSkill()], 'fix_generation', flakiness);
    expect(result).toContain('FLAKINESS SIGNAL');
    expect(result).toContain('Auto-fixed 4 times');
  });

  it('handles singular iteration correctly', () => {
    const skill = makeSkill({ iterations: 1 });
    const result = formatSkillsForPrompt([skill], 'fix_generation');
    expect(result).toContain('1 iteration)');
    expect(result).not.toContain('1 iterations');
  });

  // ---------------------------------------------------------------------------
  // R3: failureModeTrace rendering per role
  // ---------------------------------------------------------------------------
  const sampleTrace = {
    originalState: 'player.currentTime was 6.02s, pausedTime captured as 0.0s',
    rootMechanism: 'pausedTime captured before player.paused went true',
    newStateAfterFix: 'pausedTime captured only after player.paused === true',
    whyAssertionPassesNow: 'drift is now <= event-loop latency (<50ms), below tolerance',
  };

  it('renders prior causal trace for fix_generation role when trace is present', () => {
    const skill = makeSkill({ failureModeTrace: sampleTrace });
    const result = formatSkillsForPrompt([skill], 'fix_generation');
    expect(result).toContain('Prior causal trace');
    expect(result).toContain('originalState: player.currentTime was 6.02s');
    expect(result).toContain('rootMechanism: pausedTime captured before');
    expect(result).toContain('newStateAfterFix: pausedTime captured only after');
    expect(result).toContain('whyAssertionPassesNow: drift is now');
  });

  it('renders prior causal trace for review role when trace is present', () => {
    const skill = makeSkill({ failureModeTrace: sampleTrace });
    const result = formatSkillsForPrompt([skill], 'review');
    expect(result).toContain('Prior causal trace');
    expect(result).toContain('originalState:');
    expect(result).toContain('whyAssertionPassesNow:');
  });

  it('does NOT render trace for investigation role (anchoring avoidance)', () => {
    const skill = makeSkill({ failureModeTrace: sampleTrace });
    const result = formatSkillsForPrompt([skill], 'investigation');
    expect(result).not.toContain('Prior causal trace');
    expect(result).not.toContain('originalState:');
  });

  it('does NOT render trace when the skill has no failureModeTrace (backward compat)', () => {
    const skill = makeSkill(); // no failureModeTrace
    const result = formatSkillsForPrompt([skill], 'fix_generation');
    expect(result).not.toContain('Prior causal trace');
    expect(result).not.toContain('originalState:');
  });

  it('renders "(empty)" placeholder for missing trace sub-fields', () => {
    const skill = makeSkill({
      failureModeTrace: {
        originalState: 'concrete value',
        rootMechanism: '',
        newStateAfterFix: '',
        whyAssertionPassesNow: '',
      },
    });
    const result = formatSkillsForPrompt([skill], 'fix_generation');
    expect(result).toContain('originalState: concrete value');
    expect(result).toContain('rootMechanism: (empty)');
    expect(result).toContain('newStateAfterFix: (empty)');
    expect(result).toContain('whyAssertionPassesNow: (empty)');
  });

  it('truncates very long trace sub-fields to keep the skill block compact', () => {
    const longField = 'x'.repeat(500);
    const skill = makeSkill({
      failureModeTrace: {
        originalState: longField,
        rootMechanism: longField,
        newStateAfterFix: longField,
        whyAssertionPassesNow: longField,
      },
    });
    const result = formatSkillsForPrompt([skill], 'fix_generation');
    // Each field capped at 200 chars, and sanitizeForPrompt appends "... [truncated]"
    // so no rendered field should be the full 500-char input.
    expect(result).not.toContain('x'.repeat(500));
    expect(result).toContain('x'.repeat(200));
    expect(result).toContain('[truncated]');
  });

  it('fix_generation header mentions the trace as a reasoning template', () => {
    const result = formatSkillsForPrompt([makeSkill()], 'fix_generation');
    expect(result).toContain('causal trace');
    expect(result).toContain('reasoning template');
  });

  it('review header mentions comparing current trace to prior', () => {
    const result = formatSkillsForPrompt([makeSkill()], 'review');
    expect(result).toContain('causal trace');
    expect(result).toContain('markedly weaker');
  });

  it('renders trace for the skill with a trace but omits it for the skill without', () => {
    const withTrace = makeSkill({
      id: 'with-trace',
      failureModeTrace: sampleTrace,
    });
    const withoutTrace = makeSkill({
      id: 'without-trace',
    });
    const result = formatSkillsForPrompt([withTrace, withoutTrace], 'fix_generation');

    // The trace block should appear exactly once (for the first skill).
    const traceOccurrences = result.split('Prior causal trace').length - 1;
    expect(traceOccurrences).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SkillStore persistence (DynamoDB paths)
//
// Both `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` are mocked at
// the module level (see jest.mock calls at the top of this file). The shared
// `mockSend` stands in for the document client's `send()`. Command classes
// capture their input; `constructor.name` matches the class name for assertions.
// ---------------------------------------------------------------------------
function makeStore(): SkillStore {
  return new SkillStore('us-east-1', 'test-table', 'adept-at', 'test');
}

function commandType(call: unknown): string {
  const cmd = (call as unknown[])[0] as { constructor: { name: string } };
  return cmd.constructor.name;
}

function commandInput<T = Record<string, unknown>>(call: unknown): T {
  const cmd = (call as unknown[])[0] as { input: T };
  return cmd.input;
}

beforeEach(() => {
  mockSend.mockReset();
});

describe('SkillStore.load', () => {
  it('queries DynamoDB with the correct partition key and prefix', async () => {
    const store = makeStore();
    mockSend.mockResolvedValueOnce({ Items: [] });

    await store.load();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(commandType(mockSend.mock.calls[0])).toBe('QueryCommand');
    const input = commandInput<{
      TableName: string;
      ExpressionAttributeValues: Record<string, string>;
    }>(mockSend.mock.calls[0]);
    expect(input.TableName).toBe('test-table');
    expect(input.ExpressionAttributeValues[':pk']).toBe('REPO#adept-at/test');
    expect(input.ExpressionAttributeValues[':prefix']).toBe('SKILL#');
  });

  it('paginates via LastEvaluatedKey', async () => {
    const store = makeStore();
    const s1 = { pk: 'x', sk: 'SKILL#1', ...makeSkill({ id: '1' }) };
    const s2 = { pk: 'x', sk: 'SKILL#2', ...makeSkill({ id: '2' }) };
    mockSend
      .mockResolvedValueOnce({ Items: [s1], LastEvaluatedKey: { pk: 'x', sk: 'SKILL#1' } })
      .mockResolvedValueOnce({ Items: [s2] });

    await store.load();

    expect(mockSend).toHaveBeenCalledTimes(2);
    const secondInput = commandInput<{ ExclusiveStartKey?: unknown }>(mockSend.mock.calls[1]);
    expect(secondInput.ExclusiveStartKey).toEqual({ pk: 'x', sk: 'SKILL#1' });
    expect(store.countForSpec('test/specs/skills/lms.video.plays.e2e.ts')).toBe(2);
  });

  it('only queries once (cached on second call)', async () => {
    const store = makeStore();
    mockSend.mockResolvedValue({ Items: [] });

    await store.load();
    await store.load();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('marks loaded=true and loadSucceeded=false on query failure', async () => {
    const store = makeStore();
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { name: 'ResourceNotFoundException' })
    );

    const result = await store.load();

    expect(result).toEqual([]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect((store as any).loaded).toBe(true);
    expect((store as any).loadSucceeded).toBe(false);
    expect((store as any).loadFailureReason).toContain('ResourceNotFoundException');
  });

  it('does not re-query after a failed load (loaded=true short-circuits retry thrash)', async () => {
    const store = makeStore();
    mockSend.mockRejectedValueOnce(new Error('boom'));

    await store.load();
    await store.load();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('strips pk/sk fields from loaded items', async () => {
    const store = makeStore();
    const raw = { pk: 'REPO#a/b', sk: 'SKILL#abc', ...makeSkill({ id: 'abc' }) };
    mockSend.mockResolvedValueOnce({ Items: [raw] });

    await store.load();
    const loaded = (store as any).skills as TriageSkill[];

    expect(loaded).toHaveLength(1);
    expect((loaded[0] as any).pk).toBeUndefined();
    expect((loaded[0] as any).sk).toBeUndefined();
    expect(loaded[0].id).toBe('abc');
  });
});

describe('SkillStore.save', () => {
  it('sends PutCommand and returns true on success', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    mockSend.mockResolvedValueOnce({});

    const skill = makeSkill({ id: 'new-1' });
    const result = await store.save(skill);

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(commandType(mockSend.mock.calls[0])).toBe('PutCommand');
    const input = commandInput<{
      TableName: string;
      Item: Record<string, unknown>;
    }>(mockSend.mock.calls[0]);
    expect(input.TableName).toBe('test-table');
    expect(input.Item.pk).toBe('REPO#adept-at/test');
    expect(input.Item.sk).toBe('SKILL#new-1');
    expect(input.Item.id).toBe('new-1');
  });

  it('returns false and rolls back in-memory on PutCommand failure', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    mockSend.mockRejectedValueOnce(new Error('put failed'));

    const skill = makeSkill({ id: 'failing' });
    const result = await store.save(skill);

    expect(result).toBe(false);
    expect(store.countForSpec(skill.spec)).toBe(0);
  });

  it('skips pruning when loadSucceeded=false even if cap is exceeded', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = false;
    (store as any).skills = Array.from({ length: 120 }, (_, i) =>
      makeSkill({ id: `s-${i}`, spec: `s-${i}.ts` })
    );
    mockSend.mockResolvedValueOnce({});

    const result = await store.save(makeSkill({ id: 'new' }));

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(commandType(mockSend.mock.calls[0])).toBe('PutCommand');
  });

  it('prunes oldest skills when over MAX_SKILLS after a successful load', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    const existing = Array.from({ length: 100 }, (_, i) =>
      makeSkill({
        id: `s-${i}`,
        spec: `s-${i}.ts`,
        createdAt: new Date(2026, 0, i + 1).toISOString(),
      })
    );
    (store as any).skills = existing;

    mockSend.mockResolvedValue({});

    const newSkill = makeSkill({
      id: 'newest',
      createdAt: new Date(2026, 5, 1).toISOString(),
    });
    await store.save(newSkill);

    const commandNames = mockSend.mock.calls.map(commandType);
    expect(commandNames[0]).toBe('PutCommand');
    const deletes = commandNames.filter((n) => n === 'DeleteCommand');
    expect(deletes).toHaveLength(1);

    const deleteInput = commandInput<{ Key: { sk: string } }>(
      mockSend.mock.calls.find((c) => commandType(c) === 'DeleteCommand')!
    );
    expect(deleteInput.Key.sk).toBe('SKILL#s-0');
  });

  it('prunes multiple oldest skills when overflow is greater than 1', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    const existing = Array.from({ length: 102 }, (_, i) =>
      makeSkill({
        id: `s-${i}`,
        spec: `s-${i}.ts`,
        createdAt: new Date(2026, 0, i + 1).toISOString(),
      })
    );
    (store as any).skills = existing;
    mockSend.mockResolvedValue({});

    const newSkill = makeSkill({
      id: 'newest',
      createdAt: new Date(2026, 5, 1).toISOString(),
    });
    await store.save(newSkill);

    const deletedSks = mockSend.mock.calls
      .filter((c) => commandType(c) === 'DeleteCommand')
      .map((c) => commandInput<{ Key: { sk: string } }>(c).Key.sk);
    // With 102 existing + 1 new = 103, we need to delete 3 to reach MAX_SKILLS (100).
    expect(deletedSks).toHaveLength(3);
    expect(deletedSks).toEqual(['SKILL#s-0', 'SKILL#s-1', 'SKILL#s-2']);
  });

  it('continues pruning when an individual DeleteCommand fails', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    const existing = Array.from({ length: 101 }, (_, i) =>
      makeSkill({
        id: `s-${i}`,
        spec: `s-${i}.ts`,
        createdAt: new Date(2026, 0, i + 1).toISOString(),
      })
    );
    (store as any).skills = existing;

    // PutCommand succeeds; first DeleteCommand rejects.
    mockSend
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('conditional check failed'));

    const newSkill = makeSkill({
      id: 'newest',
      createdAt: new Date(2026, 5, 1).toISOString(),
    });
    const result = await store.save(newSkill);

    // save() itself should still return true; prune errors don't roll back.
    expect(result).toBe(true);
  });

  it('never includes the just-saved skill in prune candidates', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    (store as any).skills = Array.from({ length: 100 }, (_, i) =>
      makeSkill({
        id: `old-${i}`,
        spec: `s-${i}.ts`,
        createdAt: new Date(2026, 0, i + 1).toISOString(),
      })
    );
    mockSend.mockResolvedValue({});

    const newest = makeSkill({
      id: 'newest',
      createdAt: new Date(2026, 5, 1).toISOString(),
    });
    await store.save(newest);

    const deletedSks = mockSend.mock.calls
      .filter((c) => commandType(c) === 'DeleteCommand')
      .map((c) => commandInput<{ Key: { sk: string } }>(c).Key.sk);
    expect(deletedSks).not.toContain('SKILL#newest');
  });

  it('protects the just-saved skill even when it is the oldest by createdAt', async () => {
    // Defense-in-depth: exercises the keepSkillId filter in selectSkillsToPrune
    // against a saved skill that pre-dates all cached skills (e.g. replay,
    // clock skew, backfill).
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).loadSucceeded = true;
    (store as any).skills = Array.from({ length: 100 }, (_, i) =>
      makeSkill({
        id: `recent-${i}`,
        spec: `s-${i}.ts`,
        createdAt: new Date(2026, 5, i + 1).toISOString(),
      })
    );
    mockSend.mockResolvedValue({});

    const ancient = makeSkill({
      id: 'ancient',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await store.save(ancient);

    const deletedSks = mockSend.mock.calls
      .filter((c) => commandType(c) === 'DeleteCommand')
      .map((c) => commandInput<{ Key: { sk: string } }>(c).Key.sk);
    expect(deletedSks).toHaveLength(1);
    expect(deletedSks).not.toContain('SKILL#ancient');
  });
});

describe('SkillStore.recordOutcome', () => {
  it('increments successCount via UpdateCommand on success', async () => {
    const store = makeStore();
    const skill = makeSkill({ id: 'rec-1', successCount: 0, failCount: 0 });
    (store as any).loaded = true;
    (store as any).skills = [skill];
    mockSend.mockResolvedValueOnce({
      Attributes: { ...skill, successCount: 1, lastUsedAt: 'now' },
    });

    await store.recordOutcome('rec-1', true);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(commandType(mockSend.mock.calls[0])).toBe('UpdateCommand');
    const input = commandInput<{ UpdateExpression: string }>(mockSend.mock.calls[0]);
    expect(input.UpdateExpression).toContain('ADD successCount');
    expect(skill.successCount).toBe(1);
  });

  it('increments failCount and retires when fail rate exceeds threshold', async () => {
    const store = makeStore();
    const skill = makeSkill({
      id: 'rec-retire',
      successCount: 1,
      failCount: 2,
    });
    (store as any).loaded = true;
    (store as any).skills = [skill];

    mockSend
      .mockResolvedValueOnce({
        Attributes: { ...skill, successCount: 1, failCount: 3, lastUsedAt: 'now' },
      })
      .mockResolvedValueOnce({});

    await store.recordOutcome('rec-retire', false);

    expect(mockSend).toHaveBeenCalledTimes(2);
    const firstUpdate = commandInput<{ UpdateExpression: string }>(mockSend.mock.calls[0]);
    expect(firstUpdate.UpdateExpression).toContain('ADD failCount');
    const secondUpdate = commandInput<{ UpdateExpression: string }>(mockSend.mock.calls[1]);
    expect(secondUpdate.UpdateExpression).toContain('SET retired');
    expect(skill.retired).toBe(true);
  });

  it('skips UpdateCommand when skill is not in the in-memory cache', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).skills = [];

    await store.recordOutcome('missing-id', true);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not retire when failCount is below minimum', async () => {
    const store = makeStore();
    const skill = makeSkill({ id: 'low-fail', successCount: 0, failCount: 1 });
    (store as any).loaded = true;
    (store as any).skills = [skill];
    mockSend.mockResolvedValueOnce({
      Attributes: { ...skill, failCount: 2, lastUsedAt: 'now' },
    });

    await store.recordOutcome('low-fail', false);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(skill.retired).toBe(false);
  });

  it('does not re-retire a skill that is already retired (idempotency guard)', async () => {
    const store = makeStore();
    const skill = makeSkill({
      id: 'already-retired',
      retired: true,
      successCount: 1,
      failCount: 5,
    });
    (store as any).loaded = true;
    (store as any).skills = [skill];
    mockSend.mockResolvedValueOnce({
      Attributes: { ...skill, failCount: 6, lastUsedAt: 'now', retired: true },
    });

    await store.recordOutcome('already-retired', false);

    // Only the counter-increment UpdateCommand — no second retire update.
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('never rejects when the DynamoDB send call throws', async () => {
    const store = makeStore();
    const skill = makeSkill({ id: 'err-1' });
    (store as any).loaded = true;
    (store as any).skills = [skill];
    mockSend.mockRejectedValueOnce(new Error('dynamo unavailable'));

    await expect(store.recordOutcome('err-1', true)).resolves.toBeUndefined();
  });
});

describe('SkillStore.recordClassificationOutcome', () => {
  it('sends UpdateCommand with classificationOutcome and updates in-memory', async () => {
    const store = makeStore();
    const skill = makeSkill({ id: 'cls-1', classificationOutcome: 'unknown' });
    (store as any).loaded = true;
    (store as any).skills = [skill];
    mockSend.mockResolvedValueOnce({});

    await store.recordClassificationOutcome('cls-1', 'correct');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(commandType(mockSend.mock.calls[0])).toBe('UpdateCommand');
    const input = commandInput<{
      UpdateExpression: string;
      ExpressionAttributeValues: Record<string, string>;
    }>(mockSend.mock.calls[0]);
    expect(input.UpdateExpression).toBe('SET classificationOutcome = :co');
    expect(input.ExpressionAttributeValues[':co']).toBe('correct');
    expect(skill.classificationOutcome).toBe('correct');
  });

  it('skips UpdateCommand when skill is not in the in-memory cache', async () => {
    const store = makeStore();
    (store as any).loaded = true;
    (store as any).skills = [];

    await store.recordClassificationOutcome('missing', 'correct');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('never rejects when the DynamoDB send call throws', async () => {
    const store = makeStore();
    const skill = makeSkill({ id: 'cls-err-1' });
    (store as any).loaded = true;
    (store as any).skills = [skill];
    mockSend.mockRejectedValueOnce(new Error('dynamo unavailable'));

    await expect(
      store.recordClassificationOutcome('cls-err-1', 'correct')
    ).resolves.toBeUndefined();
  });
});
