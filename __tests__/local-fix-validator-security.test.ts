/**
 * Security-focused tests for `LocalFixValidator` — the two highest-risk
 * untested methods plus the applied env denylist.
 *
 * 1. `pushAndCreatePR` staged-files restriction (the secret-leak guard).
 *    `setup()` writes a token-bearing `.npmrc` into the workdir, so what
 *    gets staged before `git commit` is security-critical:
 *      - With `changedFiles` provided, ONLY the listed files may be
 *        staged and `git add -A` must never run.
 *      - Without `changedFiles`, the fallback is `git add -A` followed
 *        by unstaging the scaffold secret files (`.npmrc`, `.env`,
 *        `.env.local`).
 *      - An EMPTY `changedFiles` array falls through to the `add -A`
 *        fallback (the `length > 0` guard fails). Pinned here: the
 *        scaffold unstage still runs, so the `.npmrc` written by
 *        `setup()` is NOT shipped — but any other secret-bearing file
 *        outside the three-name scaffold list would be swept in.
 *
 * 2. `validateFixPasses` — the publication gate requiring
 *    VALIDATION_PASS_COUNT consecutive evidence-bearing passes. Unlike
 *    `baselineCheck` (which always runs all attempts), it short-circuits
 *    on the first failure.
 *
 * 3. Env denylist APPLIED (not just the `shouldDropEnvVar` predicate,
 *    which has its own suite): the env object actually handed to the
 *    mocked `execSync` in `runTest()` must omit triage-agent credentials
 *    and their INPUT_ mirrors while keeping allow-listed test
 *    credentials (SAUCE_*) and general vars, plus the intentionally
 *    injected `NODE_AUTH_TOKEN`.
 *
 * `child_process` is fully mocked — no real subprocesses run.
 */
import { execSync, execFileSync } from 'child_process';
import {
  LocalFixValidator,
  TestRunResult,
  VALIDATION_PASS_COUNT,
} from '../src/services/local-fix-validator';

jest.mock('child_process');

const execSyncMock = execSync as unknown as jest.Mock;
const execFileSyncMock = execFileSync as unknown as jest.Mock;

type OctokitParam = ConstructorParameters<typeof LocalFixValidator>[1];

const FAKE_WORKDIR = '/tmp/triage-fix-security-test';

function makeValidator(options?: {
  npmToken?: string;
  octokit?: OctokitParam;
}): LocalFixValidator {
  const validator = new LocalFixValidator(
    {
      owner: 'acme',
      repo: 'test',
      branch: 'main',
      githubToken: 'ghp_stub_github_token',
      npmToken: options?.npmToken,
      testCommand: 'npx cypress run',
    },
    options?.octokit ?? ({} as unknown as OctokitParam)
  );
  // Set the private _workDir without going through async setup(),
  // matching the pattern in the other local-fix-validator suites.
  (validator as unknown as { _workDir: string })._workDir = FAKE_WORKDIR;
  return validator;
}

