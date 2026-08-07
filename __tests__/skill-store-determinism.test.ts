/**
 * Determinism guarantees for skill-store retrieval and rendering.
 *
 * Pins behavior that the docstrings promise but no existing test asserts:
 *   1. compareSkillRecency tie-breaker ordering (lastUsedAt → createdAt →
 *      id.localeCompare) as observed through the PUBLIC retrieval methods
 *      findRelevant / findForClassifier. Skills here have EQUAL relevance
 *      scores and differ only at one tie level at a time, so these tests
 *      fail under any ordering other than the documented one.
 *   2. findNonFixableMatch gating: exact-spec match AND Jaccard
 *      error-similarity >= 0.3, best-score selection.
 *   3. findRecentFailedFingerprints filters (non-seed, non-retired,
 *      validatedLocally === false, fingerprint present, spec match, window).
 *   4. Trace-suppression gate in formatSkillsForPrompt:
 *      runtimeContradicts = (failCount + successCount >= 3 && successCount === 0).
 */
import {
  SkillStore,
  TriageSkill,
  formatSkillsForPrompt,
} from '../src/services/skill-store';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

// Mock the AWS SDK modules so the module under test never touches the
// network. Read-only query methods operate on the injected in-memory
// cache, so no send() behavior is needed here.
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

const HOUR = 3_600_000;
const DAY = 86_400_000;

function makeSkill(overrides: Partial<TriageSkill> = {}): TriageSkill {
  const created = new Date(Date.now() - 30 * DAY).toISOString();
  return {
    id: 'skill-1',
    createdAt: created,
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
    prUrl: '',
    validatedLocally: true,
    priorSkillCount: 0,
    successCount: 0,
    failCount: 0,
    lastUsedAt: created,
    retired: false,
    ...overrides,
  };
}

function storeWith(skills: TriageSkill[]): SkillStore {
  const store = new SkillStore('us-east-1', 'test-table', 'adept-at', 'test');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).skills = skills;
  return store;
}

