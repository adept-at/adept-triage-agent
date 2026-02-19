/**
 * Full pipeline integration test for Cypress (single-shot path).
 * Proves: log ingestion -> error extraction -> analysis -> fix recommendation
 * with Cypress-appropriate syntax (cy.get, cy.contains).
 *
 * Run: npm run test:integration -- --testPathPattern=cypress-full-pipeline
 */

import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../../src/openai-client';
import {
  createMockOctokit,
  createMockArtifactFetcher,
  runPipeline,
} from '../helpers/pipeline-harness';
import { CYPRESS_RAW_LOG, CYPRESS_EXPECTED } from '../fixtures/cypress-logs';
import {
  ANALYSIS_TEST_ISSUE,
  FIX_RECOMMENDATION_CYPRESS_STRING,
  AGENTIC_ANALYSIS_STRING,
  AGENTIC_INVESTIGATION_STRING,
  AGENTIC_FIX_CYPRESS_STRING,
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
    runId: 21640226152,
    job: 'previewUrlTest',
    sha: 'abc123def',
    ref: 'refs/heads/main',
    repo: { owner: 'adept-at', repo: 'lib-cypress-canary' },
    payload: {},
  },
}));

describe('Cypress full pipeline (single-shot)', () => {
  const runId = '21640226152';
  const jobName = 'previewUrlTest';
  const repoDetails = { owner: 'adept-at', repo: 'lib-cypress-canary' };

  it('should extract Cypress error and produce Cypress-appropriate fix', async () => {
    const octokit = createMockOctokit(CYPRESS_RAW_LOG, jobName, runId) as Octokit;
    const artifactFetcher = createMockArtifactFetcher({
      screenshots: [],
      artifactLogs: '',
    }) as ArtifactFetcher;

    const mockAnalyze = jest.fn().mockResolvedValue(ANALYSIS_TEST_ISSUE);
    const mockGenerateWithCustomPrompt = jest
      .fn()
      .mockResolvedValue(FIX_RECOMMENDATION_CYPRESS_STRING);
    const openaiClient = {
      analyze: mockAnalyze,
      generateWithCustomPrompt: mockGenerateWithCustomPrompt,
    } as unknown as OpenAIClient;

    const result = await runPipeline(
      octokit,
      artifactFetcher,
      openaiClient,
      {
        rawLogText: CYPRESS_RAW_LOG,
        jobName,
        runId,
        repoDetails,
        inputs: { testFrameworks: 'cypress' },
      }
    );

    expect(result.errorData).not.toBeNull();
    expect(result.errorData?.framework).toBe(CYPRESS_EXPECTED.framework);
    expect(result.errorData?.failureType).toBe(CYPRESS_EXPECTED.failureType);
    expect(result.errorData?.testName).toBe(CYPRESS_EXPECTED.testName);
    expect(result.errorData?.fileName).toContain('login.cy');
    expect(result.errorData?.message).toContain(CYPRESS_EXPECTED.messageSubstring);

    expect(result.analysisResult).not.toBeNull();
    expect(result.analysisResult?.verdict).toBe('TEST_ISSUE');

    expect(result.fixRecommendation).not.toBeNull();
    expect(result.fixRecommendation?.confidence).toBeGreaterThanOrEqual(70);
    const changes = result.fixRecommendation!.proposedChanges;
    expect(changes.length).toBeGreaterThan(0);
    const allNewCode = changes.map((c) => c.newCode).join(' ');
    expect(allNewCode).toMatch(/cy\.get|cy\.contains/);
    expect(allNewCode).not.toMatch(/\bbrowser\.\$/);
  });
});

describe('Cypress full pipeline (agentic)', () => {
  const runId = '21640226152';
  const jobName = 'previewUrlTest';
  const repoDetails = { owner: 'adept-at', repo: 'lib-cypress-canary' };
  const agenticTestFileContent = `
describe('Login flow', () => {
  it('Login flow', () => {
    cy.get('[data-testid="submit"]').click();
  });
});
`;

  it('should produce Cypress-appropriate fix via agentic path', async () => {
    const octokit = createMockOctokit(CYPRESS_RAW_LOG, jobName, runId, {
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
          return Promise.resolve(AGENTIC_FIX_CYPRESS_STRING);
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
        rawLogText: CYPRESS_RAW_LOG,
        jobName,
        runId,
        repoDetails,
        inputs: { testFrameworks: 'cypress', enableAgenticRepair: true },
      }
    );

    expect(result.errorData).not.toBeNull();
    expect(result.analysisResult?.verdict).toBe('TEST_ISSUE');
    expect(result.fixRecommendation).not.toBeNull();
    const changes = result.fixRecommendation!.proposedChanges;
    expect(changes.length).toBeGreaterThan(0);
    const allNewCode = changes.map((c) => c.newCode).join(' ');
    expect(allNewCode).toMatch(/cy\.get|cy\.contains/);
    expect(allNewCode).not.toMatch(/\bbrowser\.\$/);
  });
});