function makeRunResult(passed: boolean, overrides?: Partial<TestRunResult>): TestRunResult {
  return {
    passed,
    logs: passed ? 'PASS' : 'FAIL',
    exitCode: passed ? 0 : 1,
    durationMs: 1200,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// -----------------------------------------------------------------------------
// 1. pushAndCreatePR — staged-files restriction (secret-leak guard)
// -----------------------------------------------------------------------------

describe('LocalFixValidator.pushAndCreatePR — staged-files restriction', () => {
  const COMMIT_SHA = 'abc123def4567890';

  function makeOctokit() {
    const pullsCreate = jest.fn().mockResolvedValue({
      data: { html_url: 'https://github.com/acme/test/pull/42', number: 42 },
    });
    const octokit = { pulls: { create: pullsCreate } } as unknown as OctokitParam;
    return { octokit, pullsCreate };
  }

  /** All argv vectors of mocked `git` invocations, in call order. */
  function gitArgvs(): string[][] {
    return execFileSyncMock.mock.calls
      .filter(([cmd]) => cmd === 'git')
      .map(([, args]) => args as string[]);
  }

  const pushOptions = {
    branchName: 'triage/fix-login-spec',
    commitMessage: 'fix: repair login spec',
    prTitle: 'Fix login spec',
    prBody: 'Automated fix',
    baseBranch: 'main',
  };

  beforeEach(() => {
    // `git rev-parse HEAD` is the only call whose output is consumed
    // (`.trim()` is called on it) — everything else is fire-and-forget.
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) =>
      args[0] === 'rev-parse' ? `${COMMIT_SHA}\n` : ''
    );
  });

  it('stages ONLY the listed files when changedFiles is provided — never `git add -A`', async () => {
    const { octokit, pullsCreate } = makeOctokit();
    const validator = makeValidator({ octokit });

    const result = await validator.pushAndCreatePR({
      ...pushOptions,
      changedFiles: ['src/services/foo.ts', 'cypress/e2e/login.cy.ts'],
    });

    const argvs = gitArgvs();
    const addCalls = argvs.filter((a) => a[0] === 'add');

    // Exactly one add, with exactly the listed files — nothing else.
    expect(addCalls).toEqual([['add', 'src/services/foo.ts', 'cypress/e2e/login.cy.ts']]);

    // `git add -A` (or any -A flag) is NEVER invoked — this is what
    // keeps the token-bearing .npmrc written by setup() out of the PR.
    expect(argvs.some((a) => a.includes('-A'))).toBe(false);

    // The only reset is the initial index reset — no scaffold unstage
    // needed because -A was never used.
    const resetCalls = argvs.filter((a) => a[0] === 'reset');
    expect(resetCalls).toEqual([['reset', 'HEAD']]);

    // Sanity on the rest of the sequence and the returned result.
    expect(argvs).toContainEqual(['checkout', '-b', pushOptions.branchName]);
    expect(argvs).toContainEqual(['commit', '-m', pushOptions.commitMessage]);
    expect(argvs).toContainEqual(['push', 'origin', pushOptions.branchName]);
    expect(pullsCreate).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'test',
      title: pushOptions.prTitle,
      body: pushOptions.prBody,
      head: pushOptions.branchName,
      base: pushOptions.baseBranch,
    });
    expect(result).toEqual({
      branchName: pushOptions.branchName,
      commitSha: COMMIT_SHA,
      prUrl: 'https://github.com/acme/test/pull/42',
      prNumber: 42,
    });
  });

  it('falls back to `git add -A` and unstages scaffold secret files when changedFiles is absent', async () => {
    const { octokit } = makeOctokit();
    const validator = makeValidator({ octokit });

    await validator.pushAndCreatePR({ ...pushOptions });

    const argvs = gitArgvs();

    // Fallback stages everything...
    expect(argvs).toContainEqual(['add', '-A']);

    // ...then unstages each scaffold secret file, in order.
    const scaffoldResets = argvs.filter((a) => a[0] === 'reset' && a.length === 3);
    expect(scaffoldResets).toEqual([
      ['reset', 'HEAD', '.npmrc'],
      ['reset', 'HEAD', '.env'],
      ['reset', 'HEAD', '.env.local'],
    ]);

    // The unstage runs AFTER add -A and BEFORE the commit, so the
    // secrets are out of the index by the time the commit is created.
    const addIdx = argvs.findIndex((a) => a[0] === 'add' && a[1] === '-A');
    const npmrcResetIdx = argvs.findIndex((a) => a[0] === 'reset' && a[2] === '.npmrc');
    const commitIdx = argvs.findIndex((a) => a[0] === 'commit');
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(npmrcResetIdx).toBeGreaterThan(addIdx);
    expect(commitIdx).toBeGreaterThan(npmrcResetIdx);
  });

  it('EMPTY changedFiles array falls through to the add -A fallback — pinned, scaffold unstage still runs', async () => {
    // The guard is `changedFiles && changedFiles.length > 0`, so []
    // takes the fallback branch. The setup() .npmrc is protected by the
    // scaffold unstage, but NOTE: any secret file created during the
    // run under a name outside [.npmrc, .env, .env.local] would be
    // swept into the commit by this branch. Pinning current behavior;
    // callers must not pass [] to mean "nothing changed".
    const { octokit } = makeOctokit();
    const validator = makeValidator({ octokit });

    await validator.pushAndCreatePR({ ...pushOptions, changedFiles: [] });

    const argvs = gitArgvs();
    expect(argvs).toContainEqual(['add', '-A']);
    expect(argvs).toContainEqual(['reset', 'HEAD', '.npmrc']);
    expect(argvs).toContainEqual(['reset', 'HEAD', '.env']);
    expect(argvs).toContainEqual(['reset', 'HEAD', '.env.local']);
  });

  it('swallows unstage errors for scaffold files that were never staged', async () => {
    // `git reset HEAD <file>` exits non-zero when the file is not in
    // the index; pushAndCreatePR must treat that as benign and proceed.
    const { octokit, pullsCreate } = makeOctokit();
    const validator = makeValidator({ octokit });

    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'reset' && args[2] === '.env') {
        throw new Error("fatal: pathspec '.env' did not match any files");
      }
      return args[0] === 'rev-parse' ? `${COMMIT_SHA}\n` : '';
    });

    const result = await validator.pushAndCreatePR({ ...pushOptions });

    const argvs = gitArgvs();
    // The remaining scaffold file is still unstaged after the throw...
    expect(argvs).toContainEqual(['reset', 'HEAD', '.env.local']);
    // ...and the push/PR flow completes.
    expect(argvs).toContainEqual(['commit', '-m', pushOptions.commitMessage]);
    expect(argvs).toContainEqual(['push', 'origin', pushOptions.branchName]);
    expect(pullsCreate).toHaveBeenCalledTimes(1);
    expect(result.commitSha).toBe(COMMIT_SHA);
  });
});

