#!/usr/bin/env npx ts-node
/**
 * Non-production GPT-5.6 replay evaluator.
 *
 * Compares production GPT-5.5 routing against the GPT-5.6 candidate profile
 * (terra for classify/analyze/investigate, sol for fix/review) using
 * historical fixture cases. This is an evaluation tool — not a test suite.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx ts-node scripts/replay-evaluate-models.ts
 *   OPENAI_API_KEY=... npx ts-node scripts/replay-evaluate-models.ts --cases path/to/cases.json
 *
 * Optional cases JSON shape:
 *   [{ "id": "...", "message": "...", "expectedVerdict": "TEST_ISSUE",
 *      "framework": "cypress", "testName": "...", "fileName": "..." }]
 *
 * Rollback after a canary:
 *   unset TRIAGE_MODEL_PROFILE / MODEL_OVERRIDE_*  (one-line)
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIClient } from '../src/openai-client';
import {
  AGENT_MODEL,
  GPT56_CANDIDATE_MODEL,
  GPT56_CANDIDATE_REASONING,
  REASONING_EFFORT,
  STAGE_MAX_OUTPUT_TOKENS,
  type ReasoningEffort,
} from '../src/config/constants';
import { CLASSIFICATION_SCHEMA } from '../src/openai/json-schemas';
import { CYPRESS_RAW_LOG, CYPRESS_EXPECTED } from '../__tests__/fixtures/cypress-logs';
import { WDIO_RAW_LOG } from '../__tests__/fixtures/wdio-logs';
import { ErrorData, Verdict } from '../src/types';

interface ReplayCase {
  id: string;
  message: string;
  expectedVerdict: Verdict;
  framework?: string;
  testName?: string;
  fileName?: string;
  logs?: string[];
}

interface StageRunResult {
  profile: 'gpt55-production' | 'gpt56-candidate';
  caseId: string;
  stage: 'classification';
  model: string;
  verdict?: string;
  matchedExpected: boolean;
  malformed: boolean;
  latencyMs: number;
  tokens?: number;
  error?: string;
}

function builtInCases(): ReplayCase[] {
  return [
    {
      id: 'cypress-selector-timeout',
      message:
        'Timed out retrying after 4000ms: Expected to find element: \'[data-testid="submit"]\', but never found it.',
      expectedVerdict: 'TEST_ISSUE',
      framework: CYPRESS_EXPECTED.framework,
      testName: CYPRESS_EXPECTED.testName,
      fileName: 'cypress/e2e/login.cy.js',
      logs: [CYPRESS_RAW_LOG],
    },
    {
      id: 'wdio-fixture-log',
      message: extractPrimaryLine(WDIO_RAW_LOG) || 'WDIO test failure',
      expectedVerdict: 'TEST_ISSUE',
      framework: 'webdriverio',
      testName: 'wdio fixture',
      fileName: 'test/specs/fixture.ts',
      logs: [WDIO_RAW_LOG],
    },
  ];
}

function extractPrimaryLine(log: string): string | undefined {
  const match = log.match(/Error:.*|Timed out.*|Expected.*/);
  return match?.[0]?.trim();
}

function loadCases(argv: string[]): ReplayCase[] {
  const idx = argv.indexOf('--cases');
  if (idx >= 0 && argv[idx + 1]) {
    const raw = fs.readFileSync(path.resolve(argv[idx + 1]), 'utf8');
    const parsed = JSON.parse(raw) as ReplayCase[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Cases file must be a non-empty JSON array');
    }
    return parsed;
  }
  return builtInCases();
}

