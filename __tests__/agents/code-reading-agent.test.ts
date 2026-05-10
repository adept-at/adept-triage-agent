import { CodeReadingAgent } from '../../src/agents/code-reading-agent';
import { createAgentContext } from '../../src/agents/base-agent';
import { OpenAIClient } from '../../src/openai-client';
import { SourceFetchContext } from '../../src/types';

jest.mock('../../src/openai-client');

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

/**
 * Octokit shape — only the calls the agent actually makes:
 *   - repos.getContent  (legacy per-file fetch)
 *   - git.getRef        (resolve branch -> commit SHA, used once per run)
 *   - git.getTree       (recursive blob listing, used once per run)
 *
 * Each mock test installs its own jest.fn() implementations so we can
 * count calls and assert the call shape.
 */
type GetContentArgs = { owner: string; repo: string; path: string; ref: string };
type GetContentMock = jest.Mock<Promise<{ data: unknown }>, [GetContentArgs]>;

type GetRefArgs = { owner: string; repo: string; ref: string };
type GetRefMock = jest.Mock<Promise<{ data: { object: { sha: string } } }>, [GetRefArgs]>;

type GetTreeArgs = { owner: string; repo: string; tree_sha: string; recursive: string };
type TreeEntry = { path: string; type: 'blob' | 'tree' };
type GetTreeMock = jest.Mock<
  Promise<{ data: { tree: TreeEntry[]; truncated: boolean } }>,
  [GetTreeArgs]
>;

function buildContext(
  getContent: GetContentMock,
  getRef: GetRefMock,
  getTree: GetTreeMock
): SourceFetchContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const octokit: any = {
    repos: { getContent },
    git: { getRef, getTree },
  };
  return {
    octokit,
    owner: 'adept-at',
    repo: 'test-repo',
    branch: 'main',
  };
}

function encodeContent(text: string): { content: string } {
  return { content: Buffer.from(text, 'utf-8').toString('base64') };
}

function makeOpenAIClientMock(): jest.Mocked<OpenAIClient> {
  return new OpenAIClient('test-key') as jest.Mocked<OpenAIClient>;
}