// -----------------------------------------------------------------------------
// 2. validateFixPasses — publication gate (consecutive evidence-bearing passes)
// -----------------------------------------------------------------------------

describe('LocalFixValidator.validateFixPasses — consecutive-pass publication gate', () => {
  it('passes only when all consecutive runs pass', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true, { logs: 'PASS 1' }))
      .mockResolvedValueOnce(makeRunResult(true, { logs: 'PASS 2' }))
      .mockResolvedValueOnce(makeRunResult(true, { logs: 'PASS 3' }));

    const result = await validator.validateFixPasses();

    expect(result.passed).toBe(true);
    expect(runTestSpy).toHaveBeenCalledTimes(VALIDATION_PASS_COUNT);
    // Logs and exit code come from the last completed pass.
    expect(result.logs).toBe('PASS 3');
    expect(result.exitCode).toBe(0);
  });

  it('rejects when the final run fails (pass/pass/fail)', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1000 }))
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1500 }))
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL 3', exitCode: 7, durationMs: 900 }));

    const result = await validator.validateFixPasses();

    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(3);
    // Failure surfaces the failing run's logs/exit code, and durationMs
    // still accumulates across ALL runs including the failing one.
    expect(result.logs).toBe('FAIL 3');
    expect(result.exitCode).toBe(7);
    expect(result.durationMs).toBe(3400);
  });

  it('short-circuits on the first failure — no further runTest calls', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL 1', exitCode: 1, durationMs: 800 }));

    const result = await validator.validateFixPasses();

    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(1);
    expect(result.logs).toBe('FAIL 1');
    expect(result.durationMs).toBe(800);
  });

  it('accumulates durationMs across all passes on success', async () => {
    const validator = makeValidator();
    jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1000 }))
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1500 }))
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1200 }));

    const result = await validator.validateFixPasses();

    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(3700);
  });
});