async function runClassification(
  client: OpenAIClient,
  profile: StageRunResult['profile'],
  replayCase: ReplayCase
): Promise<StageRunResult> {
  const model =
    profile === 'gpt56-candidate'
      ? GPT56_CANDIDATE_MODEL.classification
      : AGENT_MODEL.classification;
  const reasoningEffort: ReasoningEffort =
    profile === 'gpt56-candidate'
      ? GPT56_CANDIDATE_REASONING.classification
      : REASONING_EFFORT.classification;

  const errorData: ErrorData = {
    message: replayCase.message,
    framework: (replayCase.framework as ErrorData['framework']) || 'unknown',
    testName: replayCase.testName,
    fileName: replayCase.fileName,
    logs: replayCase.logs,
  };

  const started = Date.now();
  try {
    const result = await client.analyze(errorData, [], undefined, {
      model,
      reasoningEffort,
    });
    return {
      profile,
      caseId: replayCase.id,
      stage: 'classification',
      model,
      verdict: result.verdict,
      matchedExpected: result.verdict === replayCase.expectedVerdict,
      malformed: false,
      latencyMs: Date.now() - started,
      tokens: result.tokensUsed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const malformed =
      /valid JSON|Incomplete|Empty response|json_schema|parse/i.test(message);
    return {
      profile,
      caseId: replayCase.id,
      stage: 'classification',
      model,
      matchedExpected: false,
      malformed,
      latencyMs: Date.now() - started,
      error: message,
    };
  }
}

function summarize(results: StageRunResult[]): void {
  const profiles: StageRunResult['profile'][] = [
    'gpt55-production',
    'gpt56-candidate',
  ];
  console.log('\n=== Replay evaluation summary ===');
  console.log(
    `Schemas: classification uses strict ${CLASSIFICATION_SCHEMA.name}; stage ceiling ${STAGE_MAX_OUTPUT_TOKENS.classification} tokens`
  );
  for (const profile of profiles) {
    const subset = results.filter((r) => r.profile === profile);
    if (subset.length === 0) continue;
    const matched = subset.filter((r) => r.matchedExpected).length;
    const malformed = subset.filter((r) => r.malformed).length;
    const avgLatency =
      subset.reduce((sum, r) => sum + r.latencyMs, 0) / subset.length;
    const tokens = subset
      .map((r) => r.tokens)
      .filter((t): t is number => typeof t === 'number');
    const avgTokens =
      tokens.length > 0
        ? tokens.reduce((a, b) => a + b, 0) / tokens.length
        : undefined;
    console.log(
      `\n${profile}: accuracy=${matched}/${subset.length} ` +
        `malformed=${malformed} avgLatencyMs=${avgLatency.toFixed(0)}` +
        (avgTokens !== undefined ? ` avgTokens=${avgTokens.toFixed(0)}` : '')
    );
    for (const row of subset) {
      console.log(
        `  - ${row.caseId}: verdict=${row.verdict || 'ERR'} ` +
          `match=${row.matchedExpected ? 'Y' : 'N'} ` +
          `malformed=${row.malformed ? 'Y' : 'N'} ` +
          `${row.latencyMs}ms` +
          (row.error ? ` error=${row.error.slice(0, 120)}` : '')
      );
    }
  }

  console.log('\nCanary activation (measured config only):');
  console.log('  TRIAGE_MODEL_PROFILE=gpt56-candidate');
  console.log('  # or set MODEL_OVERRIDE_FIX_GEN / MODEL_OVERRIDE_REVIEW');
  console.log('Rollback: unset TRIAGE_MODEL_PROFILE and MODEL_OVERRIDE_*');
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required');
    process.exit(1);
  }

  const cases = loadCases(process.argv.slice(2));
  const client = new OpenAIClient(process.env.OPENAI_API_KEY);
  const results: StageRunResult[] = [];

  console.log(`Replaying ${cases.length} case(s) against GPT-5.5 and GPT-5.6 candidate routing...`);
  for (const replayCase of cases) {
    for (const profile of ['gpt55-production', 'gpt56-candidate'] as const) {
      console.log(`→ ${profile} / ${replayCase.id}`);
      results.push(await runClassification(client, profile, replayCase));
    }
  }

  summarize(results);

  const outPath = path.resolve('replay-evaluation-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
