/**
 * Full pipeline integration test for WDIO (single-shot path).
 * Proves: log ingestion -> error extraction -> analysis -> fix recommendation
 * with WDIO-appropriate syntax (browser.$, waitForDisplayed).
 * Includes cross-contamination check: fix must NOT contain Cypress syntax.
 *
 * Run: npm run test:integration -- --testPathPattern=wdio-full-pipeline
 */

import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../../src/openai-client';
import {
  createMockOctokit,
  createMockArtifactFetcher,
  runPipeline,
} from '../helpers/pipeline-harness';
import { WDIO_RAW_LOG, WDIO_EXPECTED } from '../fixtures/wdio-logs';
import {
  ANALYSIS_TEST_ISSUE,
  FIX_RECOMMENDATION_WDIO_STRING,
  AGENTIC_ANALYSIS_STRING,
  AGENTIC_INVESTIGATION_STRING,
  AGENTIC_FIX_WDIO_STRING,
  AGENTIC_REVIEW_APPROVED_STRING,
} from '../fixtures/mock-responses';
import type { ArtifactFetcher } from '../../src/artifact-fetcher';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

jest.mock('@actions/github', () => ({
  context: {
    runId: 21914697303,
    job: 'sauceTest',
    sha: 'abc123def',
    ref: 'refs/heads/main',
    repo: { owner: 'adept-at', repo: 'lib-wdio-8-multi-remote' },
    payload: {},
  },
}));

describe('WDIO full pipeline (single-shot)', () => {
  const runId = '21914697303';
  const jobName = 'sauceTest';
  const repoDetails = { owner: 'adept-at', repo: 'lib-wdio-8-multi-remote' };

  it('should extract WDIO error and produce WDIO-appropriate fix (no Cypress contamination)', async () => {
    const octokit = createMockOctokit(WDIO_RAW_LOG, jobName, runId) as Octokit;
    const artifactFetcher = createMockArtifactFetcher({
      screenshots: [],
      artifactLogs: '',
    }) as ArtifactFetcher;

    const mockAnalyze = jest.fn().mockResolvedValue(ANALYSIS_TEST_ISSUE);
    const mockGenerateWithCustomPrompt = jest
      .fn()
      .mockResolvedValue(FIX_RECOMMENDATION_WDIO_STRING);
    const openaiClient = {
      analyze: mockAnalyze,
      generateWithCustomPrompt: mockGenerateWithCustomPrompt,
    } as unknown as OpenAIClient;

    const result = await runPipeline(
      octokit,
      artifactFetcher,
      openaiClient,
      {
        rawLogText: WDIO_RAW_LOG,
        jobName,
        runId,
        repoDetails,
        inputs: { testFrameworks: 'webdriverio' },
      }
    );

    expect(result.errorData).not.toBeNull();
    expect(result.errorData?.framework).toBe(WDIO_EXPECTED.framework);
    expect(result.errorData?.failureType).toBe(WDIO_EXPECTED.failureType);
    expect(result.errorData?.testName).toContain('Editors can take skill lock');
    expect(result.errorData?.fileName).toContain('multi.skill.lock.editor');
    expect(result.errorData?.message).toContain(WDIO_EXPECTED.messageSubstring);

    expect(result.analysisResult).not.toBeNull();
    expect(result.analysisResult?.verdict).toBe('TEST_ISSUE');

    expect(result.fixRecommendation).not.toBeNull();
    const changes = result.fixRecommendation!.proposedChanges;
    expect(changes.length).toBeGreaterThan(0);
    const allNewCode = changes.map((c) => c.newCode).join(' ');
    expect(allNewCode).toMatch(/\bbrowser\.\$|waitForDisplayed/);
    expect(allNewCode).not.toMatch(/\bcy\.get\b|\bcy\.contains\b/);
  });
});

describe('WDIO full pipeline (agentic)', () => {
  const runId = '21914697303';
  const jobName = 'sauceTest';
  const repoDetails = { owner: 'adept-at', repo: 'lib-wdio-8-multi-remote' };
  const agenticTestFileContent = `
describe('Editors can take skill lock', () => {
  it('should allow taking lock', async () => {
    const el = browser.$(".skill-panel");
    await el.click();
  });
});
`;

  it('should produce WDIO-appropriate fix via agentic path (no Cypress contamination)', async () => {
    const octokit = createMockOctokit(WDIO_RAW_LOG, jobName, runId, {
      fileContent: agenticTestFileContent,
    }) as Octokit;
    const artifactFetcher = createMockArtifactFetcher({
      screenshots: [],
      artifactLogs: '',
    }) as ArtifactFetcher;

    const mockAnalyze = jest.fn().mockResolvedValue(ANALYSIS_TEST_ISSUE);
    let callCount = 0;
    const mockGenerateWithCustomPrompt = jest.fn().mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1:
          return Promise.resolve(AGENTIC_ANALYSIS_STRING);
        case 2:
          return Promise.resolve(AGENTIC_INVESTIGATION_STRING);
        case 3:
          return Promise.resolve(AGENTIC_FIX_WDIO_STRING);
        case 4:
          return Promise.resolve(AGENTIC_REVIEW_APPROVED_STRING);
        default:
          return Promise.resolve(AGENTIC_REVIEW_APPROVED_STRING);
      }
    });
    const openaiClient = {
      analyze: mockAnalyze,
      generateWithCustomPrompt: mockGenerateWithCustomPrompt,
    } as unknown as OpenAIClient;

    const result = await runPipeline(
      octokit,
      artifactFetcher,
      openaiClient,
      {
        rawLogText: WDIO_RAW_LOG,
        jobName,
        runId,
        repoDetails,
        inputs: { testFrameworks: 'webdriverio', enableAgenticRepair: true },
      }
    );

    expect(result.errorData).not.toBeNull();
    expect(result.analysisResult?.verdict).toBe('TEST_ISSUE');
    expect(result.fixRecommendation).not.toBeNull();
    const changes = result.fixRecommendation!.proposedChanges;
    expect(changes.length).toBeGreaterThan(0);
    const allNewCode = changes.map((c) => c.newCode).join(' ');
    expect(allNewCode).toMatch(/\bbrowser\.\$|waitForDisplayed/);
    expect(allNewCode).not.toMatch(/\bcy\.get\b|\bcy\.contains\b/);
  });
});
