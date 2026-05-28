/**
 * Tests for `src/pipeline/run-telemetry.ts` — the per-run gate counters
 * surfaced as a single grep-stable summary line at end of run.
 *
 * Counters are module-level singletons. Tests use `_resetGateCounters`
 * between cases to avoid cross-contamination.
 */
import * as core from '@actions/core';
import {
  recordGate,
  getGateCounters,
  logRunGateSummary,
  _resetGateCounters,
} from '../../src/pipeline/run-telemetry';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

const mockedInfo = core.info as jest.MockedFunction<typeof core.info>;

beforeEach(() => {
  _resetGateCounters();
  mockedInfo.mockReset();
});

describe('run-telemetry — recordGate / getGateCounters', () => {
  it('returns all-zero counters before any recordGate calls', () => {
    expect(getGateCounters()).toEqual({
      blastRadiusBlocks: 0,
      branchDedupeHits: 0,
      infraFastPathHits: 0,
      verdictOverrideAborts: 0,
      priorFailedTrajectoryBoosts: 0,
      skillWriteSkips: 0,
      flakinessWatchEmits: 0,
      nonFixableSeedSkips: 0,
      skillReinforcements: 0,
    });
  });

  it('increments the targeted counter and leaves the others alone', () => {
    recordGate('blastRadiusBlocks');
    recordGate('blastRadiusBlocks');
    recordGate('infraFastPathHits');

    const c = getGateCounters();
    expect(c.blastRadiusBlocks).toBe(2);
    expect(c.infraFastPathHits).toBe(1);
    expect(c.branchDedupeHits).toBe(0);
    expect(c.verdictOverrideAborts).toBe(0);
  });

  it('returned counter object is a copy (mutation does not leak)', () => {
    recordGate('blastRadiusBlocks');
    const snapshot = getGateCounters();
    snapshot.blastRadiusBlocks = 999;
    expect(getGateCounters().blastRadiusBlocks).toBe(1);
  });
});

describe('run-telemetry — logRunGateSummary', () => {
  it('emits a grep-stable summary line with all counters', () => {
    recordGate('blastRadiusBlocks');
    recordGate('branchDedupeHits');
    recordGate('infraFastPathHits');
    recordGate('verdictOverrideAborts');

    logRunGateSummary();

    expect(mockedInfo).toHaveBeenCalledTimes(1);
    const line = mockedInfo.mock.calls[0][0];
    expect(line).toContain('gate-telemetry-summary');
    expect(line).toContain('blast-radius=1');
    expect(line).toContain('branch-dedupe=1');
    expect(line).toContain('infra-fast-path=1');
    expect(line).toContain('verdict-override=1');
    expect(line).toContain('prior-failed-boost=0');
    expect(line).toContain('skill-write-skip=0');
    expect(line).toContain('flakiness-watch=0');
    expect(line).toContain('non-fixable-seed=0');
  });

  it('emits the summary line even when all counters are zero (no-activity signal)', () => {
    logRunGateSummary();
    expect(mockedInfo).toHaveBeenCalledTimes(1);
    expect(mockedInfo.mock.calls[0][0]).toContain('gate-telemetry-summary');
  });

  it('never throws even when core.info throws', () => {
    mockedInfo.mockImplementationOnce(() => {
      throw new Error('EPIPE: closed log stream');
    });
    // Must not propagate.
    expect(() => logRunGateSummary()).not.toThrow();
  });
});
