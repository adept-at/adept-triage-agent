import { LocalFixValidator, TestRunResult } from '../../src/services/local-fix-validator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// -----------------------------------------------------------------------------
// Multi-pass baselineCheck (v1.50.1 CP1)
//
// Pre-v1.50.1, baselineCheck() ran the test once. That single-pass signal was
// flagged in the v1.50.0 review gate as too noisy to attribute 'incorrect'
// against classifier-surfaced skills — a single pass doesn't distinguish
//   (1) "test was never broken"            (classifier was wrong)
//   (2) "test is flaky"                    (classifier was right, fix is moot)
//   (3) "product race self-resolved"       (neither side wrong)
//
// v1.50.1 tightens the signal: baselineCheck runs the test BASELINE_PASS_COUNT
// consecutive times (default: 3). Every pass must succeed before we conclude
// "test passes without fix." Short-circuits on first failure to keep cost
// bounded when the baseline genuinely fails.
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

describe('LocalFixValidator.baselineCheck — multi-pass semantics (v1.50.1 CP1)', () => {
  it('passes only when all 3 runs pass in a row', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(true));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(true);
    expect(runTestSpy).toHaveBeenCalledTimes(3);
  });

  it('short-circuits on first failure (does NOT run subsequent passes)', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL pass 1', exitCode: 1 }))
      // Extra stubs in case the impl wrongly proceeds; we assert the count.
      .mockResolvedValue(makeRunResult(true));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(1);
    expect(result.logs).toContain('FAIL pass 1');
  });

  it('fails overall when pass 3 fails (does NOT mask late instability)', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL pass 3', exitCode: 1 }));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(3);
    // Failed-pass logs are what the operator cares about — preserve them so
    // the "why did baseline fail?" trail is present.
    expect(result.logs).toContain('FAIL pass 3');
  });

  it('fails overall when pass 2 fails', async () => {
    const validator = makeValidator();
    const runTestSpy = jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true))
      .mockResolvedValueOnce(makeRunResult(false, { logs: 'FAIL pass 2', exitCode: 1 }))
      .mockResolvedValue(makeRunResult(true));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(false);
    expect(runTestSpy).toHaveBeenCalledTimes(2);
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
    // Summed so the operator sees the actual elapsed cost of the multi-pass
    // check, not just the last pass.
    expect(result.durationMs).toBe(3700);
  });

  it('exit code on failure is taken from the FAILING pass (not 0)', async () => {
    const validator = makeValidator();
    jest
      .spyOn(validator, 'runTest')
      .mockResolvedValueOnce(makeRunResult(true, { exitCode: 0 }))
      .mockResolvedValueOnce(makeRunResult(false, { exitCode: 137, logs: 'OOM' }));

    const result = await validator.baselineCheck();

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(137);
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
