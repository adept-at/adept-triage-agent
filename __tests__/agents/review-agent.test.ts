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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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

  describe('product diff in prompt', () => {
    it('should include product diff as mandatory review when productDiff is provided', async () => {
      const mockResponse: ReviewOutput = {
        approved: true,
        issues: [],
        assessment: 'Fix correctly adapts to product change',
        fixConfidence: 95,
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

      const context = createAgentContext({
        errorMessage: 'Element not found',
        testFile: 'test.cy.ts',
        testName: 'test',
        productDiff: {
          files: [
            {
              filename: 'src/Player.tsx',
              patch: '-className="old"\n+className="new"',
              status: 'modified',
            },
          ],
        },
      });

      const result = await agent.execute(
        { proposedFix: mockProposedFix, analysis: mockAnalysis },
        context
      );

      expect(result.success).toBe(true);
      const promptCall = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(promptCall.userContent)
        ? promptCall.userContent.map((c: any) => c.text || '').join('\n')
        : promptCall.userContent;
      expect(userContent).toContain('Product Repo Changes (MANDATORY review)');
      expect(userContent).toContain('Player.tsx');
    });

    it('should not include product diff section when productDiff is absent', async () => {
      const mockResponse: ReviewOutput = {
        approved: true,
        issues: [],
        assessment: 'Looks good',
        fixConfidence: 85,
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      await agent.execute(
        { proposedFix: mockProposedFix, analysis: mockAnalysis },
        context
      );

      const promptCall = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(promptCall.userContent)
        ? promptCall.userContent.map((c: any) => c.text || '').join('\n')
        : promptCall.userContent;
      expect(userContent).not.toContain('Product Repo Changes (MANDATORY review)');
    });
  });

  describe('failureModeTrace surfacing and rules', () => {
    const passingReview: ReviewOutput = {
      approved: true,
      issues: [],
      assessment: 'ok',
      fixConfidence: 90,
    };

    it('renders the causal trace in the user prompt when the fix includes one', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(passingReview), responseId: 'r' });

      const fixWithTrace: FixGenerationOutput = {
        ...mockProposedFix,
        failureModeTrace: {
          originalState: 'currentTime=6.02s, pausedTime=0.0s',
          rootMechanism: 'pausedTime captured before player actually paused',
          newStateAfterFix: 'capture happens after player.paused === true',
          whyAssertionPassesNow: 'drift now measured from the true pause',
        },
      };

      const context = createAgentContext({
        errorMessage: 'err',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      await agent.execute(
        { proposedFix: fixWithTrace, analysis: mockAnalysis },
        context
      );

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(call.userContent)
        ? call.userContent.map((c: any) => c.text || '').join('\n')
        : call.userContent;
      expect(userContent).toContain('Failure Mode Trace (MUST audit for quality)');
      expect(userContent).toContain('currentTime=6.02s');
      expect(userContent).toContain('pausedTime captured before player actually paused');
    });

    it('renders MISSING banner in the user prompt when no trace is provided', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(passingReview), responseId: 'r' });

      const context = createAgentContext({
        errorMessage: 'err',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      await agent.execute(
        { proposedFix: mockProposedFix, analysis: mockAnalysis },
        context
      );

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(call.userContent)
        ? call.userContent.map((c: any) => c.text || '').join('\n')
        : call.userContent;
      expect(userContent).toContain('### Failure Mode Trace');
      expect(userContent).toContain('MISSING');
      expect(userContent).toContain('flag this as CRITICAL');
    });

    it('renders EMPTY markers for individual missing sub-fields so the reviewer can target them', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(passingReview), responseId: 'r' });

      const fixWithPartialTrace: FixGenerationOutput = {
        ...mockProposedFix,
        failureModeTrace: {
          originalState: 'something concrete',
          rootMechanism: '',
          newStateAfterFix: '',
          whyAssertionPassesNow: '',
        },
      };

      const context = createAgentContext({
        errorMessage: 'err',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      await agent.execute(
        { proposedFix: fixWithPartialTrace, analysis: mockAnalysis },
        context
      );

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(call.userContent)
        ? call.userContent.map((c: any) => c.text || '').join('\n')
        : call.userContent;
      expect(userContent).toContain('originalState:** something concrete');
      expect(userContent).toContain('rootMechanism:** (EMPTY — flag CRITICAL)');
      expect(userContent).toContain('newStateAfterFix:** (EMPTY — flag CRITICAL)');
      expect(userContent).toContain('whyAssertionPassesNow:** (EMPTY — flag CRITICAL)');
    });

    it('system prompt includes rules for missing trace and logical strengthening', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(passingReview), responseId: 'r' });

      const context = createAgentContext({
        errorMessage: 'err',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      await agent.execute(
        { proposedFix: mockProposedFix, analysis: mockAnalysis },
        context
      );

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      expect(call.systemPrompt).toContain('Missing or vague failureModeTrace');
      expect(call.systemPrompt).toContain('Logical strengthening without justification');
      expect(call.systemPrompt).toContain('strictly stronger');
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
