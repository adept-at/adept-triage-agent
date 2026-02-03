import {
  FixGenerationAgent,
  FixGenerationOutput,
  CodeChange,
} from '../../src/agents/fix-generation-agent';
import { createAgentContext } from '../../src/agents/base-agent';
import { AnalysisOutput } from '../../src/agents/analysis-agent';
import { InvestigationOutput } from '../../src/agents/investigation-agent';
import { OpenAIClient } from '../../src/openai-client';

// Mock OpenAIClient
jest.mock('../../src/openai-client');

describe('FixGenerationAgent', () => {
  let mockOpenAIClient: jest.Mocked<OpenAIClient>;
  let agent: FixGenerationAgent;

  const mockAnalysis: AnalysisOutput = {
    rootCauseCategory: 'SELECTOR_MISMATCH',
    contributingFactors: [],
    confidence: 85,
    explanation: 'The selector is no longer valid',
    selectors: ['[data-testid="submit"]'],
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
    suggestedApproach: 'Update the selector',
  };

  const mockInvestigation: InvestigationOutput = {
    findings: [
      {
        type: 'SELECTOR_CHANGE',
        severity: 'HIGH',
        description: 'Selector no longer matches',
        evidence: ['Screenshot shows button with different data-testid'],
        relationToError: 'Direct cause of failure',
      },
    ],
    primaryFinding: {
      type: 'SELECTOR_CHANGE',
      severity: 'HIGH',
      description: 'Selector no longer matches',
      evidence: [],
      relationToError: 'Direct cause',
    },
    isTestCodeFixable: true,
    recommendedApproach: 'Update selector to [data-testid="submit-button"]',
    selectorsToUpdate: [
      {
        current: '[data-testid="submit"]',
        reason: 'Data attribute was renamed',
        suggestedReplacement: '[data-testid="submit-button"]',
      },
    ],
    confidence: 85,
  };

  beforeEach(() => {
    mockOpenAIClient = new OpenAIClient(
      'test-key'
    ) as jest.Mocked<OpenAIClient>;
    agent = new FixGenerationAgent(mockOpenAIClient);
  });

  describe('execute', () => {
    it('should generate fix with code changes', async () => {
      const mockResponse: FixGenerationOutput = {
        changes: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 25,
            oldCode: 'cy.get(\'[data-testid="submit"]\')',
            newCode: 'cy.get(\'[data-testid="submit-button"]\')',
            justification: 'Update selector to match renamed data-testid',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 85,
        summary: 'Update submit button selector',
        reasoning: 'The data-testid was renamed from submit to submit-button',
        evidence: ['PR diff shows data-testid change'],
        risks: ['Ensure all test files using this selector are updated'],
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue(JSON.stringify(mockResponse));

      const context = createAgentContext({
        errorMessage: 'Element not found: [data-testid="submit"]',
        testFile: 'cypress/e2e/login.cy.ts',
        testName: 'should submit login form',
        sourceFileContent: 'cy.get(\'[data-testid="submit"]\').click()',
      });

      const result = await agent.execute(
        {
          analysis: mockAnalysis,
          investigation: mockInvestigation,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.changes).toHaveLength(1);
      expect(result.data?.changes[0].oldCode).toContain('submit');
      expect(result.data?.changes[0].newCode).toContain('submit-button');
      expect(result.data?.confidence).toBe(85);
    });

    it('should handle multiple changes', async () => {
      const mockResponse: FixGenerationOutput = {
        changes: [
          {
            file: 'test.cy.ts',
            line: 10,
            oldCode: 'cy.get(".old-class")',
            newCode: 'cy.get(".new-class")',
            justification: 'Class name changed',
            changeType: 'SELECTOR_UPDATE',
          },
          {
            file: 'test.cy.ts',
            line: 15,
            oldCode: 'cy.wait(1000)',
            newCode: 'cy.get(".spinner").should("not.exist")',
            justification: 'Use explicit wait instead of arbitrary timeout',
            changeType: 'WAIT_ADDITION',
          },
        ],
        confidence: 80,
        summary: 'Update selectors and waits',
        reasoning: 'Multiple issues found',
        evidence: [],
        risks: [],
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
          analysis: mockAnalysis,
          investigation: mockInvestigation,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.changes).toHaveLength(2);
    });

    it('should include previous feedback when provided', async () => {
      const mockResponse: FixGenerationOutput = {
        changes: [
          {
            file: 'test.cy.ts',
            line: 10,
            oldCode: 'cy.get(".btn")',
            newCode: 'cy.get("[data-testid=\\"submit\\"]")',
            justification: 'Updated based on review feedback',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 90,
        summary: 'Improved fix based on feedback',
        reasoning: 'Addressed review comments',
        evidence: [],
        risks: [],
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
          analysis: mockAnalysis,
          investigation: mockInvestigation,
          previousFeedback: 'Use data-testid instead of class selector',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockOpenAIClient.generateWithCustomPrompt).toHaveBeenCalled();
    });

    it('should fail when no changes are generated', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          changes: [],
          confidence: 50,
          summary: 'No fix possible',
          reasoning: 'Cannot determine fix',
          evidence: [],
          risks: [],
        })
      );

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        {
          analysis: mockAnalysis,
          investigation: mockInvestigation,
        },
        context
      );

      expect(result.success).toBe(false);
    });

    it('should fail when change is missing required fields', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          changes: [
            {
              file: 'test.cy.ts',
              // Missing oldCode and newCode
              justification: 'Some change',
            },
          ],
          confidence: 70,
          summary: 'Fix',
          reasoning: 'Reason',
          evidence: [],
          risks: [],
        })
      );

      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        {
          analysis: mockAnalysis,
          investigation: mockInvestigation,
        },
        context
      );

      expect(result.success).toBe(false);
    });
  });

  describe('CodeChange interface', () => {
    it('should support all change types', () => {
      const changeTypes = [
        'SELECTOR_UPDATE',
        'WAIT_ADDITION',
        'LOGIC_CHANGE',
        'ASSERTION_UPDATE',
        'OTHER',
      ];

      changeTypes.forEach((type) => {
        const change: CodeChange = {
          file: 'test.ts',
          line: 1,
          oldCode: 'old',
          newCode: 'new',
          justification: 'reason',
          changeType: type as CodeChange['changeType'],
        };
        expect(change.changeType).toBe(type);
      });
    });
  });
});
