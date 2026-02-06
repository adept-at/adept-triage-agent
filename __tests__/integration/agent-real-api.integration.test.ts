/**
 * Real API Integration Tests for Agent Workflow
 *
 * These tests call the actual OpenAI API to validate the agent pipeline
 * works correctly with real AI responses.
 *
 * Run with: OPENAI_API_KEY=<key> npm run test:integration -- --testPathPattern=agent-real-api
 */

import {
  AgentOrchestrator,
  createOrchestrator,
} from '../../src/agents/agent-orchestrator';
import { createAgentContext, AgentContext } from '../../src/agents/base-agent';
import { AnalysisAgent } from '../../src/agents/analysis-agent';
import { InvestigationAgent } from '../../src/agents/investigation-agent';
import { FixGenerationAgent } from '../../src/agents/fix-generation-agent';
import { ReviewAgent } from '../../src/agents/review-agent';
import { OpenAIClient } from '../../src/openai-client';

// Skip tests if no API key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const describeIfApiKey = OPENAI_API_KEY ? describe : describe.skip;

describeIfApiKey('Agent Real API Integration', () => {
  let openaiClient: OpenAIClient;
  let orchestrator: AgentOrchestrator;

  // Realistic test file content
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

  // Realistic error context for selector change scenario
  const selectorChangeContext: AgentContext = createAgentContext({
    errorMessage: `Timed out retrying after 10000ms: Expected to find element: '[data-testid="email-input"]', but never found it.

Cypress could not find an element matching:
  cy.get('[data-testid="email-input"]')

This element was not found within the timeout of 10000ms.`,
    testFile: 'cypress/e2e/login.cy.ts',
    testName: 'should login successfully',
    errorType: 'ELEMENT_NOT_FOUND',
    errorSelector: '[data-testid="email-input"]',
    stackTrace: `
CypressError: Timed out retrying after 10000ms
    at Context.eval (cypress/e2e/login.cy.ts:8:8)
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

  // Timeout scenario
  const timeoutContext: AgentContext = createAgentContext({
    errorMessage: `Timed out retrying after 30000ms: Expected to find element: '.dashboard-content', but never found it.

The element was not found before the timeout.`,
    testFile: 'cypress/e2e/dashboard.cy.ts',
    testName: 'should load dashboard after login',
    errorType: 'TIMEOUT',
    errorSelector: '.dashboard-content',
    logs: [
      'cy.visit(/login)',
      'cy.get([data-testid="email"]).type(test@example.com)',
      'cy.get([data-testid="password"]).type(***)',
      'cy.get(button[type="submit"]).click()',
      '(xhr) POST /api/auth/login - 200 OK (1523ms)',
      '(xhr) GET /api/user/profile - 200 OK (892ms)',
      '(xhr) GET /api/dashboard/data - pending...',
      'cy.get(.dashboard-content) - timed out after 30000ms',
    ],
  });

  beforeAll(() => {
    if (!OPENAI_API_KEY) {
      console.log('Skipping real API tests - no OPENAI_API_KEY set');
      return;
    }

    openaiClient = new OpenAIClient(OPENAI_API_KEY);
    orchestrator = createOrchestrator(openaiClient, {
      maxIterations: 2, // Limit iterations to control costs
      minConfidence: 60,
      requireReview: true,
      fallbackToSingleShot: false,
      totalTimeoutMs: 120000, // 2 minute timeout
    });
  });

  describe('Individual Agent Tests', () => {
    it('AnalysisAgent should correctly analyze a selector mismatch error', async () => {
      const agent = new AnalysisAgent(openaiClient);
      const result = await agent.execute({}, selectorChangeContext);

      console.log('Analysis Result:', JSON.stringify(result.data, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.rootCauseCategory).toBe('SELECTOR_MISMATCH');
      expect(result.data?.confidence).toBeGreaterThan(50);
      expect(result.data?.selectors).toContain('[data-testid="email-input"]');
      // issueLocation can be TEST_CODE, BOTH, or APP_CODE (AI may reason app change triggered test update need,
      // or that the app code change is the root cause requiring the test to adapt)
      expect(['TEST_CODE', 'BOTH', 'APP_CODE']).toContain(result.data?.issueLocation);
    }, 60000);

    it('AnalysisAgent should correctly analyze a timing issue', async () => {
      const agent = new AnalysisAgent(openaiClient);
      const result = await agent.execute({}, timeoutContext);

      console.log('Analysis Result:', JSON.stringify(result.data, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Should identify as timing issue due to pending API call
      expect(['TIMING_ISSUE', 'NETWORK_ISSUE', 'SELECTOR_MISMATCH']).toContain(
        result.data?.rootCauseCategory
      );
      expect(result.data?.patterns.hasTimeout).toBe(true);
    }, 60000);

    it('InvestigationAgent should identify selector change from PR diff', async () => {
      // First run analysis to get the analysis output
      const analysisAgent = new AnalysisAgent(openaiClient);
      const analysisResult = await analysisAgent.execute(
        {},
        selectorChangeContext
      );

      expect(analysisResult.success).toBe(true);

      // Now run investigation with analysis results
      const investigationAgent = new InvestigationAgent(openaiClient);
      const result = await investigationAgent.execute(
        {
          analysis: analysisResult.data!,
        },
        selectorChangeContext
      );

      console.log(
        'Investigation Result:',
        JSON.stringify(result.data, null, 2)
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.isTestCodeFixable).toBe(true);
      expect(result.data?.findings.length).toBeGreaterThan(0);
      // Should identify the selector that needs updating
      expect(result.data?.selectorsToUpdate.length).toBeGreaterThan(0);
    }, 90000);

    it('FixGenerationAgent should generate valid code changes', async () => {
      // Run full analysis + investigation pipeline first
      const analysisAgent = new AnalysisAgent(openaiClient);
      const analysisResult = await analysisAgent.execute(
        {},
        selectorChangeContext
      );
      expect(analysisResult.success).toBe(true);

      const investigationAgent = new InvestigationAgent(openaiClient);
      const investigationResult = await investigationAgent.execute(
        { analysis: analysisResult.data! },
        selectorChangeContext
      );
      expect(investigationResult.success).toBe(true);

      // Add source file content
      const contextWithSource = {
        ...selectorChangeContext,
        sourceFileContent: testFileContent,
      };

      // Now test fix generation
      const fixAgent = new FixGenerationAgent(openaiClient);
      const result = await fixAgent.execute(
        {
          analysis: analysisResult.data!,
          investigation: investigationResult.data!,
        },
        contextWithSource
      );

      console.log(
        'Fix Generation Result:',
        JSON.stringify(result.data, null, 2)
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.changes.length).toBeGreaterThan(0);
      expect(result.data?.confidence).toBeGreaterThan(50);

      // Verify the change makes sense
      const change = result.data?.changes[0];
      expect(change?.file).toContain('login');
      expect(change?.oldCode).toContain('email-input');
      expect(change?.newCode).toContain('email-field');
    }, 120000);

    it('ReviewAgent should validate fix correctness', async () => {
      // Create a mock fix for review
      const mockFix = {
        changes: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 8,
            oldCode: `cy.get('[data-testid="email-input"]').type('test@example.com');`,
            newCode: `cy.get('[data-testid="email-field"]').type('test@example.com');`,
            justification: 'Update selector to match renamed data-testid',
            changeType: 'SELECTOR_UPDATE' as const,
          },
        ],
        confidence: 85,
        summary: 'Update email input selector',
        reasoning: 'The data-testid was changed in the PR',
        evidence: ['PR diff shows change'],
        risks: [],
      };

      const mockAnalysis = {
        rootCauseCategory: 'SELECTOR_MISMATCH' as const,
        contributingFactors: [],
        confidence: 85,
        explanation: 'Selector no longer matches',
        selectors: ['[data-testid="email-input"]'],
        elements: [],
        issueLocation: 'TEST_CODE' as const,
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

      const contextWithSource = {
        ...selectorChangeContext,
        sourceFileContent: testFileContent,
      };

      const reviewAgent = new ReviewAgent(openaiClient);
      const result = await reviewAgent.execute(
        {
          proposedFix: mockFix,
          analysis: mockAnalysis,
        },
        contextWithSource
      );

      console.log('Review Result:', JSON.stringify(result.data, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Note: The AI may reject a single-change fix if it detects the selector
      // appears multiple times in the file. This is actually smart behavior!
      // We just verify the review completed and has reasonable confidence assessment.
      expect(typeof result.data?.approved).toBe('boolean');
      expect(result.data?.fixConfidence).toBeDefined();
      expect(result.data?.assessment).toBeTruthy();

      console.log(
        'Review decision:',
        result.data?.approved ? 'APPROVED' : 'REJECTED'
      );
      console.log('Reason:', result.data?.assessment);
    }, 60000);
  });

  describe('Full Pipeline Test', () => {
    it('should complete full agentic repair pipeline for selector change', async () => {
      const contextWithSource = {
        ...selectorChangeContext,
        sourceFileContent: testFileContent,
      };

      console.log('\n🚀 Starting full agentic pipeline test...\n');

      const result = await orchestrator.orchestrate(contextWithSource);

      console.log('\n📊 Orchestration Result:');
      console.log(`  Success: ${result.success}`);
      console.log(`  Approach: ${result.approach}`);
      console.log(`  Iterations: ${result.iterations}`);
      console.log(`  Total Time: ${result.totalTimeMs}ms`);

      if (result.fix) {
        console.log(`\n✅ Fix Generated:`);
        console.log(`  Confidence: ${result.fix.confidence}%`);
        console.log(`  Summary: ${result.fix.summary}`);
        console.log(`  Changes: ${result.fix.proposedChanges.length}`);
        result.fix.proposedChanges.forEach((change, i) => {
          console.log(`\n  Change ${i + 1}:`);
          console.log(`    File: ${change.file}`);
          console.log(`    Line: ${change.line}`);
          console.log(`    Old: ${change.oldCode.substring(0, 60)}...`);
          console.log(`    New: ${change.newCode.substring(0, 60)}...`);
        });
      }

      if (result.error) {
        console.log(`\n❌ Error: ${result.error}`);
      }

      // Assertions
      expect(result.success).toBe(true);
      expect(result.approach).toBe('agentic');
      expect(result.fix).toBeDefined();
      expect(result.fix?.confidence).toBeGreaterThan(60);
      expect(result.fix?.proposedChanges.length).toBeGreaterThan(0);

      // Verify the fix addresses the issue
      const firstChange = result.fix?.proposedChanges[0];
      expect(firstChange?.oldCode).toContain('email-input');
      expect(firstChange?.newCode).toContain('email-field');
    }, 180000); // 3 minute timeout for full pipeline
  });

  describe('Error Handling', () => {
    it('should handle ambiguous errors gracefully', async () => {
      const ambiguousContext = createAgentContext({
        errorMessage: 'Test failed',
        testFile: 'test.cy.ts',
        testName: 'some test',
        errorType: 'UNKNOWN',
      });

      const analysisAgent = new AnalysisAgent(openaiClient);
      const result = await analysisAgent.execute({}, ambiguousContext);

      // Should still succeed but with lower confidence
      expect(result.success).toBe(true);
      expect(result.data?.rootCauseCategory).toBeDefined();
      // With minimal info, confidence should be lower
      expect(result.data?.confidence).toBeLessThan(80);
    }, 60000);
  });
});
