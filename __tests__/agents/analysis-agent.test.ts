import {
  AnalysisAgent,
  AnalysisOutput,
  RootCauseCategory,
} from '../../src/agents/analysis-agent';
import { createAgentContext } from '../../src/agents/base-agent';
import { OpenAIClient } from '../../src/openai-client';

// Mock OpenAIClient
jest.mock('../../src/openai-client');

describe('AnalysisAgent', () => {
  let mockOpenAIClient: jest.Mocked<OpenAIClient>;
  let agent: AnalysisAgent;

  beforeEach(() => {
    mockOpenAIClient = new OpenAIClient(
      'test-key'
    ) as jest.Mocked<OpenAIClient>;
    agent = new AnalysisAgent(mockOpenAIClient);
  });

  describe('execute', () => {
    it('should successfully analyze an error and return analysis output', async () => {
      const mockResponse: AnalysisOutput = {
        rootCauseCategory: 'SELECTOR_MISMATCH',
        contributingFactors: ['TIMING_ISSUE'],
        confidence: 85,
        explanation: 'The selector changed due to a UI update',
        selectors: ['[data-testid="submit"]', '.btn-primary'],
        elements: ['submit button'],
        issueLocation: 'TEST_CODE',
        patterns: {
          hasTimeout: false,
          hasVisibilityIssue: false,
          hasNetworkCall: false,
          hasStateAssertion: false,
          hasDynamicContent: false,
          hasResponsiveIssue: false,
        },
        suggestedApproach: 'Update the selector to match the new UI',
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage:
          'Timed out retrying: Expected to find element: [data-testid="submit"]',
        testFile: 'cypress/e2e/login.cy.ts',
        testName: 'should submit login form',
        errorType: 'ELEMENT_NOT_FOUND',
        errorSelector: '[data-testid="submit"]',
      });

      const result = await agent.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data?.rootCauseCategory).toBe('SELECTOR_MISMATCH');
      expect(result.data?.confidence).toBe(85);
      expect(result.data?.selectors).toContain('[data-testid="submit"]');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.apiCalls).toBeGreaterThanOrEqual(0);
    });

    it('should handle timeout errors correctly', async () => {
      const mockResponse: AnalysisOutput = {
        rootCauseCategory: 'TIMING_ISSUE',
        contributingFactors: [],
        confidence: 90,
        explanation: 'The element takes too long to appear',
        selectors: ['.loading-spinner'],
        elements: ['loading spinner'],
        issueLocation: 'TEST_CODE',
        patterns: {
          hasTimeout: true,
          hasVisibilityIssue: false,
          hasNetworkCall: true,
          hasStateAssertion: false,
          hasDynamicContent: true,
          hasResponsiveIssue: false,
        },
        suggestedApproach: 'Add explicit wait for the element',
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Timed out after 10000ms waiting for element',
        testFile: 'test.cy.ts',
        testName: 'test',
        errorType: 'TIMEOUT',
      });

      const result = await agent.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data?.rootCauseCategory).toBe('TIMING_ISSUE');
      expect(result.data?.patterns.hasTimeout).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockRejectedValue(new Error('API error'));

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await agent.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });

    it('should handle malformed JSON response', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue('This is not valid JSON');

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await agent.execute({}, context);

      expect(result.success).toBe(false);
    });

    it('should handle response with missing required fields', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify({ someOtherField: 'value' }));

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await agent.execute({}, context);

      expect(result.success).toBe(false);
    });

    it('should include screenshots in the prompt when available', async () => {
      const mockResponse: AnalysisOutput = {
        rootCauseCategory: 'ELEMENT_VISIBILITY',
        contributingFactors: [],
        confidence: 80,
        explanation: 'Element is hidden behind overlay',
        selectors: [],
        elements: [],
        issueLocation: 'TEST_CODE',
        patterns: {
          hasTimeout: false,
          hasVisibilityIssue: true,
          hasNetworkCall: false,
          hasStateAssertion: false,
          hasDynamicContent: false,
          hasResponsiveIssue: false,
        },
        suggestedApproach: 'Wait for overlay to close',
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Element is not visible',
        testFile: 'test.ts',
        testName: 'test',
        screenshots: [{ name: 'failure.png', base64Data: 'base64data' }],
      });

      const result = await agent.execute({}, context);

      expect(result.success).toBe(true);
      expect(mockOpenAIClient.generateWithCustomPrompt).toHaveBeenCalled();
    });
  });

  describe('RootCauseCategory types', () => {
    it('should have all expected categories', () => {
      const categories: RootCauseCategory[] = [
        'SELECTOR_MISMATCH',
        'TIMING_ISSUE',
        'STATE_DEPENDENCY',
        'NETWORK_ISSUE',
        'ELEMENT_VISIBILITY',
        'ASSERTION_MISMATCH',
        'DATA_DEPENDENCY',
        'ENVIRONMENT_ISSUE',
        'UNKNOWN',
      ];

      categories.forEach((category) => {
        expect(typeof category).toBe('string');
      });
    });
  });
});