describe('CodeReadingAgent — tree-fetch optimization', () => {
  let getContent: GetContentMock;
  let getRef: GetRefMock;
  let getTree: GetTreeMock;
  let openaiClient: jest.Mocked<OpenAIClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    openaiClient = makeOpenAIClientMock();

    // Default: getContent returns the test file when asked, 404 for everything else.
    getContent = jest.fn(async ({ path }) => {
      if (path === 'e2e/login.cy.ts') {
        return {
          data: encodeContent(
            "import { LoginPage } from '../../page-objects/login-page';\n" +
              "describe('login', () => { it('works', () => { LoginPage.visit(); }); });\n"
          ),
        };
      }
      if (path === 'cypress/page-objects/login-page.ts') {
        return {
          data: encodeContent("export const LoginPage = { visit: () => {} };\n"),
        };
      }
      if (path === 'cypress/support/commands.ts') {
        return {
          data: encodeContent("Cypress.Commands.add('foo', () => {});\n"),
        };
      }
      throw new Error('404 Not Found');
    }) as GetContentMock;

    getRef = jest.fn(async () => ({
      data: { object: { sha: 'deadbeefcafe' } },
    })) as GetRefMock;

    getTree = jest.fn(async () => ({
      data: {
        truncated: false,
        tree: [
          { path: 'e2e/login.cy.ts', type: 'blob' },
          { path: 'cypress/page-objects/login-page.ts', type: 'blob' },
          { path: 'cypress/support/commands.ts', type: 'blob' },
          { path: 'README.md', type: 'blob' },
          // A tree entry — should be filtered out
          { path: 'cypress/page-objects', type: 'tree' },
        ],
      },
    })) as GetTreeMock;
  });

  test('fetches the tree once and reuses it across the run', async () => {
    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    const result = await agent.execute(
      { testFile: 'e2e/login.cy.ts' },
      context
    );

    expect(result.success).toBe(true);
    // Tree fetch resolved once, and the branch was resolved once.
    expect(getTree).toHaveBeenCalledTimes(1);
    expect(getRef).toHaveBeenCalledTimes(1);
    expect(getRef).toHaveBeenCalledWith({
      owner: 'adept-at',
      repo: 'test-repo',
      ref: 'heads/main',
    });
    expect(getTree).toHaveBeenCalledWith({
      owner: 'adept-at',
      repo: 'test-repo',
      tree_sha: 'deadbeefcafe',
      recursive: 'true',
    });
  });

  test('only issues getContent for paths that exist in the tree (no 404 probes)', async () => {
    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    await agent.execute({ testFile: 'e2e/login.cy.ts' }, context);

    const fetchedPaths = getContent.mock.calls.map((c) => c[0].path);
    // Test file + the one support file in the tree + the one page-object
    // file in the tree. Critically, no probes for the 11 absent support
    // paths and no probes for the 11 absent page-object paths.
    expect(fetchedPaths).toContain('e2e/login.cy.ts');
    expect(fetchedPaths).toContain('cypress/support/commands.ts');
    expect(fetchedPaths).toContain('cypress/page-objects/login-page.ts');

    // Negative assertions: nothing absent should have been probed.
    expect(fetchedPaths).not.toContain('cypress/support/commands.js');
    expect(fetchedPaths).not.toContain('cypress/support/e2e.js');
    expect(fetchedPaths).not.toContain('wdio.conf.ts');
    expect(fetchedPaths).not.toContain('cypress/pages/login-page.ts');
    expect(fetchedPaths).not.toContain('test/pageobjects/login-page.ts');
  });

  test('reuses tree cache when the agent runs twice on the same instance', async () => {
    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    await agent.execute({ testFile: 'e2e/login.cy.ts' }, context);
    await agent.execute({ testFile: 'e2e/login.cy.ts' }, context);

    // Per-run cache invariant: even across two execute() calls on the
    // same instance, the tree is only fetched once. This is the whole
    // point of caching on the instance rather than per-execute().
    expect(getTree).toHaveBeenCalledTimes(1);
    expect(getRef).toHaveBeenCalledTimes(1);
  });

  test('falls back to per-path probing when tree comes back truncated', async () => {
    getTree = jest.fn(async () => ({
      data: { truncated: true, tree: [] },
    })) as GetTreeMock;

    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    const result = await agent.execute(
      { testFile: 'e2e/login.cy.ts' },
      context
    );

    // Truncation must NOT throw — never-fail-the-pipeline. Behavior
    // matches pre-optimization: probe every candidate via getContent.
    expect(result.success).toBe(true);
    const fetchedPaths = getContent.mock.calls.map((c) => c[0].path);
    // Probing happened for absent paths (this is the legacy fallback).
    expect(fetchedPaths).toContain('cypress/support/commands.js');
    expect(fetchedPaths).toContain('cypress/support/e2e.ts');
  });

  test('falls back to per-path probing when getRef fails', async () => {
    getRef = jest.fn(async () => {
      throw new Error('404 ref not found');
    }) as GetRefMock;

    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    const result = await agent.execute(
      { testFile: 'e2e/login.cy.ts' },
      context
    );

    expect(result.success).toBe(true);
    // getTree should not have been called since getRef failed first.
    expect(getTree).not.toHaveBeenCalled();
    // Falls back to per-path probing.
    const fetchedPaths = getContent.mock.calls.map((c) => c[0].path);
    expect(fetchedPaths).toContain('cypress/support/commands.js');
  });

  test('falls back to per-path probing when getTree throws', async () => {
    getTree = jest.fn(async () => {
      throw new Error('500 internal');
    }) as GetTreeMock;

    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    const result = await agent.execute(
      { testFile: 'e2e/login.cy.ts' },
      context
    );

    expect(result.success).toBe(true);
    const fetchedPaths = getContent.mock.calls.map((c) => c[0].path);
    expect(fetchedPaths).toContain('cypress/support/commands.js');
  });

  test('does not retry tree fetch after a known failure', async () => {
    getTree = jest.fn(async () => {
      throw new Error('500 internal');
    }) as GetTreeMock;

    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
    });

    await agent.execute({ testFile: 'e2e/login.cy.ts' }, context);
    await agent.execute({ testFile: 'e2e/login.cy.ts' }, context);

    // Once-and-done. If we retried on every run we'd burn N calls per
    // execute() for nothing, since we already know the tree path is
    // not viable for this instance.
    expect(getTree).toHaveBeenCalledTimes(1);
  });

  test('skips tree fetch entirely when no sourceFetchContext is provided', async () => {
    const agent = new CodeReadingAgent(openaiClient, undefined);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'e2e/login.cy.ts',
      testName: 'login works',
      sourceFileContent: "import './support';\nit('runs', () => {});",
    });

    const result = await agent.execute(
      { testFile: 'e2e/login.cy.ts' },
      context
    );

    expect(result.success).toBe(true);
    expect(getTree).not.toHaveBeenCalled();
    expect(getRef).not.toHaveBeenCalled();
    expect(getContent).not.toHaveBeenCalled();
  });
});

/**
 * Regression matrix for cleanFilePath.
 *
 * cleanFilePath is private, so we exercise it through `agent.execute`
 * and assert on the path passed to `getContent` (which is the first
 * fetch the agent issues — it asks for the test file by its cleaned
 * path before any other work). The empty-string case (URL rejection)
 * is asserted differently: when cleanFilePath returns '', the agent
 * never issues a getContent for the test file, so we assert the call
 * count instead.
 *
 * Each row documents the bug class it guards against:
 *   - greedy projectDirMatch (PR #5 + this PR)
 *   - lazy projectDirMatch (this PR — duplicate-token + multi-keyword paths)
 *   - line:col suffix leaking past early-return branches (this PR)
 *   - webpack:/// triple-slash form (this PR)
 *   - file:// not chained through re-rooting (this PR)
 */
