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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

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
      mockOpenAIClient.generateWithCustomPrompt = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          changes: [],
          confidence: 50,
          summary: 'No fix possible',
          reasoning: 'Cannot determine fix',
          evidence: [],
          risks: [],
        }),
        responseId: 'mock-resp-id',
      });

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
      mockOpenAIClient.generateWithCustomPrompt = jest.fn().mockResolvedValue({
        text: JSON.stringify({
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
        }),
        responseId: 'mock-resp-id',
      });

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

  describe('product diff in prompt', () => {
    it('should include product diff section when productDiff is provided', async () => {
      const mockResponse: FixGenerationOutput = {
        changes: [
          {
            file: 'test/spec.ts',
            line: 10,
            oldCode: 'await $("[aria-label=\\"Transcript\\"]")',
            newCode: 'await $("[aria-label=\\"Video transcript\\"]")',
            justification: 'Product changed the aria-label',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 90,
        summary: 'Update selector to match product change',
        reasoning: 'Product repo renamed the aria-label',
        evidence: ['Product diff shows aria-label change'],
        risks: [],
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'mock-resp-id' });

      const context = createAgentContext({
        errorMessage: 'Element not found: [aria-label="Transcript"]',
        testFile: 'test/spec.ts',
        testName: 'should show transcripts',
        productDiff: {
          files: [
            {
              filename: 'src/components/VideoPlayer.tsx',
              patch: '-aria-label="Transcript"\n+aria-label="Video transcript"',
              status: 'modified',
            },
          ],
        },
      });

      const result = await agent.execute(
        { analysis: mockAnalysis, investigation: mockInvestigation },
        context
      );

      expect(result.success).toBe(true);
      const promptCall = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(promptCall.userContent)
        ? promptCall.userContent.map((c: any) => c.text || '').join('\n')
        : promptCall.userContent;
      expect(userContent).toContain('MANDATORY: Recent Product Repo Changes');
      expect(userContent).toContain('VideoPlayer.tsx');
      expect(userContent).toContain('aria-label');
    });

    it('should show "no product changes" message when productDiff is absent', async () => {
      const mockResponse: FixGenerationOutput = {
        changes: [
          {
            file: 'test.cy.ts',
            line: 10,
            oldCode: 'cy.get(".btn")',
            newCode: 'cy.get("[data-testid=\\"btn\\"]")',
            justification: 'Use stable selector',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 80,
        summary: 'Stabilize selector',
        reasoning: 'Selector is brittle',
        evidence: [],
        risks: [],
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
        { analysis: mockAnalysis, investigation: mockInvestigation },
        context
      );

      expect(result.success).toBe(true);
      const promptCall = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = Array.isArray(promptCall.userContent)
        ? promptCall.userContent.map((c: any) => c.text || '').join('\n')
        : promptCall.userContent;
      expect(userContent).toContain('No recent changes found in the product repo');
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

  describe('failureModeTrace', () => {
    it('parses the causal trace when the model returns one', async () => {
      const mockResponse = {
        changes: [
          {
            file: 'test/specs/video.spec.ts',
            line: 100,
            oldCode: 'expect(diff).toBeLessThan(0.25)',
            newCode: 'await browser.waitUntil(async () => (await player.paused()) === true);\nconst pausedTime = await player.currentTime();',
            justification: 'Capture pausedTime only after pause transition',
            changeType: 'LOGIC_CHANGE',
          },
        ],
        confidence: 82,
        summary: 'Wait for paused state before capturing baseline',
        reasoning: 'pausedTime was captured before the pause transition completed',
        evidence: ['log: currentTime=6.02, pausedTime=0.0'],
        risks: [],
        failureModeTrace: {
          originalState: 'currentTime=6.02s, pausedTime=0.0s, drift 6.02 > tolerance 0.25',
          rootMechanism: 'pausedTime captured immediately after click, before player transitioned to paused',
          newStateAfterFix: 'pausedTime captured only after player.paused()===true',
          whyAssertionPassesNow: 'drift is now measured from the true pause moment, bounded by the event-loop latency (< 50ms) which is far below tolerance',
        },
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'r' });

      const context = createAgentContext({
        errorMessage: 'expected 6.02 to be less than 0.25',
        testFile: 'test/specs/video.spec.ts',
        testName: 'should pause within tolerance',
        framework: 'webdriverio',
      });

      const result = await agent.execute(
        { analysis: mockAnalysis, investigation: mockInvestigation },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.failureModeTrace).toBeDefined();
      expect(result.data?.failureModeTrace?.originalState).toContain('6.02');
      expect(result.data?.failureModeTrace?.rootMechanism).toContain('paused');
      expect(result.data?.failureModeTrace?.whyAssertionPassesNow).toContain('tolerance');
    });

    it('tolerates a missing failureModeTrace (parser does not fail) but leaves the field undefined', async () => {
      const mockResponse = {
        changes: [
          {
            file: 'test.cy.ts',
            line: 10,
            oldCode: 'old',
            newCode: 'new',
            justification: 'fix',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 80,
        summary: 'fix',
        reasoning: 'reason',
        evidence: [],
        risks: [],
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'r' });

      const context = createAgentContext({
        errorMessage: 'err',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        { analysis: mockAnalysis, investigation: mockInvestigation },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.failureModeTrace).toBeUndefined();
    });

    it('fills missing trace sub-fields with empty strings so the review agent can flag them', async () => {
      const mockResponse = {
        changes: [
          {
            file: 'test.cy.ts',
            line: 10,
            oldCode: 'old',
            newCode: 'new',
            justification: 'fix',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 80,
        summary: 'fix',
        reasoning: 'reason',
        evidence: [],
        risks: [],
        failureModeTrace: {
          originalState: 'timing issue',
        },
      };

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(mockResponse), responseId: 'r' });

      const context = createAgentContext({
        errorMessage: 'err',
        testFile: 'test.cy.ts',
        testName: 'test',
      });

      const result = await agent.execute(
        { analysis: mockAnalysis, investigation: mockInvestigation },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.failureModeTrace).toEqual({
        originalState: 'timing issue',
        rootMechanism: '',
        newStateAfterFix: '',
        whyAssertionPassesNow: '',
      });
    });

    it('includes the failureModeTrace schema section in the system prompt', async () => {
      const mockFixResponse = JSON.stringify({
        changes: [{
          file: 'test.ts', line: 10, oldCode: 'old', newCode: 'new',
          justification: 'fix', changeType: 'OTHER',
        }],
        confidence: 80, summary: 'fix', reasoning: 'reason', evidence: [], risks: [],
      });

      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockResolvedValueOnce({ text: mockFixResponse, responseId: 'r' });

      await agent.execute(
        { analysis: mockAnalysis, investigation: mockInvestigation },
        createAgentContext({ errorMessage: 'e', testFile: 't', testName: 't' })
      );

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      expect(call.systemPrompt).toContain('failureModeTrace');
      expect(call.systemPrompt).toContain('originalState');
      expect(call.systemPrompt).toContain('rootMechanism');
      expect(call.systemPrompt).toContain('whyAssertionPassesNow');
      expect(call.systemPrompt).toContain('strictly stronger');
    });
  });

  describe('framework-specialized prompts', () => {
    it('should include Cypress-specific patterns for cypress framework', async () => {
      const cypressContext = createAgentContext({
        errorMessage: 'cy.get timeout',
        testFile: 'cypress/e2e/login.cy.ts',
        testName: 'should login',
        framework: 'cypress',
      });

      const mockFixResponse = JSON.stringify({
        changes: [{
          file: 'login.cy.ts', line: 10, oldCode: 'old', newCode: 'new',
          justification: 'fix', changeType: 'WAIT_ADDITION',
        }],
        confidence: 80, summary: 'fix', reasoning: 'reason', evidence: [], risks: [],
      });

      mockOpenAIClient.generateWithCustomPrompt.mockResolvedValueOnce({
        text: mockFixResponse, responseId: 'r1',
      });

      await agent.execute({ analysis: mockAnalysis, investigation: mockInvestigation }, cypressContext);

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      expect(call.systemPrompt).toContain('Cypress Fix Patterns');
      expect(call.systemPrompt).toContain('cy.intercept');
      expect(call.systemPrompt).not.toContain('WebDriverIO Fix Patterns');
    });

    it('should include WDIO-specific patterns for webdriverio framework', async () => {
      const wdioContext = createAgentContext({
        errorMessage: 'element not clickable',
        testFile: 'test/specs/login.e2e.ts',
        testName: 'should login',
        framework: 'webdriverio',
      });

      const mockFixResponse = JSON.stringify({
        changes: [{
          file: 'login.e2e.ts', line: 10, oldCode: 'old', newCode: 'new',
          justification: 'fix', changeType: 'WAIT_ADDITION',
        }],
        confidence: 80, summary: 'fix', reasoning: 'reason', evidence: [], risks: [],
      });

      mockOpenAIClient.generateWithCustomPrompt.mockResolvedValueOnce({
        text: mockFixResponse, responseId: 'r2',
      });

      await agent.execute({ analysis: mockAnalysis, investigation: mockInvestigation }, wdioContext);

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      expect(call.systemPrompt).toContain('WebDriverIO Fix Patterns');
      expect(call.systemPrompt).toContain('waitForClickable');
      expect(call.systemPrompt).not.toContain('Cypress Fix Patterns');
    });

    it('should include both patterns when framework is unknown', async () => {
      const unknownContext = createAgentContext({
        errorMessage: 'test failed',
        testFile: 'test.ts',
        testName: 'should work',
      });

      const mockFixResponse = JSON.stringify({
        changes: [{
          file: 'test.ts', line: 10, oldCode: 'old', newCode: 'new',
          justification: 'fix', changeType: 'OTHER',
        }],
        confidence: 80, summary: 'fix', reasoning: 'reason', evidence: [], risks: [],
      });

      mockOpenAIClient.generateWithCustomPrompt.mockResolvedValueOnce({
        text: mockFixResponse, responseId: 'r3',
      });

      await agent.execute({ analysis: mockAnalysis, investigation: mockInvestigation }, unknownContext);

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      expect(call.systemPrompt).toContain('Cypress Fix Patterns');
      expect(call.systemPrompt).toContain('WebDriverIO Fix Patterns');
    });

    it('should inject skillsPrompt into user prompt when present', async () => {
      const contextWithSkills = createAgentContext({
        errorMessage: 'element not found',
        testFile: 'test.ts',
        testName: 'should work',
        framework: 'webdriverio',
      });
      contextWithSkills.skillsPrompt = '### Agent Memory: Proven Fix Patterns\nFix 1: added waitForClickable';

      const mockFixResponse = JSON.stringify({
        changes: [{
          file: 'test.ts', line: 10, oldCode: 'old', newCode: 'new',
          justification: 'fix', changeType: 'WAIT_ADDITION',
        }],
        confidence: 80, summary: 'fix', reasoning: 'reason', evidence: [], risks: [],
      });

      mockOpenAIClient.generateWithCustomPrompt.mockResolvedValueOnce({
        text: mockFixResponse, responseId: 'r4',
      });

      await agent.execute({ analysis: mockAnalysis, investigation: mockInvestigation }, contextWithSkills);

      const call = mockOpenAIClient.generateWithCustomPrompt.mock.calls[0][0];
      const userContent = (call.userContent as Array<{ text: string }>)[0].text;
      expect(userContent).toContain('Agent Memory: Proven Fix Patterns');
      expect(userContent).toContain('added waitForClickable');
    });
  });
});
