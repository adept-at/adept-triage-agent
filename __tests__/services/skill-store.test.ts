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

function makeMockOctokit(skills: TriageSkill[] = []) {
  const encoded = Buffer.from(JSON.stringify(skills)).toString('base64');
  return {
    repos: {
      getContent: jest.fn().mockResolvedValue({
        data: { content: encoded, sha: 'abc123' },
      }),
      createOrUpdateFileContents: jest.fn().mockResolvedValue({
        data: { content: { sha: 'def456' } },
      }),
      getBranch: jest.fn().mockResolvedValue({ data: {} }),
      get: jest.fn().mockResolvedValue({
        data: { default_branch: 'main' },
      }),
    },
    git: {
      getRef: jest.fn().mockResolvedValue({
        data: { object: { sha: 'aaa' } },
      }),
      createRef: jest.fn().mockResolvedValue({}),
    },
  } as any;
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
// SkillStore.load
// ---------------------------------------------------------------------------
describe('SkillStore.load', () => {
  it('loads skills from GitHub Contents API', async () => {
    const existing = [makeSkill()];
    const octokit = makeMockOctokit(existing);
    const store = new SkillStore(octokit, 'adept-at', 'lib-wdio-8-e2e-ts');

    const result = await store.load();

    expect(result).toHaveLength(1);
    expect(result[0].spec).toBe('test/specs/skills/lms.video.plays.e2e.ts');
    expect(octokit.repos.getContent).toHaveBeenCalledWith({
      owner: 'adept-at',
      repo: 'lib-wdio-8-e2e-ts',
      path: 'skills.json',
      ref: 'triage-data',
    });
  });

  it('returns empty array on 404 (fresh repo)', async () => {
    const octokit = makeMockOctokit();
    octokit.repos.getContent.mockRejectedValue({ status: 404 });
    const store = new SkillStore(octokit, 'adept-at', 'new-repo');

    const result = await store.load();

    expect(result).toEqual([]);
  });

  it('only fetches once (cached on second call)', async () => {
    const octokit = makeMockOctokit([makeSkill()]);
    const store = new SkillStore(octokit, 'adept-at', 'test');

    await store.load();
    await store.load();

    expect(octokit.repos.getContent).toHaveBeenCalledTimes(1);
  });

  it('does NOT set loaded on transient error (allows retry)', async () => {
    const octokit = makeMockOctokit();
    octokit.repos.getContent.mockRejectedValue({ status: 500 });
    const store = new SkillStore(octokit, 'adept-at', 'test');

    await store.load();
    expect(store.findRelevant({ framework: 'webdriverio' })).toEqual([]);

    octokit.repos.getContent.mockResolvedValue({
      data: { content: Buffer.from(JSON.stringify([makeSkill()])).toString('base64'), sha: 'x' },
    });
    await store.load();

    expect(octokit.repos.getContent).toHaveBeenCalledTimes(2);
    expect(store.findRelevant({ framework: 'webdriverio', spec: 'test/specs/skills/lms.video.plays.e2e.ts' })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SkillStore.save
// ---------------------------------------------------------------------------
describe('SkillStore.save', () => {
  it('writes skill to GitHub and updates fileSha', async () => {
    const octokit = makeMockOctokit([]);
    octokit.repos.getContent.mockRejectedValue({ status: 404 });
    const store = new SkillStore(octokit, 'adept-at', 'test');
    await store.load();

    const skill = makeSkill();
    await store.save(skill);

    expect(octokit.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
    expect(store.countForSpec(skill.spec)).toBe(1);
  });

  it('rolls back in-memory on non-409 write failure', async () => {
    const octokit = makeMockOctokit([]);
    octokit.repos.getContent.mockRejectedValue({ status: 404 });
    octokit.repos.createOrUpdateFileContents.mockRejectedValue({ status: 500 });
    const store = new SkillStore(octokit, 'adept-at', 'test');
    await store.load();

    await store.save(makeSkill());

    expect(store.countForSpec('test/specs/skills/lms.video.plays.e2e.ts')).toBe(0);
  });

  it('retries on 409 conflict with fresh data', async () => {
    const existingSkill = makeSkill({ id: 'existing-1' });
    const octokit = makeMockOctokit();
    octokit.repos.getContent
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify([existingSkill])).toString('base64'),
          sha: 'fresh-sha',
        },
      });

    octokit.repos.createOrUpdateFileContents
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ data: { content: { sha: 'new-sha' } } });

    const store = new SkillStore(octokit, 'adept-at', 'test');
    await store.load();

    const newSkill = makeSkill({ id: 'new-1' });
    await store.save(newSkill);

    expect(octokit.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
    expect(store.countForSpec(newSkill.spec)).toBe(2);
  });

  it('enforces max 100 skills cap', async () => {
    const octokit = makeMockOctokit([]);
    octokit.repos.getContent.mockRejectedValue({ status: 404 });
    const store = new SkillStore(octokit, 'adept-at', 'test');
    await store.load();

    for (let i = 0; i < 105; i++) {
      await store.save(makeSkill({ id: `skill-${i}`, spec: `spec-${i}.ts` }));
    }

    const written = JSON.parse(
      Buffer.from(
        octokit.repos.createOrUpdateFileContents.mock.calls.at(-1)[0].content,
        'base64'
      ).toString('utf-8')
    );
    expect(written.length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// SkillStore.findRelevant
// ---------------------------------------------------------------------------
describe('SkillStore.findRelevant', () => {
  function storeWith(skills: TriageSkill[]): SkillStore {
    const octokit = makeMockOctokit(skills);
    const store = new SkillStore(octokit, 'adept-at', 'test');
    // Force-load synchronously by setting internal state
    (store as any).skills = skills;
    (store as any).loaded = true;
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
    const octokit = makeMockOctokit(skills);
    const store = new SkillStore(octokit, 'adept-at', 'test');
    (store as any).skills = skills;
    (store as any).loaded = true;
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
    expect(result).toContain('CONSIDER these proven approaches');
    expect(result).toContain('Proven Fix Patterns');
  });

  it('uses review framing for review role', () => {
    const result = formatSkillsForPrompt([makeSkill()], 'review');
    expect(result).toContain('contradicts a proven approach');
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
});
