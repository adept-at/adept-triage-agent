import { LocalFixValidator, TestRunResult } from '../../src/services/local-fix-validator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// -----------------------------------------------------------------------------
// Multi-attempt baselineCheck
//
// Repair proceeds only when ALL baseline attempts fail. Any pass (or a mixed
// fail/pass sequence) means the original failure was transient or flaky —
// publishing a fix would be unsafe. All attempts always run so mixed
// sequences are visible.
// -----------------------------------------------------------------------------

// Octokit is not touched by baselineCheck — give it a minimal stub.
const fakeOctokit = {} as unknown as ConstructorParameters<typeof LocalFixValidator>[1];

function makeValidator(): LocalFixValidator {
  return new LocalFixValidator(
    {
      owner: 'acme',
      repo: 'test',
      branch: 'main',
      githubToken: 'ghp_stub',
      testCommand: 'npx cypress run',
    },
    fakeOctokit
  );
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

describe('LocalFixValidator.baselineCheck — consistent-failure semantics', () => {
  it('passes only when all 3 runs pass in a row', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(true));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(true);
    expect(result.disposition).toBe('all_passed');
    expect(runTestSpy).toHaveBeenCalledTimes(3);
  });

  it('runs all attempts even after an early failure (no short-circuit)', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL pass 1', exitCode: 1 }))
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(true));

    const result = await validator.baselineCheck();

    expect(result.disposition).toBe('mixed');
    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(3);
    expect(result.passCount).toBe(2);
    expect(result.failCount).toBe(1);
  });

  it('reports all_failed only when every attempt fails', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL 1', exitCode: 1 }))
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL 2', exitCode: 1 }))
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL 3', exitCode: 1 }));

    const result = await validator.baselineCheck();

    expect(result.disposition).toBe('all_failed');
    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(3);
    expect(result.logs).toContain('FAIL');
  });

  it('treats fail then later pass as mixed (not repairable)', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL pass 2', exitCode: 1 }))
      .mockResolvedValueOnce(makeRunResult(true));

    const result = await validator.baselineCheck();

    expect(result.disposition).toBe('mixed');
    expect(runTestSpy).toHaveBeenCalledTimes(3);
  });

  it('returns a summed durationMs across all completed passes', async () => {
    const validator = makeValidator();
    jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1000 }))
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1500 }))
      .mockResolvedValueOnce(makeRunResult(true, { durationMs: 1200 }));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(3700);
  });

  it('exit code on failure is taken from a failing pass (not 0)', async () => {
    const validator = makeValidator();
    jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(false, { exitCode: 137, logs: 'OOM' }))
      .mockResolvedValueOnce(makeRunResult(false, { exitCode: 1, logs: 'FAIL' }))
      .mockResolvedValueOnce(makeRunResult(false, { exitCode: 1, logs: 'FAIL' }));

    const result = await validator.baselineCheck();

    expect(result.disposition).toBe('all_failed');
    expect(result.exitCode).toBe(1);
  });
});

describe('LocalFixValidator.applyFix path safety', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-validator-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeValidatorAt(workDir: string): LocalFixValidator {
    const validator = makeValidator();
    (validator as unknown as { _workDir: string })._workDir = workDir;
    return validator;
  }

  it('rejects sibling-prefix traversal paths outside the workdir', async () => {
    const workDir = path.join(tmpRoot, 'triage-fix-123');
    const sibling = path.join(tmpRoot, 'triage-fix-123-evil');
    fs.mkdirSync(workDir);
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'target.txt'), 'old', 'utf-8');

    const validator = makeValidatorAt(workDir);

    await expect(
      validator.applyFix([
        {
          file: '../triage-fix-123-evil/target.txt',
          oldCode: 'old',
          newCode: 'new',
        },
      ])
    ).rejects.toThrow('Path traversal rejected');

    expect(fs.readFileSync(path.join(sibling, 'target.txt'), 'utf-8')).toBe('old');
  });

  it('still applies fixes inside the workdir', async () => {
    const workDir = path.join(tmpRoot, 'triage-fix-123');
    fs.mkdirSync(path.join(workDir, 'src'), { recursive: true });
    const target = path.join(workDir, 'src', 'target.txt');
    fs.writeFileSync(target, 'before old after', 'utf-8');

    const validator = makeValidatorAt(workDir);
    await validator.applyFix([
      {
        file: './src/target.txt',
        oldCode: 'old',
        newCode: 'new',
      },
    ]);

    expect(fs.readFileSync(target, 'utf-8')).toBe('before new after');
  });
});
