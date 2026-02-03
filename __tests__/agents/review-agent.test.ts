import {
  ReviewAgent,
  ReviewOutput,
  ReviewIssue,
} from '../../src/agents/review-agent';
import { createAgentContext } from '../../src/agents/base-agent';
import { AnalysisOutput } from '../../src/agents/analysis-agent';
import { FixGenerationOutput } from '../../src/agents/fix-generation-agent';
import { OpenAIClient } from '../../src/openai-client';

// Mock OpenAIClient
jest.mock('../../src/openai-client');

describe('ReviewAgent', () => {
  let mockOpenAIClient: jest.Mocked<OpenAIClient>;
  let agent: ReviewAgent;

  const mockAnalysis: AnalysisOutput = {
    rootCauseCategory: 'SELECTOR_MISMATCH',
    contributingFactors: [],
    confidence: 85,
    explanation: 'Selector changed',
    selectors: ['[data-testid="submit"]'],
    elements: [],
    issueLocation: 'TEST_CODE',
    patterns: {
      hasTimeout: false,
      hasVisibilityIssue: false,
      hasNetworkCall: false,
      hasStateAssertion: false,
      hasDynamicContent: false,
      hasResponsiveIssue: false,
    },
    suggestedApproach: 'Update selector',
  };

  const mockProposedFix: FixGenerationOutput = {
    changes: [
      {
        file: 'test.cy.ts',
        line: 10,
        oldCode: 'cy.get(\'[data-testid="submit"]\')',
        newCode: 'cy.get(\'[data-testid="submit-button"]\')',
        justification: 'Update selector',
        changeType: 'SELECTOR_UPDATE',
      },
    ],
    confidence: 85,
    summary: 'Update submit selector',
    reasoning: 'Selector was renamed',
    evidence: [],
    risks: [],
  };

  beforeEach(() => {
    mockOpenAIClient = new OpenAIClient(
      'test-key'
    ) as jest.Mocked<OpenAIClient>;
    agent = new ReviewAgent(mockOpenAIClient);
  });

  describe('execute', () => {
    it('should approve a valid fix', async () => {
      const mockResponse: ReviewOutput = {
        approved: true,
        issues: [],
        assessment: 'The fix correctly addresses the root cause',
        fixConfidence: 90,
        improvements: [
          'Consider adding a comment explaining the selector change',
        ],
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Element not found',
        testFile: 'test.cy.ts',
        testName: 'test',
        sourceFileContent: 'cy.get(\'[data-testid="submit"]\').click()',
      });

      const result = await agent.execute(
        {
          proposedFix: mockProposedFix,
          analysis: mockAnalysis,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.approved).toBe(true);
      expect(result.data?.issues).toHaveLength(0);
      expect(result.data?.fixConfidence).toBe(90);
    });

    it('should reject fix with critical issues', async () => {
      const mockResponse: ReviewOutput = {
        approved: false,
        issues: [
          {
            severity: 'CRITICAL',
            changeIndex: 0,
            description: 'oldCode does not match file content',
            suggestion: 'Verify the exact code to replace',
          },
        ],
        assessment: 'The old code does not exist in the file',
        fixConfidence: 20,
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
        sourceFileContent: 'cy.get(".different-selector")',
      });

      const result = await agent.execute(
        {
          proposedFix: mockProposedFix,
          analysis: mockAnalysis,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.approved).toBe(false);
      expect(result.data?.issues).toHaveLength(1);
      expect(result.data?.issues[0].severity).toBe('CRITICAL');
    });

    it('should auto-reject when critical issues are found', async () => {
      // Even if the response says approved: true but has CRITICAL issues,
      // the agent should override and reject
      const mockResponse: ReviewOutput = {
        approved: true, // This should be overridden
        issues: [
          {
            severity: 'CRITICAL',
            changeIndex: 0,
            description: 'Syntax error in newCode',
            suggestion: 'Fix the syntax',
          },
        ],
        assessment: 'Fix has issues',
        fixConfidence: 50,
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        {
          proposedFix: mockProposedFix,
          analysis: mockAnalysis,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.approved).toBe(false); // Should be false due to CRITICAL issue
    });

    it('should approve with warnings', async () => {
      const mockResponse: ReviewOutput = {
        approved: true,
        issues: [
          {
            severity: 'WARNING',
            changeIndex: 0,
            description: 'Consider using a more specific selector',
            suggestion: 'Use data-testid instead of class',
          },
        ],
        assessment: 'Fix is acceptable but could be improved',
        fixConfidence: 75,
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        {
          proposedFix: mockProposedFix,
          analysis: mockAnalysis,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.approved).toBe(true);
      expect(result.data?.issues).toHaveLength(1);
      expect(result.data?.issues[0].severity).toBe('WARNING');
    });

    it('should handle API errors', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockRejectedValue(new Error('API error'));

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        {
          proposedFix: mockProposedFix,
          analysis: mockAnalysis,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });
  });

  describe('validateOldCodeExists', () => {
    it('should return no issues when oldCode exists in file', () => {
      const changes = [
        {
          file: 'test.cy.ts',
          line: 10,
          oldCode: 'cy.get(".btn")',
          newCode: 'cy.get("[data-testid=\\"btn\\"]")',
          justification: 'Test',
          changeType: 'SELECTOR_UPDATE' as const,
        },
      ];
      const fileContent = 'describe("test", () => { cy.get(".btn").click() })';

      const issues = agent.validateOldCodeExists(changes, fileContent);

      expect(issues).toHaveLength(0);
    });

    it('should return CRITICAL issue when oldCode not found', () => {
      const changes = [
        {
          file: 'test.cy.ts',
          line: 10,
          oldCode: 'cy.get(".nonexistent")',
          newCode: 'cy.get(".new")',
          justification: 'Test',
          changeType: 'SELECTOR_UPDATE' as const,
        },
      ];
      const fileContent = 'describe("test", () => { cy.get(".btn").click() })';

      const issues = agent.validateOldCodeExists(changes, fileContent);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('CRITICAL');
      expect(issues[0].changeIndex).toBe(0);
    });

    it('should check all changes', () => {
      const changes = [
        {
          file: 'test.cy.ts',
          line: 10,
          oldCode: 'cy.get(".btn")', // exists
          newCode: 'cy.get(".new-btn")',
          justification: 'Test',
          changeType: 'SELECTOR_UPDATE' as const,
        },
        {
          file: 'test.cy.ts',
          line: 20,
          oldCode: 'cy.wait(1000)', // does not exist
          newCode: 'cy.wait(2000)',
          justification: 'Test',
          changeType: 'WAIT_ADDITION' as const,
        },
      ];
      const fileContent = 'describe("test", () => { cy.get(".btn").click() })';

      const issues = agent.validateOldCodeExists(changes, fileContent);

      expect(issues).toHaveLength(1);
      expect(issues[0].changeIndex).toBe(1);
    });
  });

  describe('ReviewIssue interface', () => {
    it('should support all severity levels', () => {
      const severities: ReviewIssue['severity'][] = [
        'CRITICAL',
        'WARNING',
        'SUGGESTION',
      ];

      severities.forEach((severity) => {
        const issue: ReviewIssue = {
          severity,
          changeIndex: 0,
          description: 'Test issue',
        };
        expect(issue.severity).toBe(severity);
      });
    });

    it('should support optional suggestion', () => {
      const issueWithSuggestion: ReviewIssue = {
        severity: 'WARNING',
        changeIndex: 0,
        description: 'Issue',
        suggestion: 'How to fix',
      };

      const issueWithoutSuggestion: ReviewIssue = {
        severity: 'WARNING',
        changeIndex: 0,
        description: 'Issue',
      };

      expect(issueWithSuggestion.suggestion).toBe('How to fix');
      expect(issueWithoutSuggestion.suggestion).toBeUndefined();
    });
  });
});
