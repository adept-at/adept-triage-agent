/**
 * Integration tests for the agent workflow
 * These tests exercise the full agentic repair pipeline with mocked AI responses
 */

import {
  AgentOrchestrator,
  createOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from '../../src/agents/agent-orchestrator';
import { createAgentContext, AgentContext } from '../../src/agents/base-agent';
import { AnalysisOutput } from '../../src/agents/analysis-agent';
import { InvestigationOutput } from '../../src/agents/investigation-agent';
import { FixGenerationOutput } from '../../src/agents/fix-generation-agent';
import { ReviewOutput } from '../../src/agents/review-agent';
import { OpenAIClient } from '../../src/openai-client';

// Mock OpenAI client
jest.mock('../../src/openai-client');

describe('Agent Workflow Integration', () => {
  let mockOpenAIClient: jest.Mocked<OpenAIClient>;
  let orchestrator: AgentOrchestrator;
  let defaultContext: AgentContext;

  // Real-world test file content for testing
  const testFileContent = `
describe('Login Page', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('should login successfully', () => {
    cy.get('[data-testid="email-input"]').type('test@example.com');
    cy.get('[data-testid="password-input"]').type('password123');
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/dashboard');
  });

  it('should show error for invalid credentials', () => {
    cy.get('[data-testid="email-input"]').type('wrong@example.com');
    cy.get('[data-testid="password-input"]').type('wrongpass');
    cy.get('button[type="submit"]').click();
    cy.get('[data-testid="error-message"]').should('be.visible');
  });
});
`;

  // Mock responses for each agent
  const mockAnalysisResponse: AnalysisOutput = {
    rootCauseCategory: 'SELECTOR_MISMATCH',
    contributingFactors: ['TIMING_ISSUE'],
    confidence: 85,
    explanation:
      'The selector [data-testid="email-input"] no longer matches the element. The input field was likely renamed in a recent PR.',
    selectors: [
      '[data-testid="email-input"]',
      '[data-testid="password-input"]',
    ],
    elements: ['email input field', 'password input field'],
    issueLocation: 'TEST_CODE',
    patterns: {
      hasTimeout: false,
      hasVisibilityIssue: false,
      hasNetworkCall: false,
      hasStateAssertion: false,
      hasDynamicContent: false,
      hasResponsiveIssue: false,
    },
    suggestedApproach:
      'Update the selector to match the new data-testid attribute',
  };

  const mockInvestigationResponse: InvestigationOutput = {
    findings: [
      {
        type: 'SELECTOR_CHANGE',
        severity: 'HIGH',
        description:
          'The data-testid attribute was changed from "email-input" to "email-field"',
        evidence: [
          'PR diff shows the data-testid change in LoginForm.tsx',
          'Old selector: data-testid="email-input"',
          'New selector: data-testid="email-field"',
        ],
        location: {
          file: 'src/components/LoginForm.tsx',
          line: 25,
          code: '<input data-testid="email-field" />',
        },
        relationToError: 'This directly causes the element not found error',
      },
    ],
    primaryFinding: {
      type: 'SELECTOR_CHANGE',
      severity: 'HIGH',
      description: 'The data-testid attribute was changed',
      evidence: [],
      relationToError: 'Direct cause',
    },
    isTestCodeFixable: true,
    recommendedApproach:
      'Update the test to use the new data-testid="email-field" selector',
    selectorsToUpdate: [
      {
        current: '[data-testid="email-input"]',
        reason: 'data-testid was renamed in the application code',
        suggestedReplacement: '[data-testid="email-field"]',
      },
    ],
    confidence: 90,
  };

  const mockFixGenerationResponse: FixGenerationOutput = {
    changes: [
      {
        file: 'cypress/e2e/login.cy.ts',
        line: 8,
        oldCode:
          "cy.get('[data-testid=\"email-input\"]').type('test@example.com');",
        newCode:
          "cy.get('[data-testid=\"email-field\"]').type('test@example.com');",
        justification:
          'Update selector to match the renamed data-testid in LoginForm.tsx',
        changeType: 'SELECTOR_UPDATE',
      },
      {
        file: 'cypress/e2e/login.cy.ts',
        line: 14,
        oldCode:
          "cy.get('[data-testid=\"email-input\"]').type('wrong@example.com');",
        newCode:
          "cy.get('[data-testid=\"email-field\"]').type('wrong@example.com');",
        justification:
          'Update selector to match the renamed data-testid in LoginForm.tsx',
        changeType: 'SELECTOR_UPDATE',
      },
    ],
    confidence: 88,
    summary:
      'Update email input selectors to use new data-testid="email-field"',
    reasoning:
      'The application renamed the data-testid from "email-input" to "email-field". Both test cases that reference this selector need to be updated.',
    evidence: [
      'PR diff shows data-testid change in LoginForm.tsx',
      'Two test cases reference the old selector',
    ],
    risks: ['Ensure no other test files use the old selector'],
    alternatives: [
      'Could also update the application code to use the old selector',
    ],
  };

  const mockReviewResponse: ReviewOutput = {
    approved: true,
    issues: [],
    assessment:
      'The fix correctly addresses the root cause by updating the selectors to match the renamed data-testid. Both changes are syntactically valid and the old code matches the file content exactly.',
    fixConfidence: 90,
    improvements: [
      'Consider adding a comment explaining the selector was updated due to the PR change',
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenAIClient = new OpenAIClient(
      'test-key'
    ) as jest.Mocked<OpenAIClient>;

    // Create orchestrator with test configuration
    orchestrator = createOrchestrator(mockOpenAIClient, {
      maxIterations: 3,
      minConfidence: 70,
      requireReview: true,
      fallbackToSingleShot: false,
      totalTimeoutMs: 30000,
    });

    // Create a realistic test context
    defaultContext = createAgentContext({
      errorMessage:
        'Timed out retrying after 10000ms: Expected to find element: \'[data-testid="email-input"]\', but never found it.',
      testFile: 'cypress/e2e/login.cy.ts',
      testName: 'should login successfully',
      errorType: 'ELEMENT_NOT_FOUND',
      errorSelector: '[data-testid="email-input"]',
      stackTrace: `
        at Context.eval (cypress/e2e/login.cy.ts:8:8)
        at cy.get()
      `,
      prDiff: {
        files: [
          {
            filename: 'src/components/LoginForm.tsx',
            status: 'modified',
            patch: `
@@ -23,7 +23,7 @@
           type="email"
           placeholder="Enter your email"
-          data-testid="email-input"
+          data-testid="email-field"
           onChange={handleEmailChange}
         />
`,
          },
        ],
      },
    });
  });

  describe('Full Pipeline Success', () => {
    it('should successfully generate and approve a fix through the full pipeline', async () => {
      // Set up mock responses in sequence
      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          switch (callCount) {
            case 1:
              return Promise.resolve(JSON.stringify(mockAnalysisResponse));
            case 2:
              return Promise.resolve(JSON.stringify(mockInvestigationResponse));
            case 3:
              return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
            case 4:
              return Promise.resolve(JSON.stringify(mockReviewResponse));
            default:
              return Promise.resolve('{}');
          }
        });

      // Add source file content to context
      defaultContext.sourceFileContent = testFileContent;

      const result = await orchestrator.orchestrate(defaultContext);

      // Verify overall success
      expect(result.success).toBe(true);
      expect(result.approach).toBe('agentic');
      expect(result.iterations).toBe(1);

      // Verify fix was generated
      expect(result.fix).toBeDefined();
      expect(result.fix?.confidence).toBeGreaterThanOrEqual(70);
      expect(result.fix?.proposedChanges).toHaveLength(2);

      // Verify the changes target the correct selector
      const changes = result.fix?.proposedChanges || [];
      expect(changes[0].oldCode).toContain('email-input');
      expect(changes[0].newCode).toContain('email-field');

      // Verify all agents were called
      expect(result.agentResults.analysis?.success).toBe(true);
      expect(result.agentResults.investigation?.success).toBe(true);
      expect(result.agentResults.fixGeneration?.success).toBe(true);
      expect(result.agentResults.review?.success).toBe(true);
    });

    it('should handle timing issue root cause', async () => {
      const timingAnalysis: AnalysisOutput = {
        rootCauseCategory: 'TIMING_ISSUE',
        contributingFactors: [],
        confidence: 80,
        explanation: 'Element appears after async operation completes',
        selectors: ['[data-testid="loading"]'],
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
        suggestedApproach: 'Add intercept and wait for API call',
      };

      const timingInvestigation: InvestigationOutput = {
        findings: [
          {
            type: 'TIMING_GAP',
            severity: 'HIGH',
            description: 'Test does not wait for API response',
            evidence: ['Network call to /api/user takes 500-2000ms'],
            relationToError: 'Element only renders after API responds',
          },
        ],
        isTestCodeFixable: true,
        recommendedApproach: 'Use cy.intercept() to wait for the API call',
        selectorsToUpdate: [],
        confidence: 85,
      };

      const timingFix: FixGenerationOutput = {
        changes: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 5,
            oldCode: "cy.visit('/login');",
            newCode: `cy.intercept('GET', '/api/user').as('getUser');
    cy.visit('/login');`,
            justification: 'Add intercept for user API call',
            changeType: 'WAIT_ADDITION',
          },
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 11,
            oldCode: "cy.url().should('include', '/dashboard');",
            newCode: `cy.wait('@getUser');
    cy.url().should('include', '/dashboard');`,
            justification: 'Wait for API call before checking URL',
            changeType: 'WAIT_ADDITION',
          },
        ],
        confidence: 82,
        summary: 'Add API intercept and wait to handle timing',
        reasoning:
          'The test fails because it does not wait for the async operation',
        evidence: ['Network tab shows delayed response'],
        risks: ['May increase test duration'],
      };

      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          switch (callCount) {
            case 1:
              return Promise.resolve(JSON.stringify(timingAnalysis));
            case 2:
              return Promise.resolve(JSON.stringify(timingInvestigation));
            case 3:
              return Promise.resolve(JSON.stringify(timingFix));
            case 4:
              return Promise.resolve(JSON.stringify(mockReviewResponse));
            default:
              return Promise.resolve('{}');
          }
        });

      defaultContext.sourceFileContent = testFileContent;
      const result = await orchestrator.orchestrate(defaultContext);

      expect(result.success).toBe(true);
      expect(result.fix?.proposedChanges).toHaveLength(2);
      expect(result.fix?.proposedChanges[0].newCode).toContain('intercept');
    });
  });

  describe('Pipeline Iteration (Fix Rejected and Improved)', () => {
    it('should iterate when review rejects the fix', async () => {
      const rejectedReview: ReviewOutput = {
        approved: false,
        issues: [
          {
            severity: 'WARNING',
            changeIndex: 0,
            description:
              'The newCode should include .should("be.visible") for reliability',
            suggestion:
              'Add visibility check before interacting with the element',
          },
        ],
        assessment: 'Fix addresses root cause but could be more robust',
        fixConfidence: 65,
      };

      const improvedFix: FixGenerationOutput = {
        ...mockFixGenerationResponse,
        changes: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 8,
            oldCode:
              "cy.get('[data-testid=\"email-input\"]').type('test@example.com');",
            newCode:
              "cy.get('[data-testid=\"email-field\"]').should('be.visible').type('test@example.com');",
            justification: 'Added visibility check as suggested by review',
            changeType: 'SELECTOR_UPDATE',
          },
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 14,
            oldCode:
              "cy.get('[data-testid=\"email-input\"]').type('wrong@example.com');",
            newCode:
              "cy.get('[data-testid=\"email-field\"]').should('be.visible').type('wrong@example.com');",
            justification: 'Added visibility check as suggested by review',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 92,
      };

      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          switch (callCount) {
            case 1: // Analysis
              return Promise.resolve(JSON.stringify(mockAnalysisResponse));
            case 2: // Investigation
              return Promise.resolve(JSON.stringify(mockInvestigationResponse));
            case 3: // First fix generation
              return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
            case 4: // First review (rejected)
              return Promise.resolve(JSON.stringify(rejectedReview));
            case 5: // Second fix generation (improved)
              return Promise.resolve(JSON.stringify(improvedFix));
            case 6: // Second review (approved)
              return Promise.resolve(JSON.stringify(mockReviewResponse));
            default:
              return Promise.resolve('{}');
          }
        });

      defaultContext.sourceFileContent = testFileContent;
      const result = await orchestrator.orchestrate(defaultContext);

      expect(result.success).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.fix?.proposedChanges[0].newCode).toContain('be.visible');
    });

    it('should fail after max iterations', async () => {
      const alwaysReject: ReviewOutput = {
        approved: false,
        issues: [
          {
            severity: 'CRITICAL',
            changeIndex: 0,
            description: 'oldCode does not match file content',
            suggestion: 'Verify exact whitespace and formatting',
          },
        ],
        assessment: 'Cannot approve - code mismatch',
        fixConfidence: 20,
      };

      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          // Analysis on call 1
          if (callCount === 1)
            return Promise.resolve(JSON.stringify(mockAnalysisResponse));
          // Investigation on call 2
          if (callCount === 2)
            return Promise.resolve(JSON.stringify(mockInvestigationResponse));
          // Odd calls after 2 are fix generations, even are reviews (rejected)
          if (callCount > 2 && callCount % 2 === 1) {
            return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
          }
          return Promise.resolve(JSON.stringify(alwaysReject));
        });

      defaultContext.sourceFileContent = testFileContent;
      const result = await orchestrator.orchestrate(defaultContext);

      // Should fail but still return the last fix since confidence is above threshold
      expect(result.iterations).toBe(3);
      expect(result.fix).toBeDefined(); // Last fix is returned even without approval
    });
  });

  describe('Pipeline Failure Scenarios', () => {
    it('should fail gracefully when analysis agent fails', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockRejectedValue(new Error('OpenAI API rate limited'));

      const result = await orchestrator.orchestrate(defaultContext);

      expect(result.success).toBe(false);
      expect(result.approach).toBe('failed');
      expect(result.error).toContain('Analysis agent failed');
      expect(result.agentResults.analysis?.success).toBe(false);
    });

    it('should fail gracefully when investigation agent fails', async () => {
      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(JSON.stringify(mockAnalysisResponse));
          }
          throw new Error('Investigation failed');
        });

      defaultContext.sourceFileContent = testFileContent;
      const result = await orchestrator.orchestrate(defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Investigation agent failed');
    });

    it('should fail when confidence is below threshold', async () => {
      const lowConfidenceAnalysis: AnalysisOutput = {
        ...mockAnalysisResponse,
        confidence: 30,
      };

      const lowConfidenceFix: FixGenerationOutput = {
        ...mockFixGenerationResponse,
        confidence: 40,
      };

      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          switch (callCount) {
            case 1:
              return Promise.resolve(JSON.stringify(lowConfidenceAnalysis));
            case 2:
              return Promise.resolve(JSON.stringify(mockInvestigationResponse));
            default:
              return Promise.resolve(JSON.stringify(lowConfidenceFix));
          }
        });

      defaultContext.sourceFileContent = testFileContent;
      const result = await orchestrator.orchestrate(defaultContext);

      // Should fail because fix confidence is below 70%
      expect(result.success).toBe(false);
    });
  });

  describe('Agent Communication', () => {
    it('should pass analysis results to investigation agent', async () => {
      const capturedCalls: string[] = [];

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation((params) => {
          capturedCalls.push(params.userContent[0]?.text || params.userContent);
          if (capturedCalls.length === 1) {
            return Promise.resolve(JSON.stringify(mockAnalysisResponse));
          }
          if (capturedCalls.length === 2) {
            return Promise.resolve(JSON.stringify(mockInvestigationResponse));
          }
          if (capturedCalls.length === 3) {
            return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
          }
          return Promise.resolve(JSON.stringify(mockReviewResponse));
        });

      defaultContext.sourceFileContent = testFileContent;
      await orchestrator.orchestrate(defaultContext);

      // Verify investigation agent received analysis results
      const investigationPrompt = capturedCalls[1];
      expect(investigationPrompt).toContain('SELECTOR_MISMATCH');
      expect(investigationPrompt).toContain('[data-testid="email-input"]');
    });

    it('should pass investigation results to fix generation agent', async () => {
      const capturedCalls: string[] = [];

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation((params) => {
          const text = params.userContent[0]?.text || params.userContent;
          capturedCalls.push(text);
          if (capturedCalls.length === 1) {
            return Promise.resolve(JSON.stringify(mockAnalysisResponse));
          }
          if (capturedCalls.length === 2) {
            return Promise.resolve(JSON.stringify(mockInvestigationResponse));
          }
          if (capturedCalls.length === 3) {
            return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
          }
          return Promise.resolve(JSON.stringify(mockReviewResponse));
        });

      defaultContext.sourceFileContent = testFileContent;
      await orchestrator.orchestrate(defaultContext);

      // Verify fix generation agent received investigation results
      const fixGenPrompt = capturedCalls[2];
      expect(fixGenPrompt).toContain('data-testid="email-field"');
    });

    it('should pass fix to review agent', async () => {
      const capturedCalls: string[] = [];

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation((params) => {
          const text = params.userContent[0]?.text || params.userContent;
          capturedCalls.push(text);
          if (capturedCalls.length === 1) {
            return Promise.resolve(JSON.stringify(mockAnalysisResponse));
          }
          if (capturedCalls.length === 2) {
            return Promise.resolve(JSON.stringify(mockInvestigationResponse));
          }
          if (capturedCalls.length === 3) {
            return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
          }
          return Promise.resolve(JSON.stringify(mockReviewResponse));
        });

      defaultContext.sourceFileContent = testFileContent;
      await orchestrator.orchestrate(defaultContext);

      // Verify review agent received the proposed fix
      const reviewPrompt = capturedCalls[3];
      expect(reviewPrompt).toContain('email-field');
      expect(reviewPrompt).toContain('SELECTOR_UPDATE');
    });
  });

  describe('Fix Recommendation Conversion', () => {
    it('should correctly convert FixGenerationOutput to FixRecommendation', async () => {
      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          switch (callCount) {
            case 1:
              return Promise.resolve(JSON.stringify(mockAnalysisResponse));
            case 2:
              return Promise.resolve(JSON.stringify(mockInvestigationResponse));
            case 3:
              return Promise.resolve(JSON.stringify(mockFixGenerationResponse));
            case 4:
              return Promise.resolve(JSON.stringify(mockReviewResponse));
            default:
              return Promise.resolve('{}');
          }
        });

      defaultContext.sourceFileContent = testFileContent;
      const result = await orchestrator.orchestrate(defaultContext);

      expect(result.fix).toBeDefined();

      // Verify FixRecommendation structure
      const fix = result.fix!;
      expect(fix.confidence).toBe(88);
      expect(fix.summary).toBe(
        'Update email input selectors to use new data-testid="email-field"'
      );
      expect(fix.reasoning).toContain(
        'The application renamed the data-testid'
      );
      expect(fix.evidence).toContain(
        'PR diff shows data-testid change in LoginForm.tsx'
      );

      // Verify proposedChanges
      expect(fix.proposedChanges).toHaveLength(2);
      expect(fix.proposedChanges[0]).toEqual({
        file: 'cypress/e2e/login.cy.ts',
        line: 8,
        oldCode:
          "cy.get('[data-testid=\"email-input\"]').type('test@example.com');",
        newCode:
          "cy.get('[data-testid=\"email-field\"]').type('test@example.com');",
        justification:
          'Update selector to match the renamed data-testid in LoginForm.tsx',
      });
    });
  });

  describe('Timeout Handling', () => {
    it('should respect total timeout', async () => {
      const slowOrchestrator = createOrchestrator(mockOpenAIClient, {
        totalTimeoutMs: 100, // Very short timeout
        fallbackToSingleShot: false,
      });

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve(JSON.stringify(mockAnalysisResponse)),
                200
              )
            )
        );

      const result = await slowOrchestrator.orchestrate(defaultContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });
});