// -----------------------------------------------------------------------------
// 3. Env denylist APPLIED to the runTest subprocess
// -----------------------------------------------------------------------------

describe('runTest — env denylist applied to the actual subprocess invocation', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      // Triage-agent credentials that must NOT reach the subprocess.
      GITHUB_TOKEN: 'ghp_leaky',
      OPENAI_API_KEY: 'sk-leaky',
      NPM_TOKEN: 'npm-leaky',
      CROSS_REPO_PAT: 'pat-leaky',
      // GHA INPUT_ mirrors of the same.
      INPUT_GITHUB_TOKEN: 'ghp_leaky_input',
      INPUT_OPENAI_API_KEY: 'sk-leaky-input',
      INPUT_NPM_TOKEN: 'npm-leaky-input',
      INPUT_CROSS_REPO_PAT: 'pat-leaky-input',
      // Allow-listed test-suite credentials that MUST pass through.
      SAUCE_USERNAME: 'sauce-user',
      SAUCE_ACCESS_KEY: 'sauce-access-key',
      // Ordinary non-secret vars that must survive the filter.
      CYPRESS_BASE_URL: 'https://learn.adept.at',
      NODE_ENV: 'test',
    };
    // runTest consumes execSync's return value (`output.slice(...)`),
    // so the mock must return a string. Empty output fails the
    // evidence gate, which is fine — we only inspect the env option.
    execSyncMock.mockReturnValue('');
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  function capturedEnv(): Record<string, string> {
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    const opts = execSyncMock.mock.calls[0][1] as { env: Record<string, string> };
    return opts.env;
  }

  it('omits triage-agent secrets and their INPUT_ mirrors while keeping allowed vars', async () => {
    const validator = makeValidator({ npmToken: 'npm-configured-token' });

    await validator.runTest();

    const env = capturedEnv();

    for (const denied of [
      'GITHUB_TOKEN',
      'OPENAI_API_KEY',
      'NPM_TOKEN',
      'CROSS_REPO_PAT',
      'INPUT_GITHUB_TOKEN',
      'INPUT_OPENAI_API_KEY',
      'INPUT_NPM_TOKEN',
      'INPUT_CROSS_REPO_PAT',
    ]) {
      expect(env).not.toHaveProperty(denied);
    }

    // Allow-overridden test credentials pass through untouched.
    expect(env.SAUCE_USERNAME).toBe('sauce-user');
    expect(env.SAUCE_ACCESS_KEY).toBe('sauce-access-key');

    // Ordinary vars survive the filter.
    expect(env.CYPRESS_BASE_URL).toBe('https://learn.adept.at');
    expect(env.NODE_ENV).toBe('test');
    expect(env.PATH).toBeDefined();

    // filterEnv intentionally injects the configured npm token as
    // NODE_AUTH_TOKEN (needed for @adept-at registry auth inside the
    // cloned repo).
    expect(env.NODE_AUTH_TOKEN).toBe('npm-configured-token');

    // And the subprocess runs inside the cloned workdir.
    const opts = execSyncMock.mock.calls[0][1] as { cwd: string };
    expect(opts.cwd).toBe(FAKE_WORKDIR);
  });

  it('falls back to the github token for NODE_AUTH_TOKEN when npmToken is not configured', async () => {
    // Pinned documented behavior: filterEnv(npmToken || githubToken)
    // means the GitHub token IS intentionally exposed to the test
    // subprocess under NODE_AUTH_TOKEN when no npmToken is provided —
    // the one deliberate exception to the GITHUB_TOKEN denylist entry.
    const validator = makeValidator();

    await validator.runTest();

    const env = capturedEnv();
    expect(env).not.toHaveProperty('GITHUB_TOKEN');
    expect(env.NODE_AUTH_TOKEN).toBe('ghp_stub_github_token');
  });
});
