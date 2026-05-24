/**
 * Per-run gate / fast-path / safety counters.
 *
 * Each invocation of the action is its own process; counters are
 * module-level singletons that accumulate across all gate sites and
 * are emitted as a single grep-stable summary line at end of run by
 * `logRunGateSummary()`.
 *
 * Why this exists: pre-this-module, every gate (blast-radius blocks,
 * branch dedupe, infra fast-path, verdict-override abort, prior-failed-
 * trajectory boost, skill-write skips, flakiness watch) emitted its
 * own `core.info`/`core.warning` lines but no aggregated view. To
 * answer "are these gates firing in production?" an operator had to
 * grep across thousands of action runs. The single summary line below
 * gives operators and log pipelines a stable per-run row to aggregate
 * over.
 *
 * Counters are intentionally simple integers, not structured records,
 * because the goal is observability of gate FREQUENCY across many
 * runs, not per-incident detail (those are captured in the existing
 * per-event log lines).
 */
import * as core from '@actions/core';

interface GateCounters {
  /** Auto-fix skipped because confidence < requiredConfidence (with reasons). */
  blastRadiusBlocks: number;
  /** Branch push refused because a duplicate fix branch existed within window. */
  branchDedupeHits: number;
  /** LLM classifier skipped — failure matched an infrastructure signature. */
  infraFastPathHits: number;
  /** Repair aborted because investigation override flagged confident APP_CODE. */
  verdictOverrideAborts: number;
  /** requiredConfidence threshold raised because of recent failed trajectories. */
  priorFailedTrajectoryBoosts: number;
  /** Skill-store outcome write skipped (validation pending / no terminal status). */
  skillWriteSkips: number;
  /** Pre-chronic flakiness watch warning emitted (fixCount=2). */
  flakinessWatchEmits: number;
  /** Auto-fix skipped because spec was unfixable per a curated nonFixable seed. */
  nonFixableSeedSkips: number;
}

const counters: GateCounters = createEmpty();

function createEmpty(): GateCounters {
  return {
    blastRadiusBlocks: 0,
    branchDedupeHits: 0,
    infraFastPathHits: 0,
    verdictOverrideAborts: 0,
    priorFailedTrajectoryBoosts: 0,
    skillWriteSkips: 0,
    flakinessWatchEmits: 0,
    nonFixableSeedSkips: 0,
  };
}

/**
 * Increment one of the run-scoped gate counters. Called at the gate
 * site itself; the counter name is a compile-time-checked literal of
 * `keyof GateCounters` so misspellings are caught at the call site.
 */
export function recordGate(kind: keyof GateCounters): void {
  counters[kind]++;
}

/**
 * Snapshot of all counters — primarily for tests. Returns a copy so
 * callers cannot mutate the live counters.
 */
export function getGateCounters(): GateCounters {
  return { ...counters };
}

/**
 * Reset all counters to zero. Used by tests between cases; not used
 * in production (each action invocation gets a fresh process). Marked
 * with leading underscore to discourage accidental call from product
 * code.
 */
export function _resetGateCounters(): void {
  Object.assign(counters, createEmpty());
}

/**
 * Emit the per-run gate-telemetry summary line. Single grep-stable
 * row so log pipelines can aggregate gate frequency across runs:
 *
 *   📊 gate-telemetry-summary blast-radius=N branch-dedupe=N infra-fast-path=N
 *   verdict-override=N prior-failed-boost=N skill-write-skip=N
 *   flakiness-watch=N non-fixable-seed=N
 *
 * Always emitted, even when all counters are zero, so absence of the
 * line in run logs is itself a signal (e.g., the line was suppressed
 * by an early crash). Wrapped in try/catch — never-throw contract.
 */
export function logRunGateSummary(): void {
  try {
    const c = counters;
    core.info(
      `📊 gate-telemetry-summary ` +
        `blast-radius=${c.blastRadiusBlocks} ` +
        `branch-dedupe=${c.branchDedupeHits} ` +
        `infra-fast-path=${c.infraFastPathHits} ` +
        `verdict-override=${c.verdictOverrideAborts} ` +
        `prior-failed-boost=${c.priorFailedTrajectoryBoosts} ` +
        `skill-write-skip=${c.skillWriteSkips} ` +
        `flakiness-watch=${c.flakinessWatchEmits} ` +
        `non-fixable-seed=${c.nonFixableSeedSkips}`
    );
  } catch {
    // Never-throw contract: telemetry must not destabilize end-of-run cleanup.
  }
}
