import * as core from '@actions/core';
import { SimplifiedRepairAgent } from '../../src/repair/simplified-repair-agent';
import { OpenAIClient } from '../../src/openai-client';
import { RepairContext } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

describe('SimplifiedRepairAgent agentic-only contract', () => {
  const repairContext: RepairContext = {
    testFile: 'cypress/e2e/login.cy.ts',
    testName: 'should log in',
    errorType: 'ELEMENT_NOT_FOUND',
    errorMessage: 'Expected to find element',
    workflowRunId: '123',
    jobName: 'e2e',
    commitSha: 'abc123',
    branch: 'main',
    repository: 'adept-at/lib-cypress-canary',
  };

  it('returns no fix and repairTelemetry when source-fetch context is missing (no fallback LLM)', async () => {
    const openaiClient = {
      generateWithCustomPrompt: jest.fn(),
    } as unknown as OpenAIClient;

    const agent = new SimplifiedRepairAgent(openaiClient);
    const result = await agent.generateFixRecommendation(repairContext);

    expect(result?.fix).toBeNull();
    expect(result?.repairTelemetry?.status).toBe('no_fix_generated');
    expect(openaiClient.generateWithCustomPrompt).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(
      'Agentic repair is unavailable because source-fetch context is missing; no fallback repair path will run.'
    );
  });
});
