import { SimplifiedRepairAgent } from '../src/repair/simplified-repair-agent';
import { RepairContext } from '../src/types';
import { OpenAIClient } from '../src/openai-client';
import { Octokit } from '@octokit/rest';

// Mock OpenAIClient
jest.mock('../src/openai-client');

describe('SimplifiedRepairAgent', () => {
  let agent: SimplifiedRepairAgent;
  let mockAnalyze: jest.Mock;
  let mockGenerateWithCustomPrompt: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyze = jest.fn();
    mockGenerateWithCustomPrompt = jest.fn();
    (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(() => ({
      analyze: mockAnalyze,
      generateWithCustomPrompt: mockGenerateWithCustomPrompt,
    } as any));

    agent = new SimplifiedRepairAgent('test-api-key');
  });

  describe('hallucination filtering', () => {
    const baseContext: RepairContext = {
      testFile: 'cypress/e2e/test.cy.ts',
      testName: 'should click button',
      errorType: 'ELEMENT_NOT_FOUND',
      errorMessage: "Expected to find element: '[data-testid=\"submit-btn\"]', but never found it",
      errorSelector: '[data-testid="submit-btn"]',
      errorLine: 42,
      workflowRunId: '123456',
      jobName: 'test-job',
      commitSha: 'abc123',
      branch: 'main',
      repository: 'test/repo',
    };

    const sourceFileContent = `describe('test', () => {
  it('should click button', () => {
    cy.get('[data-testid="submit-btn"]').click();
    cy.get('[data-testid="result"]').should('be.visible');
  });
});`;

    it('should reject recommendation when all changes have hallucinated oldCode', async () => {
      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Update selector',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: 'cy.get(".nonexistent-selector").click()',
              newCode: 'cy.get("[data-testid=\\"new-btn\\"]").click()',
              justification: 'Selector changed',
            },
          ],
          evidence: ['Selector mismatch'],
          rootCause: 'Selector changed',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: {
              type: 'file',
              content: Buffer.from(sourceFileContent).toString('base64'),
              sha: 'file-sha',
            },
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () =>
          ({
            analyze: mockAnalyze,
            generateWithCustomPrompt: mockGenerateWithCustomPrompt,
          }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      // All changes had hallucinated oldCode, so recommendation should be null
      expect(result).toBeNull();
    });

    it('should keep valid changes and discard hallucinated ones', async () => {
      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Update selectors',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: 'cy.get(\'[data-testid="submit-btn"]\').click();',
              newCode: 'cy.get(\'[data-testid="new-btn"]\').click();',
              justification: 'Valid fix — oldCode exists in source',
            },
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 5,
              oldCode: 'cy.get(".hallucinated").should("exist")',
              newCode: 'cy.get(".fixed").should("exist")',
              justification: 'Hallucinated — oldCode not in source',
            },
          ],
          evidence: ['Selector mismatch'],
          rootCause: 'Selector changed',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: {
              type: 'file',
              content: Buffer.from(sourceFileContent).toString('base64'),
              sha: 'file-sha',
            },
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () =>
          ({
            analyze: mockAnalyze,
            generateWithCustomPrompt: mockGenerateWithCustomPrompt,
          }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      // Should keep only the valid change
      expect(result).not.toBeNull();
      expect(result?.proposedChanges).toHaveLength(1);
      expect(result?.proposedChanges[0].oldCode).toContain('submit-btn');
    });
  });

  describe('generateFixRecommendation', () => {
    const baseContext: RepairContext = {
      testFile: 'cypress/e2e/test.cy.ts',
      testName: 'should click button',
      errorType: 'ELEMENT_NOT_FOUND',
      errorMessage: "Expected to find element: '[data-testid=\"submit-btn\"]', but never found it",
      errorSelector: '[data-testid="submit-btn"]',
      errorLine: 42,
      workflowRunId: '123456',
      jobName: 'test-job',
      commitSha: 'abc123',
      branch: 'main',
      repository: 'test/repo'
    };

    it('should generate fix recommendation for high confidence response', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Selector has changed in the application',
          changes: [{
            file: 'cypress/e2e/test.cy.ts',
            line: 42,
            oldCode: 'cy.get(\'[data-testid="submit-btn"]\')',
            newCode: 'cy.get(\'[data-testid="submit-button"]\')',
            justification: 'Update selector to match new application'
          }],
          evidence: ['Button selector changed in recent commit'],
          rootCause: 'Selector mismatch'
        })
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(85);
      expect(result?.proposedChanges).toHaveLength(1);
      expect(result?.evidence).toContain('Button selector changed in recent commit');
      expect(result?.summary).toContain('Fix Recommendation');
    });

    it('should return null for low confidence response', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        JSON.stringify({
          confidence: 30,
          reasoning: 'Not enough information',
          changes: [],
          evidence: [],
          rootCause: 'Unknown'
        })
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should handle non-JSON response gracefully', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        'This is a plain text response suggesting to update the selector'
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(60); // Default confidence
      expect(result?.reasoning).toContain('update the selector');
      expect(result?.proposedChanges).toHaveLength(1); // Should extract basic change
    });

    it('should generate appropriate fix for TIMEOUT errors', async () => {
      const timeoutContext: RepairContext = {
        ...baseContext,
        errorType: 'TIMEOUT',
        errorMessage: 'Timed out waiting for element',
        errorSelector: undefined
      };

      mockGenerateWithCustomPrompt.mockResolvedValue(
        'Element is loading slowly, suggest adding wait'
      );

      const result = await agent.generateFixRecommendation(timeoutContext);

      expect(result).not.toBeNull();
      expect(result?.proposedChanges[0]?.newCode).toContain('wait');
    });

    it('should handle API errors gracefully', async () => {
      mockGenerateWithCustomPrompt.mockRejectedValue(new Error('API error'));

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should include selector in summary when available', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        JSON.stringify({
          confidence: 75,
          reasoning: 'Fix needed',
          changes: [],
          evidence: [],
          rootCause: 'Selector issue'
        })
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result?.summary).toContain('[data-testid="submit-btn"]');
    });
  });
});
