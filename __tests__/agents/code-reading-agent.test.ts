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
