import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';

jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('../src/repair-context');
jest.mock('../src/repair/simplified-repair-agent');
jest.mock('../src/services/local-fix-validator');

import { iterativeFixValidateLoop, fixFingerprint } from '../src/pipeline/validator';
import { buildRepairContext } from '../src/repair-context';
import { SimplifiedRepairAgent } from '../src/repair/simplified-repair-agent';
import { LocalFixValidator } from '../src/services/local-fix-validator';
import type {
  BaselineCheckResult,
  TestRunResult,
} from '../src/services/local-fix-validator';
import {
  getGateCounters,
  _resetGateCounters,
} from '../src/pipeline/run-telemetry';
import { SkillStore } from '../src/services/skill-store';
import { OpenAIClient } from '../src/openai-client';
import { ActionInputs, FixRecommendation } from '../src/types';

describe('iterativeFixValidateLoop gates', () => {
  const repoDetails = { owner: 'adept-at', repo: 'wdio-tests' };
  const autoFixTargetRepo = { owner: 'adept-at', repo: 'wdio-tests' };

  const errorData = {
    message: 'AssertionError: expected login button to be visible',
    testName: 'user can log in',
    fileName: 'test/specs/login.spec.ts',
    framework: 'wdio',
  };

  const baseInputs: ActionInputs = {
    githubToken: 'gh-token',
    openaiApiKey: 'openai-key',
    confidenceThreshold: 70,
    productRepo: 'adept-at/learn-webapp',
    autoFixTargetRepo: 'adept-at/wdio-tests',
    autoFixMinConfidence: 70,
    branch: 'main',
    validationTestCommand: 'npm run wdio -- --spec {spec}',
    workflowRunId: '12345',
    jobName: 'e2e',
    commitSha: 'abc1234',
    repository: 'adept-at/wdio-tests',
  };

  const makeFix = (
    overrides: Partial<FixRecommendation> = {}
  ): FixRecommendation => ({
    confidence: 85,
    summary: 'Wait for login button before clicking',
    proposedChanges: [
      {
        file: 'test/specs/login.spec.ts',
        line: 10,
        oldCode: 'await btn.click();',
        newCode: 'await btn.waitForDisplayed();\nawait btn.click();',
        justification: 'button renders asynchronously',
      },
    ],
    evidence: ['screenshot shows spinner'],
    reasoning: 'timing issue',
    ...overrides,
  });

  const makeSkillStore = (
    overrides: Record<string, jest.Mock> = {}
  ): SkillStore =>
    ({
      findRelevantForInvestigation: jest.fn().mockReturnValue([]),
      findFailedTrajectories: jest.fn().mockReturnValue([]),
      detectFlakiness: jest.fn().mockReturnValue({ flaky: false, fixCount: 0 }),
      countRecentFailedTrajectories: jest.fn().mockReturnValue(0),
      findRecentFailedFingerprints: jest.fn().mockReturnValue([]),
      ...overrides,
    } as unknown as SkillStore);

  const passedRun: TestRunResult = {
    passed: true,
    logs: 'all green',
    exitCode: 0,
    durationMs: 1000,
  };

  const failedRun: TestRunResult = {
    passed: false,
    logs: 'AssertionError: expected login button to be visible\n  at login.spec.ts:10',
    exitCode: 1,
    durationMs: 2000,
  };

  const baselineAllFailed: BaselineCheckResult = {
    ...failedRun,
    disposition: 'all_failed',
    passCount: 0,
    failCount: 3,
  };

  let mockValidator: {
    setup: jest.Mock;
    baselineCheck: jest.Mock;
    applyFix: jest.Mock;
    validateFixPasses: jest.Mock;
    pushAndCreatePR: jest.Mock;
    reset: jest.Mock;
    cleanup: jest.Mock;
  };
  let mockAgentGenerateFix: jest.Mock;
  const openaiClient = {} as unknown as OpenAIClient;
  const octokit = {} as unknown as Octokit;

  const runLoop = (skillStore?: SkillStore, inputs: ActionInputs = baseInputs) =>
    iterativeFixValidateLoop(
      inputs,
      repoDetails,
      autoFixTargetRepo,
      errorData,
      openaiClient,
      octokit,
      skillStore
    );

  beforeEach(() => {
    jest.clearAllMocks();
    _resetGateCounters();

    (github.context as unknown) = {
      repo: { owner: 'adept-at', repo: 'wdio-tests' },
      runId: 999999,
      sha: 'abc1234',
      ref: 'refs/heads/main',
      payload: {},
    };

    (buildRepairContext as jest.Mock).mockReturnValue({
      testFile: errorData.fileName,
      testName: errorData.testName,
      errorMessage: errorData.message,
      workflowRunId: '12345',
      jobName: 'e2e',
      commitSha: 'abc1234',
      branch: 'main',
      repository: 'adept-at/wdio-tests',
    });

    mockValidator = {
      setup: jest.fn().mockResolvedValue(undefined),
      baselineCheck: jest.fn().mockResolvedValue(baselineAllFailed),
      applyFix: jest.fn().mockResolvedValue(undefined),
      validateFixPasses: jest.fn().mockResolvedValue(failedRun),
      pushAndCreatePR: jest.fn(),
      reset: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    (
      LocalFixValidator as jest.MockedClass<typeof LocalFixValidator>
    ).mockImplementation(() => mockValidator as unknown as LocalFixValidator);

    mockAgentGenerateFix = jest.fn().mockResolvedValue({ fix: makeFix() });
    (
      SimplifiedRepairAgent as jest.MockedClass<typeof SimplifiedRepairAgent>
    ).mockImplementation(
      () =>
        ({
          generateFixRecommendation: mockAgentGenerateFix,
        } as unknown as SimplifiedRepairAgent)
    );
  });

  describe('baseline transient-failure skip', () => {
    it('exits before any fix generation when the baseline passes without a fix', async () => {
      mockValidator.baselineCheck.mockResolvedValue({
        ...passedRun,
        disposition: 'all_passed',
        passCount: 3,
        failCount: 0,
      } satisfies BaselineCheckResult);

      const result = await runLoop(makeSkillStore());

      expect(result.iterations).toBe(0);
      expect(result.fixRecommendation).toBeNull();
      expect(result.autoFixResult).toBeNull();
      expect(result.baselineDisposition).toBe('all_passed');
      expect(result.repairTelemetry).toEqual(
        expect.objectContaining({
          status: 'skipped',
          summary: expect.stringContaining('failure likely transient'),
          iterations: 0,
        })
      );

      // The whole point of the baseline-first ordering: no repair cost paid.
      expect(SimplifiedRepairAgent).not.toHaveBeenCalled();
      expect(mockAgentGenerateFix).not.toHaveBeenCalled();
      expect(mockValidator.applyFix).not.toHaveBeenCalled();
      expect(mockValidator.validateFixPasses).not.toHaveBeenCalled();
      expect(mockValidator.cleanup).toHaveBeenCalledTimes(1);
    });

    it('treats a mixed baseline as flaky/inconclusive and skips repair', async () => {
      mockValidator.baselineCheck.mockResolvedValue({
        ...failedRun,
        disposition: 'mixed',
        passCount: 1,
        failCount: 2,
      } satisfies BaselineCheckResult);

      const result = await runLoop(makeSkillStore());

      expect(result.iterations).toBe(0);
      expect(result.baselineDisposition).toBe('mixed');
      expect(result.repairTelemetry?.status).toBe('skipped');
      expect(result.repairTelemetry?.summary).toContain(
        'baseline mixed results (1 pass / 2 fail)'
      );
      expect(mockAgentGenerateFix).not.toHaveBeenCalled();
    });
  });

  describe('blast-radius confidence gate', () => {
    it('rejects a shared-code fix below the scaled threshold and records the skip', async () => {
      // Shared-code path (+10) raises the requirement from 70 to 80;
      // confidence 75 clears the base threshold but not the scaled one.
      const sharedCodeFix = makeFix({
        confidence: 75,
        proposedChanges: [
          {
            file: 'test/helpers/auth.ts',
            line: 5,
            oldCode: 'return login();',
            newCode: 'return retryLogin();',
            justification: 'flaky login helper',
          },
        ],
      });
      mockAgentGenerateFix.mockResolvedValue({ fix: sharedCodeFix });

      const result = await runLoop(makeSkillStore());

      expect(result.autoFixSkipped).toBe(true);
      expect(result.autoFixSkippedReason).toMatch(
        /Blast-radius gate: confidence 75% < required 80%/
      );
      expect(result.autoFixSkippedReason).toContain('touches shared code');
      expect(result.iterations).toBe(1);
      expect(result.fixRecommendation).toEqual(sharedCodeFix);
      expect(result.autoFixResult).toBeNull();

      // The rejected fix must never reach the working tree or a test run.
      expect(mockValidator.applyFix).not.toHaveBeenCalled();
      expect(mockValidator.validateFixPasses).not.toHaveBeenCalled();
      expect(mockValidator.pushAndCreatePR).not.toHaveBeenCalled();
      expect(getGateCounters().blastRadiusBlocks).toBe(1);
    });

    it('does not flag autoFixSkipped when only the base threshold rejects the fix', async () => {
      // Spec-local single-file fix: no blast-radius scaling, required stays
      // at the base 70. Confidence 60 fails the plain user threshold, which
      // is "no viable fix", not a policy hold-back.
      mockAgentGenerateFix.mockResolvedValue({
        fix: makeFix({ confidence: 60 }),
      });

      const result = await runLoop(makeSkillStore());

      expect(result.autoFixSkipped).toBe(false);
      expect(result.autoFixSkippedReason).toBeUndefined();
      expect(mockValidator.applyFix).not.toHaveBeenCalled();
      expect(getGateCounters().blastRadiusBlocks).toBe(0);
    });
  });

  describe('in-run fingerprint dedup', () => {
    it('stops when a later iteration regenerates a byte-identical failed fix', async () => {
      // Iteration 1 fails validation; iteration 2 returns the same fix
      // (whitespace-only difference — the fingerprint normalizes it away).
      const fix = makeFix();
      const whitespaceTwin = makeFix({
        proposedChanges: [
          {
            ...fix.proposedChanges[0],
            newCode: 'await  btn.waitForDisplayed();\nawait  btn.click();',
          },
        ],
      });
      mockAgentGenerateFix
        .mockResolvedValueOnce({ fix })
        .mockResolvedValueOnce({ fix: whitespaceTwin });
      mockValidator.validateFixPasses.mockResolvedValue(failedRun);

      const result = await runLoop(makeSkillStore());

      // Two iterations ran, but only iteration 1 applied + validated;
      // iteration 2 broke on the fingerprint before touching the repo.
      expect(result.iterations).toBe(2);
      expect(mockValidator.applyFix).toHaveBeenCalledTimes(1);
      expect(mockValidator.validateFixPasses).toHaveBeenCalledTimes(1);
      expect(mockAgentGenerateFix).toHaveBeenCalledTimes(2);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('fix identical to a previous failed attempt')
      );

      // The iteration-1 failure result survives as the terminal outcome.
      expect(result.autoFixResult).toEqual(
        expect.objectContaining({
          success: false,
          validationStatus: 'failed',
        })
      );
      expect(result.autoFixSkipped).toBe(false);
    });
  });

  describe('cross-run fingerprint dedup', () => {
    it('skips a fix whose fingerprint already failed validation in a recent run', async () => {
      const fix = makeFix();
      mockAgentGenerateFix.mockResolvedValue({ fix });
      const skillStore = makeSkillStore({
        findRecentFailedFingerprints: jest
          .fn()
          .mockReturnValue([fixFingerprint(fix)]),
      });

      const result = await runLoop(skillStore);

      expect(result.autoFixSkipped).toBe(true);
      expect(result.autoFixSkippedReason).toBe(
        'Cross-run fingerprint dedupe: identical fix already failed validation on this spec within the last 24h.'
      );
      expect(result.iterations).toBe(1);
      expect(result.autoFixResult).toBeNull();
      expect(mockValidator.applyFix).not.toHaveBeenCalled();
      expect(mockValidator.validateFixPasses).not.toHaveBeenCalled();
      expect(getGateCounters().priorFailedTrajectoryBoosts).toBe(1);
      expect(
        (skillStore.findRecentFailedFingerprints as jest.Mock).mock.calls[0][0]
      ).toBe(errorData.fileName);
    });
  });

  describe('failed-trajectory recording', () => {
    it('returns a terminal failed autoFixResult after exhausting all iterations', async () => {
      // Three distinct fixes so neither dedup gate short-circuits the loop.
      const fixes = [1, 2, 3].map((i) =>
        makeFix({
          proposedChanges: [
            {
              file: 'test/specs/login.spec.ts',
              line: 10,
              oldCode: 'await btn.click();',
              newCode: `await btn.click(); // attempt ${i}`,
              justification: `attempt ${i}`,
            },
          ],
        })
      );
      mockAgentGenerateFix
        .mockResolvedValueOnce({ fix: fixes[0], agentRootCause: 'cause-1' })
        .mockResolvedValueOnce({ fix: fixes[1], agentRootCause: 'cause-2' })
        .mockResolvedValueOnce({ fix: fixes[2], agentRootCause: 'cause-3' });
      mockValidator.validateFixPasses.mockResolvedValue(failedRun);

      const result = await runLoop(makeSkillStore());

      expect(result.iterations).toBe(3);
      expect(mockValidator.applyFix).toHaveBeenCalledTimes(3);
      expect(mockValidator.reset).toHaveBeenCalledTimes(3);

      // The terminal failure result carries the failed-trajectory payload the
      // coordinator persists as a validatedLocally=false skill. Without it the
      // cross-run dedupe and blast-radius boosts stay permanently inert.
      expect(result.autoFixResult).toEqual({
        success: false,
        modifiedFiles: ['test/specs/login.spec.ts'],
        error: 'Local validation failed on iteration 3 (exit code 1)',
        validationStatus: 'failed',
        validationResult: {
          status: 'failed',
          mode: 'local',
          conclusion: 'failure',
          failure: {
            primaryError:
              'AssertionError: expected login button to be visible',
            failureStage: 'validation',
          },
        },
      });

      // Failure context threads forward: iteration 3's previousAttempt must
      // carry iteration 2's fix and root cause (not stale iteration-1 data).
      const thirdCallPreviousAttempt =
        mockAgentGenerateFix.mock.calls[2][2];
      expect(thirdCallPreviousAttempt).toEqual(
        expect.objectContaining({
          iteration: 2,
          previousFix: fixes[1],
          validationLogs: failedRun.logs,
          priorAgentRootCause: 'cause-2',
        })
      );
    });
  });

  describe('success path', () => {
    it('returns the PR result when validation passes on the first iteration', async () => {
      mockValidator.validateFixPasses.mockResolvedValue(passedRun);
      mockValidator.pushAndCreatePR.mockResolvedValue({
        branchName: 'fix/triage-agent/login-spec-20260807-001',
        commitSha: 'deadbee',
        prUrl: 'https://github.com/adept-at/wdio-tests/pull/42',
        prNumber: 42,
      });

      const result = await runLoop(makeSkillStore());

      expect(result.iterations).toBe(1);
      expect(result.prUrl).toBe(
        'https://github.com/adept-at/wdio-tests/pull/42'
      );
      expect(result.autoFixResult).toEqual({
        success: true,
        modifiedFiles: ['test/specs/login.spec.ts'],
        commitSha: 'deadbee',
        branchName: 'fix/triage-agent/login-spec-20260807-001',
        prUrl: 'https://github.com/adept-at/wdio-tests/pull/42',
        prNumber: 42,
        validationStatus: 'passed',
        validationResult: {
          status: 'passed',
          mode: 'local',
          conclusion: 'success',
        },
      });
      expect(result.autoFixSkipped).toBe(false);
      expect(mockValidator.pushAndCreatePR).toHaveBeenCalledWith(
        expect.objectContaining({
          baseBranch: 'main',
          changedFiles: ['test/specs/login.spec.ts'],
          prTitle: 'Auto-fix: test/specs/login.spec.ts',
        })
      );
      expect(mockValidator.reset).not.toHaveBeenCalled();
      expect(mockValidator.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('push-failed-after-pass path', () => {
    it('keeps validationStatus=passed when the push/PR step fails', async () => {
      mockValidator.validateFixPasses.mockResolvedValue(passedRun);
      mockValidator.pushAndCreatePR.mockRejectedValue(
        new Error('remote rejected')
      );

      const result = await runLoop(makeSkillStore());

      expect(result.iterations).toBe(1);
      expect(result.prUrl).toBeUndefined();
      // Result must reflect validation truth: the fix passed, only the
      // push failed — success:false but validationStatus stays 'passed'.
      expect(result.autoFixResult).toEqual({
        success: false,
        modifiedFiles: ['test/specs/login.spec.ts'],
        error: expect.stringContaining('Push failed after successful test'),
        validationStatus: 'passed',
        validationResult: {
          status: 'passed',
          mode: 'local',
          conclusion: 'success',
        },
      });
      // Returned immediately after the push failure — no retry iteration.
      expect(mockAgentGenerateFix).toHaveBeenCalledTimes(1);
      expect(mockValidator.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup in finally', () => {
    it('invokes cleanup when validation throws mid-loop', async () => {
      mockValidator.validateFixPasses.mockRejectedValue(
        new Error('runner exploded')
      );

      await expect(runLoop(makeSkillStore())).rejects.toThrow(
        'runner exploded'
      );

      expect(mockValidator.applyFix).toHaveBeenCalledTimes(1);
      expect(mockValidator.cleanup).toHaveBeenCalledTimes(1);
    });

    it('does not invoke cleanup when setup itself fails', async () => {
      mockValidator.setup.mockRejectedValue(new Error('clone failed'));

      await expect(runLoop(makeSkillStore())).rejects.toThrow('clone failed');

      expect(mockValidator.baselineCheck).not.toHaveBeenCalled();
      expect(mockValidator.cleanup).not.toHaveBeenCalled();
    });
  });
});
