import { SimplifiedRepairAgent } from '../src/repair/simplified-repair-agent';
import { RepairContext } from '../src/types';
import { OpenAIClient } from '../src/openai-client';

// Mock OpenAIClient
jest.mock('../src/openai-client');

describe('SimplifiedRepairAgent', () => {
  let agent: SimplifiedRepairAgent;
  let mockAnalyze: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyze = jest.fn();
    (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(() => ({
      analyze: mockAnalyze,
    } as any));
    
    agent = new SimplifiedRepairAgent('test-api-key');
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
      mockAnalyze.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: JSON.stringify({
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
        }),
        indicators: []
      });

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(85);
      expect(result?.proposedChanges).toHaveLength(1);
      expect(result?.evidence).toContain('Button selector changed in recent commit');
      expect(result?.summary).toContain('Fix Recommendation');
    });

    it('should return null for low confidence response', async () => {
      mockAnalyze.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: JSON.stringify({
          confidence: 30,
          reasoning: 'Not enough information',
          changes: [],
          evidence: [],
          rootCause: 'Unknown'
        }),
        indicators: []
      });

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should handle non-JSON response gracefully', async () => {
      mockAnalyze.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: 'This is a plain text response suggesting to update the selector',
        indicators: ['Selector not found', 'Element missing']
      });

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

      mockAnalyze.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: 'Element is loading slowly',
        indicators: ['Timeout error']
      });

      const result = await agent.generateFixRecommendation(timeoutContext);

      expect(result).not.toBeNull();
      expect(result?.proposedChanges[0]?.newCode).toContain('wait');
    });

    it('should handle API errors gracefully', async () => {
      mockAnalyze.mockRejectedValue(new Error('API error'));

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should include selector in summary when available', async () => {
      mockAnalyze.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: JSON.stringify({
          confidence: 75,
          reasoning: 'Fix needed',
          changes: [],
          evidence: [],
          rootCause: 'Selector issue'
        }),
        indicators: []
      });

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result?.summary).toContain('[data-testid="submit-btn"]');
    });
  });
});