// ---------------------------------------------------------------------------
// 1. Deterministic tie-breaker ordering via the public retrieval methods.
//
// All skills in each test share the SAME spec (and no error query), so every
// candidate gets an identical relevance score and the returned order is
// decided purely by compareSkillRecency. Inputs are injected in scrambled
// order so an insertion-order (stable-sort identity) result also fails.
// ---------------------------------------------------------------------------
describe('deterministic tie-breaker ordering (compareSkillRecency)', () => {
  const SPEC = 'test/specs/tie-break.e2e.ts';
  const now = Date.now();

  describe('via findRelevant', () => {
    it('tie level (a): equal scores, different lastUsedAt → most recently used first', () => {
      const createdAt = new Date(now - 20 * DAY).toISOString();
      const oldest = makeSkill({
        id: 'used-oldest',
        spec: SPEC,
        createdAt,
        lastUsedAt: new Date(now - 3 * DAY).toISOString(),
      });
      const middle = makeSkill({
        id: 'used-middle',
        spec: SPEC,
        createdAt,
        lastUsedAt: new Date(now - 2 * DAY).toISOString(),
      });
      const newest = makeSkill({
        id: 'used-newest',
        spec: SPEC,
        createdAt,
        lastUsedAt: new Date(now - 1 * DAY).toISOString(),
      });

      // Scrambled insertion order: middle, newest, oldest.
      const store = storeWith([middle, newest, oldest]);
      const result = store.findRelevant({ framework: 'webdriverio', spec: SPEC });

      expect(result.map((s) => s.id)).toEqual([
        'used-newest',
        'used-middle',
        'used-oldest',
      ]);
    });

    it('tie level (b): same lastUsedAt, different createdAt → most recently created first', () => {
      const lastUsedAt = new Date(now - 1 * DAY).toISOString();
      const oldest = makeSkill({
        id: 'created-oldest',
        spec: SPEC,
        createdAt: new Date(now - 30 * DAY).toISOString(),
        lastUsedAt,
      });
      const middle = makeSkill({
        id: 'created-middle',
        spec: SPEC,
        createdAt: new Date(now - 20 * DAY).toISOString(),
        lastUsedAt,
      });
      const newest = makeSkill({
        id: 'created-newest',
        spec: SPEC,
        createdAt: new Date(now - 10 * DAY).toISOString(),
        lastUsedAt,
      });

      const store = storeWith([oldest, newest, middle]);
      const result = store.findRelevant({ framework: 'webdriverio', spec: SPEC });

      expect(result.map((s) => s.id)).toEqual([
        'created-newest',
        'created-middle',
        'created-oldest',
      ]);
    });

    it('tie level (c): same lastUsedAt AND createdAt → ascending id.localeCompare', () => {
      const createdAt = new Date(now - 20 * DAY).toISOString();
      const lastUsedAt = new Date(now - 1 * DAY).toISOString();
      const mk = (id: string): TriageSkill =>
        makeSkill({ id, spec: SPEC, createdAt, lastUsedAt });

      // Scrambled insertion order relative to the expected output.
      const store = storeWith([mk('id-charlie'), mk('id-alpha'), mk('id-bravo')]);
      const result = store.findRelevant({ framework: 'webdriverio', spec: SPEC });

      expect(result.map((s) => s.id)).toEqual([
        'id-alpha',
        'id-bravo',
        'id-charlie',
      ]);
    });
  });

  describe('via findForClassifier', () => {
    // findForClassifier adds a +3 recency bonus for lastUsedAt within
    // 7 days. All lastUsedAt values below sit inside that window so the
    // bonus applies uniformly and scores stay EQUAL — the order is then
    // decided only by the tie-breaker chain.
    it('tie level (a): equal scores, different lastUsedAt → most recently used first', () => {
      const createdAt = new Date(now - 20 * DAY).toISOString();
      const oldest = makeSkill({
        id: 'cls-used-oldest',
        spec: SPEC,
        createdAt,
        lastUsedAt: new Date(now - 3 * HOUR).toISOString(),
      });
      const middle = makeSkill({
        id: 'cls-used-middle',
        spec: SPEC,
        createdAt,
        lastUsedAt: new Date(now - 2 * HOUR).toISOString(),
      });
      const newest = makeSkill({
        id: 'cls-used-newest',
        spec: SPEC,
        createdAt,
        lastUsedAt: new Date(now - 1 * HOUR).toISOString(),
      });

      const store = storeWith([oldest, newest, middle]);
      const result = store.findForClassifier({ framework: 'webdriverio', spec: SPEC });

      expect(result.map((s) => s.id)).toEqual([
        'cls-used-newest',
        'cls-used-middle',
        'cls-used-oldest',
      ]);
    });

    it('tie level (b): same lastUsedAt, different createdAt → most recently created first', () => {
      const lastUsedAt = new Date(now - 1 * HOUR).toISOString();
      const oldest = makeSkill({
        id: 'cls-created-oldest',
        spec: SPEC,
        createdAt: new Date(now - 30 * DAY).toISOString(),
        lastUsedAt,
      });
      const middle = makeSkill({
        id: 'cls-created-middle',
        spec: SPEC,
        createdAt: new Date(now - 20 * DAY).toISOString(),
        lastUsedAt,
      });
      const newest = makeSkill({
        id: 'cls-created-newest',
        spec: SPEC,
        createdAt: new Date(now - 10 * DAY).toISOString(),
        lastUsedAt,
      });

      const store = storeWith([middle, oldest, newest]);
      const result = store.findForClassifier({ framework: 'webdriverio', spec: SPEC });

      expect(result.map((s) => s.id)).toEqual([
        'cls-created-newest',
        'cls-created-middle',
        'cls-created-oldest',
      ]);
    });

    it('tie level (c): same lastUsedAt AND createdAt → ascending id.localeCompare', () => {
      const createdAt = new Date(now - 20 * DAY).toISOString();
      const lastUsedAt = new Date(now - 1 * HOUR).toISOString();
      const mk = (id: string): TriageSkill =>
        makeSkill({ id, spec: SPEC, createdAt, lastUsedAt });

      const store = storeWith([mk('cls-id-c'), mk('cls-id-b'), mk('cls-id-a')]);
      const result = store.findForClassifier({ framework: 'webdriverio', spec: SPEC });

      expect(result.map((s) => s.id)).toEqual([
        'cls-id-a',
        'cls-id-b',
        'cls-id-c',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. findNonFixableMatch — exact-spec + Jaccard >= 0.3, best-score selection.
// ---------------------------------------------------------------------------
describe('SkillStore.findNonFixableMatch', () => {
  const SPEC = 'test/specs/non-fixable.e2e.ts';

  const makeNonFixable = (overrides: Partial<TriageSkill> = {}): TriageSkill =>
    makeSkill({
      id: 'nf-1',
      spec: SPEC,
      nonFixable: true,
      errorPattern: 'access code pool exhausted contact admin',
      ...overrides,
    });

  it('returns the skill on identical error text (similarity 1.0)', () => {
    const skill = makeNonFixable();
    const store = storeWith([skill]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage: 'access code pool exhausted contact admin',
    });

    expect(result).toBe(skill);
  });

  it('returns the skill at EXACTLY the 0.3 Jaccard threshold (>= is inclusive)', () => {
    // skill tokens: {alpha, beta, gamma, delta, epsilon, zeta} (6)
    // query tokens: {alpha, beta, gamma, eta, theta, iota, kappa} (7)
    // intersection = 3, union = 10 → Jaccard = 0.3 exactly.
    const skill = makeNonFixable({
      errorPattern: 'alpha beta gamma delta epsilon zeta',
    });
    const store = storeWith([skill]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage: 'alpha beta gamma eta theta iota kappa',
    });

    expect(result).toBe(skill);
  });

  it('returns undefined below the 0.3 similarity threshold', () => {
    // intersection = 1 (alpha), union = 11 → Jaccard ≈ 0.09.
    const skill = makeNonFixable({
      errorPattern: 'alpha one two three four five',
    });
    const store = storeWith([skill]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage: 'alpha six seven eight nine ten',
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for a different spec even with identical error text', () => {
    const skill = makeNonFixable();
    const store = storeWith([skill]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: 'test/specs/some-other.e2e.ts',
      errorMessage: 'access code pool exhausted contact admin',
    });

    expect(result).toBeUndefined();
  });

  it('does NOT let an unrelated failure on the same spec inherit non-fixable treatment', () => {
    // Documented invariant: spec matches exactly, but the error is a
    // dissimilar (real) failure — it must keep its chance at auto-fix.
    const skill = makeNonFixable();
    const store = storeWith([skill]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage:
        'expected selector button.submit to be visible but it was not found in the DOM',
    });

    expect(result).toBeUndefined();
  });

  it('excludes retired skills even on a perfect match', () => {
    const skill = makeNonFixable({ retired: true });
    const store = storeWith([skill]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage: 'access code pool exhausted contact admin',
    });

    expect(result).toBeUndefined();
  });

  it('selects the best Jaccard score when multiple non-fixable skills match', () => {
    const partial = makeNonFixable({
      id: 'nf-partial',
      // vs query: intersection 4 {access, code, pool, exhausted},
      // union 9 → ≈ 0.44 (above threshold, but not the best).
      errorPattern: 'access code pool exhausted retry later maybe',
    });
    const exact = makeNonFixable({
      id: 'nf-exact',
      errorPattern: 'access code pool exhausted contact admin',
    });

    // Weaker match injected FIRST so a first-match-wins implementation fails.
    const store = storeWith([partial, exact]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage: 'access code pool exhausted contact admin',
    });

    expect(result?.id).toBe('nf-exact');
  });

  it('never returns skills without nonFixable: true, even on a perfect match', () => {
    const notFlagged = makeSkill({
      id: 'plain-skill',
      spec: SPEC,
      errorPattern: 'access code pool exhausted contact admin',
      // nonFixable deliberately absent (undefined treated as false).
    });
    const explicitlyFalse = makeSkill({
      id: 'false-skill',
      spec: SPEC,
      nonFixable: false,
      errorPattern: 'access code pool exhausted contact admin',
    });
    const store = storeWith([notFlagged, explicitlyFalse]);

    const result = store.findNonFixableMatch({
      framework: 'webdriverio',
      spec: SPEC,
      errorMessage: 'access code pool exhausted contact admin',
    });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. findRecentFailedFingerprints — filters verified against the source:
//    !isSeed && !retired && validatedLocally === false && !!fixFingerprint
//    && normalizeSpec(spec) match && createdAt within window.
// ---------------------------------------------------------------------------
describe('SkillStore.findRecentFailedFingerprints', () => {
  const SPEC = 'test/specs/fingerprint.e2e.ts';
  const WINDOW_MS = 6 * HOUR;

  const makeFailedFix = (overrides: Partial<TriageSkill> = {}): TriageSkill =>
    makeSkill({
      spec: SPEC,
      validatedLocally: false,
      fixFingerprint: 'fp-default',
      createdAt: new Date(Date.now() - 1 * HOUR).toISOString(),
      ...overrides,
    });

  it('returns fingerprints of recent failed fixes within the window', () => {
    const store = storeWith([
      makeFailedFix({ id: 'ff-1', fixFingerprint: 'fp-aaa' }),
      makeFailedFix({ id: 'ff-2', fixFingerprint: 'fp-bbb' }),
    ]);

    const result = store.findRecentFailedFingerprints(SPEC, WINDOW_MS);

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(['fp-aaa', 'fp-bbb']));
  });

  it('excludes failed fixes created outside the window', () => {
    const store = storeWith([
      makeFailedFix({
        id: 'ff-old',
        fixFingerprint: 'fp-old',
        createdAt: new Date(Date.now() - 2 * WINDOW_MS).toISOString(),
      }),
      makeFailedFix({ id: 'ff-recent', fixFingerprint: 'fp-recent' }),
    ]);

    const result = store.findRecentFailedFingerprints(SPEC, WINDOW_MS);

    expect(result).toEqual(['fp-recent']);
  });

  it('excludes seed skills', () => {
    const store = storeWith([
      makeFailedFix({ id: 'ff-seed', fixFingerprint: 'fp-seed', isSeed: true }),
    ]);

    expect(store.findRecentFailedFingerprints(SPEC, WINDOW_MS)).toEqual([]);
  });

  it('excludes retired skills', () => {
    const store = storeWith([
      makeFailedFix({ id: 'ff-retired', fixFingerprint: 'fp-retired', retired: true }),
    ]);

    expect(store.findRecentFailedFingerprints(SPEC, WINDOW_MS)).toEqual([]);
  });

  it('excludes validated skills (validatedLocally must be exactly false)', () => {
    const store = storeWith([
      makeFailedFix({ id: 'ff-validated', fixFingerprint: 'fp-validated', validatedLocally: true }),
    ]);

    expect(store.findRecentFailedFingerprints(SPEC, WINDOW_MS)).toEqual([]);
  });

  it('silently drops legacy skills without a fixFingerprint field', () => {
    const legacy = makeFailedFix({ id: 'ff-legacy' });
    delete legacy.fixFingerprint;

    const store = storeWith([
      legacy,
      makeFailedFix({ id: 'ff-modern', fixFingerprint: 'fp-modern' }),
    ]);

    const result = store.findRecentFailedFingerprints(SPEC, WINDOW_MS);

    expect(result).toEqual(['fp-modern']);
  });

  it('excludes failed fixes for other specs', () => {
    const store = storeWith([
      makeFailedFix({
        id: 'ff-other-spec',
        fixFingerprint: 'fp-other',
        spec: 'test/specs/unrelated.e2e.ts',
      }),
    ]);

    expect(store.findRecentFailedFingerprints(SPEC, WINDOW_MS)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Trace-suppression gate in formatSkillsForPrompt.
//    runtimeContradicts = (failCount + successCount >= 3 && successCount === 0)
//    hides the causal trace block even for validatedLocally skills.
// ---------------------------------------------------------------------------
describe('formatSkillsForPrompt trace-suppression gate', () => {
  const TRACE_MARKER =
    '- Prior causal trace (from a validated fix — use as reasoning template):';

  const makeTracedSkill = (overrides: Partial<TriageSkill> = {}): TriageSkill =>
    makeSkill({
      id: 'traced-1',
      validatedLocally: true,
      failureModeTrace: {
        originalState: 'currentTime drifted 6.02s past pausedTime 0s',
        rootMechanism: 'pausedTime captured before the player actually paused',
        newStateAfterFix: 'pausedTime captured after pause event resolves',
        whyAssertionPassesNow: 'drift stays under the 0.25s tolerance',
      },
      ...overrides,
    });

  it('suppresses the trace when failCount=3, successCount=0 (runtime contradicts validation)', () => {
    const prompt = formatSkillsForPrompt(
      [makeTracedSkill({ failCount: 3, successCount: 0 })],
      'fix_generation'
    );

    expect(prompt).not.toContain(TRACE_MARKER);
    // The role header legitimately mentions "rootMechanism", so assert
    // absence of the rendered trace CONTENT, not the word itself.
    expect(prompt).not.toContain(
      'pausedTime captured before the player actually paused'
    );
    // The rest of the skill entry still renders — only the trace is silenced.
    expect(prompt).toContain('Track record: 0/3 successful');
  });

  it('renders the trace when failCount=2, successCount=0 (total below the 3-attempt threshold)', () => {
    const prompt = formatSkillsForPrompt(
      [makeTracedSkill({ failCount: 2, successCount: 0 })],
      'fix_generation'
    );

    expect(prompt).toContain(TRACE_MARKER);
    expect(prompt).toContain(
      'rootMechanism: pausedTime captured before the player actually paused'
    );
    expect(prompt).toContain('Track record: 0/2 successful');
  });

  it('renders the trace when failCount=3, successCount=1 (any recorded success defuses the gate)', () => {
    const prompt = formatSkillsForPrompt(
      [makeTracedSkill({ failCount: 3, successCount: 1 })],
      'fix_generation'
    );

    expect(prompt).toContain(TRACE_MARKER);
    expect(prompt).toContain('Track record: 1/4 successful');
  });
});