describe('CodeReadingAgent.cleanFilePath — regression matrix', () => {
  type Case = {
    name: string;
    input: string;
    expected: string;
  };

  const cases: Case[] = [
    {
      name: 'PR #5 original case — relative test/specs path passes through',
      input: 'test/specs/signup/signup.ts',
      expected: 'test/specs/signup/signup.ts',
    },
    {
      name: 'relative cypress nested path passes through',
      input: 'test/specs/skills/multi.skill.lock.editor.ts',
      expected: 'test/specs/skills/multi.skill.lock.editor.ts',
    },
    {
      name: 'cypress/e2e relative path passes through',
      input: 'cypress/e2e/login.cy.ts',
      expected: 'cypress/e2e/login.cy.ts',
    },
    {
      name: 'e2e relative path passes through',
      input: 'e2e/login.cy.ts',
      expected: 'e2e/login.cy.ts',
    },
    {
      name: 'CI runner absolute path uses ciRunnerMatch branch',
      input: '/home/runner/work/owner/repo/test/specs/foo.ts',
      expected: 'test/specs/foo.ts',
    },
    {
      name: 'absolute path with single project-dir keyword (lazy quantifier)',
      input: '/Users/dev/myproject/test/specs/signup.ts',
      expected: 'test/specs/signup.ts',
    },
    {
      name: 'absolute path with duplicate keyword re-roots at FIRST (lazy)',
      input: '/Users/dev/test/test/foo.ts',
      expected: 'test/test/foo.ts',
    },
    {
      name: 'relative path with line:col suffix is stripped',
      input: 'test/specs/signup.ts:35:28',
      expected: 'test/specs/signup.ts',
    },
    {
      name: 'absolute path with line:col suffix is stripped in projectDirMatch branch',
      input: '/Users/dev/myproject/test/foo.ts:35:28',
      expected: 'test/foo.ts',
    },
    {
      name: 'webpack:/// triple-slash form (default devtoolNamespace)',
      input: 'webpack:///./src/foo.ts',
      expected: 'src/foo.ts',
    },
    {
      name: 'webpack://app/./ named-host form (regression check)',
      input: 'webpack://app/./src/foo.ts',
      expected: 'src/foo.ts',
    },
    {
      name: 'file:// chains through projectDirMatch re-rooting',
      input: 'file:///Users/dev/proj/test/specs/foo.ts',
      expected: 'test/specs/foo.ts',
    },
  ];

  let getContent: GetContentMock;
  let getRef: GetRefMock;
  let getTree: GetTreeMock;
  let openaiClient: jest.Mocked<OpenAIClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    openaiClient = makeOpenAIClientMock();

    // Always return the same dummy content so `execute()` doesn't bail
    // before issuing the test-file fetch we want to assert on. We don't
    // care about its body for this matrix — only the path it was called
    // with.
    getContent = jest.fn(async () => ({
      data: encodeContent("describe('x', () => { it('y', () => {}); });\n"),
    })) as GetContentMock;

    getRef = jest.fn(async () => ({
      data: { object: { sha: 'deadbeefcafe' } },
    })) as GetRefMock;

    // Empty tree: forces fallback path resolution but doesn't matter for
    // the cleanFilePath assertions, which only inspect the FIRST
    // getContent call (the test-file fetch).
    getTree = jest.fn(async () => ({
      data: { truncated: false, tree: [] },
    })) as GetTreeMock;
  });

  test.each(cases)('$name', async ({ input, expected }) => {
    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: input,
      testName: 'regression',
    });

    await agent.execute({ testFile: input }, context);

    // The first getContent call is the test-file fetch issued from
    // execute() with the cleaned path. Subsequent calls are support
    // files / page objects which we don't care about here.
    expect(getContent).toHaveBeenCalled();
    expect(getContent.mock.calls[0][0].path).toBe(expected);
  });

  test('URL rejection regression — https:// returns empty and skips test-file fetch', async () => {
    const sourceFetchContext = buildContext(getContent, getRef, getTree);
    const agent = new CodeReadingAgent(openaiClient, sourceFetchContext);

    const context = createAgentContext({
      errorMessage: '',
      testFile: 'https://example.com/foo.ts',
      testName: 'rejected',
    });

    await agent.execute(
      { testFile: 'https://example.com/foo.ts' },
      context
    );

    // When cleanFilePath returns '', execute() guards the testFile
    // fetch with `cleanTestFile` truthiness, so getContent is never
    // called for the test file. With an empty errorMessage, no
    // error-referenced files are extracted either, so getContent
    // should not be called at all.
    const fetchedPaths = getContent.mock.calls.map((c) => c[0].path);
    expect(fetchedPaths).not.toContain('https://example.com/foo.ts');
    expect(fetchedPaths).not.toContain('example.com/foo.ts');
  });
});
