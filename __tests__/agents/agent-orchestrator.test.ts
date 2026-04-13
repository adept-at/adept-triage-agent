import {
  AgentOrchestrator,
  createOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
  OrchestratorConfig,
} from '../../src/agents/agent-orchestrator';
import { createAgentContext } from '../../src/agents/base-agent';
import { OpenAIClient } from '../../src/openai-client';

// Mock OpenAIClient
jest.mock('../../src/openai-client');

describe('AgentOrchestrator', () => {
  let mockOpenAIClient: jest.Mocked<OpenAIClient>;

  beforeEach(() => {
    mockOpenAIClient = new OpenAIClient(
      'test-key'
    ) as jest.Mocked<OpenAIClient>;
    jest.clearAllMocks();
  });

  describe('DEFAULT_ORCHESTRATOR_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_ORCHESTRATOR_CONFIG.maxIterations).toBe(3);
      expect(DEFAULT_ORCHESTRATOR_CONFIG.totalTimeoutMs).toBe(120000);
      expect(DEFAULT_ORCHESTRATOR_CONFIG.minConfidence).toBe(70);
      expect(DEFAULT_ORCHESTRATOR_CONFIG.requireReview).toBe(true);
      expect(DEFAULT_ORCHESTRATOR_CONFIG.fallbackToSingleShot).toBe(true);
    });
  });

  describe('createOrchestrator', () => {
    it('should create an orchestrator with default config', () => {
      const orchestrator = createOrchestrator(mockOpenAIClient);
      expect(orchestrator).toBeInstanceOf(AgentOrchestrator);
    });

    it('should create an orchestrator with custom config', () => {
      const customConfig: Partial<OrchestratorConfig> = {
        maxIterations: 5,
        minConfidence: 80,
      };
      const orchestrator = createOrchestrator(mockOpenAIClient, customConfig);
      expect(orchestrator).toBeInstanceOf(AgentOrchestrator);
    });

    it('should create an orchestrator with source fetch context', () => {
      const mockOctokit = {} as any;
      const orchestrator = createOrchestrator(
        mockOpenAIClient,
        {},
        {
          octokit: mockOctokit,
          owner: 'test-owner',
          repo: 'test-repo',
          branch: 'main',
        }
      );
      expect(orchestrator).toBeInstanceOf(AgentOrchestrator);
    });
  });

  describe('orchestrate', () => {
    it('should handle analysis agent failure with fallback disabled', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockRejectedValue(new Error('Analysis failed'));

      // Disable fallback to ensure we get 'failed' approach
      const orchestrator = createOrchestrator(mockOpenAIClient, {
        fallbackToSingleShot: false,
      });
      const context = createAgentContext({
        errorMessage: 'Test error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(false);
      expect(result.approach).toBe('failed');
      expect(result.agentResults.analysis?.success).toBe(false);
    });

    it('should fallback to single-shot when analysis fails and fallback is enabled', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockRejectedValue(new Error('Analysis failed'));

      // Enable fallback (default behavior)
      const orchestrator = createOrchestrator(mockOpenAIClient, {
        fallbackToSingleShot: true,
      });
      const context = createAgentContext({
        errorMessage: 'Test error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(false);
      expect(result.approach).toBe('single-shot');
      expect(result.agentResults.analysis?.success).toBe(false);
    });

    it('should complete full pipeline on success', async () => {
      // Mock successful responses for each agent
      const analysisResponse = {
        rootCauseCategory: 'SELECTOR_MISMATCH',
        contributingFactors: [],
        confidence: 85,
        explanation: 'Selector changed',
        selectors: ['[data-testid="btn"]'],
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

      const investigationResponse = {
        findings: [
          {
            type: 'SELECTOR_CHANGE',
            severity: 'HIGH',
            description: 'Selector changed',
            evidence: ['Evidence 1'],
            relationToError: 'Direct cause',
          },
        ],
        isTestCodeFixable: true,
        recommendedApproach: 'Update the selector',
        selectorsToUpdate: [
          {
            current: '[data-testid="btn"]',
            reason: 'Changed in UI',
            suggestedReplacement: '[data-testid="submit-btn"]',
          },
        ],
        confidence: 80,
      };

      const fixGenerationResponse = {
        changes: [
          {
            file: 'test.ts',
            line: 10,
            oldCode: 'cy.get("[data-testid=\\"btn\\"]")',
            newCode: 'cy.get("[data-testid=\\"submit-btn\\"]")',
            justification: 'Update selector',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 85,
        summary: 'Update selector',
        reasoning: 'Selector changed in UI',
        evidence: ['Evidence'],
        risks: [],
      };

      const reviewResponse = {
        approved: true,
        issues: [],
        assessment: 'Fix looks good',
        fixConfidence: 85,
      };

      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          const wrap = (obj: unknown) => ({ text: JSON.stringify(obj), responseId: `mock-${callCount}` });
          switch (callCount) {
            case 1:
              return Promise.resolve(wrap(analysisResponse));
            case 2:
              return Promise.resolve(wrap(investigationResponse));
            case 3:
              return Promise.resolve(wrap(fixGenerationResponse));
            case 4:
              return Promise.resolve(wrap(reviewResponse));
            default:
              return Promise.resolve(wrap({}));
          }
        });

      const orchestrator = createOrchestrator(mockOpenAIClient);
      const context = createAgentContext({
        errorMessage: 'Element not found',
        testFile: 'test.ts',
        testName: 'test',
        sourceFileContent: 'cy.get("[data-testid=\\"btn\\"]").click()',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(true);
      expect(result.approach).toBe('agentic');
      expect(result.fix).toBeDefined();
      expect(result.fix?.confidence).toBeGreaterThanOrEqual(70);

      expect(result.agentResults.analysis?.data?.rootCauseCategory).toBe('SELECTOR_MISMATCH');
      expect(result.agentResults.investigation?.data?.findings).toHaveLength(1);
      expect(result.agentResults.investigation?.data?.findings[0].description).toBe('Selector changed');
      expect(result.agentResults.investigation?.data?.recommendedApproach).toBe('Update the selector');
    });

    it('should handle timeout', async () => {
      // Create a mock that takes longer than the timeout
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ text: '{}', responseId: 'mock-timeout-resp' }),
                200000
              )
            )
        );

      const orchestrator = createOrchestrator(mockOpenAIClient, {
        totalTimeoutMs: 100, // Very short timeout for testing
      });
      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10000);

    it('should track execution time', async () => {
      mockOpenAIClient.generateWithCustomPrompt = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          rootCauseCategory: 'UNKNOWN',
          confidence: 50,
        }),
        responseId: 'mock-resp-id',
      });

      const orchestrator = createOrchestrator(mockOpenAIClient);
      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass framework through pipeline and include it in agent prompts', async () => {
      const analysisResponse = {
        rootCauseCategory: 'SELECTOR_MISMATCH',
        contributingFactors: [],
        confidence: 85,
        explanation: 'Selector changed',
        selectors: ['[data-testid="invite-button"]'],
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
        suggestedApproach: 'Use waitForDisplayed',
      };
      const investigationResponse = {
        findings: [
          {
            type: 'SELECTOR_CHANGE',
            severity: 'HIGH',
            description: 'Element not visible in time',
            evidence: [],
            relationToError: 'Direct cause',
          },
        ],
        isTestCodeFixable: true,
        recommendedApproach: 'Wait for element',
        selectorsToUpdate: [],
        confidence: 80,
      };
      const fixGenerationResponse = {
        changes: [
          {
            file: 'test/specs/invite.org.trainer.ts',
            line: 45,
            oldCode: '$("[data-testid=invite-button]").click()',
            newCode: '$("[data-testid=invite-button]").waitForDisplayed(); $("[data-testid=invite-button]").click()',
            justification: 'Wait for displayed',
            changeType: 'WAIT_ADDITION',
          },
        ],
        confidence: 85,
        summary: 'Add waitForDisplayed',
        reasoning: 'WDIO element not visible',
        evidence: [],
        risks: [],
      };
      const reviewResponse = {
        approved: true,
        issues: [],
        assessment: 'Fix looks good',
        fixConfidence: 85,
      };

      let callCount = 0;
      const capturedCalls: Array<{ systemPrompt: string; userContent: string | unknown[] }> = [];
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation((params: { systemPrompt: string; userContent: string | unknown[] }) => {
          capturedCalls.push({
            systemPrompt: params.systemPrompt,
            userContent: params.userContent,
          });
          callCount++;
          const wrap = (obj: unknown) => ({ text: JSON.stringify(obj), responseId: `mock-${callCount}` });
          switch (callCount) {
            case 1:
              return Promise.resolve(wrap(analysisResponse));
            case 2:
              return Promise.resolve(wrap(investigationResponse));
            case 3:
              return Promise.resolve(wrap(fixGenerationResponse));
            case 4:
              return Promise.resolve(wrap(reviewResponse));
            default:
              return Promise.resolve(wrap({}));
          }
        });

      const orchestrator = createOrchestrator(mockOpenAIClient);
      const context = createAgentContext({
        errorMessage: 'element ("[data-testid=invite-button]") still not visible after 10000 ms',
        testFile: 'test/specs/orginvites/invite.org.trainer.ts',
        testName: 'invite trainer flow',
        framework: 'webdriverio',
        sourceFileContent: 'await $("[data-testid=invite-button]").click();',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(true);
      expect(result.approach).toBe('agentic');

      const getPromptText = (content: string | unknown[]): string => {
        if (typeof content === 'string') return content;
        const part = Array.isArray(content) && content[0] && typeof (content[0] as { text?: string }).text === 'string'
          ? (content[0] as { text: string }).text
          : '';
        return part;
      };

      const analysisPrompt = getPromptText(capturedCalls[0]?.userContent ?? '');
      const fixGenPrompt = getPromptText(capturedCalls[2]?.userContent ?? '');
      expect(analysisPrompt).toContain('WebDriverIO');
      expect(analysisPrompt).toContain('Test framework');
      expect(fixGenPrompt).toContain('WebDriverIO');
      expect(fixGenPrompt).toContain('Test framework');
    });

    it('should pass Cypress framework through pipeline and include it in agent prompts', async () => {
      const analysisResponse = {
        rootCauseCategory: 'SELECTOR_MISMATCH',
        contributingFactors: [],
        confidence: 85,
        explanation: 'Selector changed',
        selectors: ['[data-testid="btn"]'],
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
      const investigationResponse = {
        findings: [],
        isTestCodeFixable: true,
        recommendedApproach: 'Update selector',
        selectorsToUpdate: [{ current: '[data-testid="btn"]', reason: 'Changed', suggestedReplacement: '[data-testid="submit-btn"]' }],
        confidence: 80,
      };
      const fixGenerationResponse = {
        changes: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 8,
            oldCode: 'cy.get("[data-testid=\\"btn\\"]")',
            newCode: 'cy.get("[data-testid=\\"submit-btn\\"]")',
            justification: 'Update selector',
            changeType: 'SELECTOR_UPDATE',
          },
        ],
        confidence: 85,
        summary: 'Update selector',
        reasoning: 'Selector changed',
        evidence: [],
        risks: [],
      };
      const reviewResponse = { approved: true, issues: [], assessment: 'Good', fixConfidence: 85 };

      let callCount = 0;
      const capturedCalls: Array<{ userContent: string | unknown[] }> = [];
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation((params: { userContent: string | unknown[] }) => {
          capturedCalls.push({ userContent: params.userContent });
          callCount++;
          const wrap = (obj: unknown) => ({ text: JSON.stringify(obj), responseId: `mock-${callCount}` });
          switch (callCount) {
            case 1:
              return Promise.resolve(wrap(analysisResponse));
            case 2:
              return Promise.resolve(wrap(investigationResponse));
            case 3:
              return Promise.resolve(wrap(fixGenerationResponse));
            case 4:
              return Promise.resolve(wrap(reviewResponse));
            default:
              return Promise.resolve(wrap({}));
          }
        });

      const orchestrator = createOrchestrator(mockOpenAIClient);
      const context = createAgentContext({
        errorMessage: 'Timed out retrying: Expected to find element: [data-testid="btn"]',
        testFile: 'cypress/e2e/login.cy.ts',
        testName: 'should login',
        framework: 'cypress',
        sourceFileContent: 'cy.get("[data-testid=\\"btn\\"]").click();',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(true);
      const getPromptText = (content: string | unknown[]): string => {
        if (typeof content === 'string') return content;
        const part = Array.isArray(content) && content[0] && typeof (content[0] as { text?: string }).text === 'string'
          ? (content[0] as { text: string }).text
          : '';
        return part;
      };
      expect(getPromptText(capturedCalls[0]?.userContent ?? '')).toContain('Cypress');
      expect(getPromptText(capturedCalls[2]?.userContent ?? '')).toContain('Cypress');
    });

    it('should use "unknown" when framework is undefined', async () => {
      const analysisResponse = {
        rootCauseCategory: 'SELECTOR_MISMATCH',
        contributingFactors: [],
        confidence: 85,
        explanation: 'Selector changed',
        selectors: ['[data-testid="btn"]'],
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
      const investigationResponse = {
        findings: [],
        isTestCodeFixable: true,
        recommendedApproach: 'Update selector',
        selectorsToUpdate: [],
        confidence: 80,
      };
      const fixGenerationResponse = {
        changes: [
          {
            file: 'test/example.spec.ts',
            line: 8,
            oldCode: 'el.click()',
            newCode: 'el.waitForDisplayed(); el.click()',
            justification: 'Wait for element',
            changeType: 'WAIT_ADDITION',
          },
        ],
        confidence: 85,
        summary: 'Add wait',
        reasoning: 'Element not ready',
        evidence: [],
        risks: [],
      };
      const reviewResponse = { approved: true, issues: [], assessment: 'Good', fixConfidence: 85 };

      let callCount = 0;
      const capturedCalls: Array<{ userContent: string | unknown[] }> = [];
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation((params: { userContent: string | unknown[] }) => {
          capturedCalls.push({ userContent: params.userContent });
          callCount++;
          const wrap = (obj: unknown) => ({ text: JSON.stringify(obj), responseId: `mock-${callCount}` });
          switch (callCount) {
            case 1:
              return Promise.resolve(wrap(analysisResponse));
            case 2:
              return Promise.resolve(wrap(investigationResponse));
            case 3:
              return Promise.resolve(wrap(fixGenerationResponse));
            case 4:
              return Promise.resolve(wrap(reviewResponse));
            default:
              return Promise.resolve(wrap({}));
          }
        });

      const orchestrator = createOrchestrator(mockOpenAIClient);
      const context = createAgentContext({
        errorMessage: 'Error: something went wrong',
        testFile: 'test/example.spec.ts',
        testName: 'example test',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(true);
      const getPromptText = (content: string | unknown[]): string => {
        if (typeof content === 'string') return content;
        const part = Array.isArray(content) && content[0] && typeof (content[0] as { text?: string }).text === 'string'
          ? (content[0] as { text: string }).text
          : '';
        return part;
      };
      expect(getPromptText(capturedCalls[0]?.userContent ?? '')).toContain('unknown');
      expect(getPromptText(capturedCalls[0]?.userContent ?? '')).toContain('Test framework');
      expect(getPromptText(capturedCalls[0]?.userContent ?? '')).not.toContain('Cypress');
      expect(getPromptText(capturedCalls[0]?.userContent ?? '')).not.toContain('WebDriverIO');
    });

    it('should abort repair when investigation says issue is not test-code-fixable', async () => {
      const analysisResponse = {
        rootCauseCategory: 'RENDERING_CHANGE',
        contributingFactors: [],
        confidence: 85,
        explanation: 'Video player no longer mounts until scrolled into view',
        selectors: ['mux-player'],
        elements: [],
        issueLocation: 'APP_CODE',
        patterns: {
          hasTimeout: true,
          hasVisibilityIssue: false,
          hasNetworkCall: false,
          hasStateAssertion: false,
          hasDynamicContent: true,
          hasResponsiveIssue: false,
        },
        suggestedApproach: 'Product regression — video lazy loading broke element presence',
      };

      const investigationResponse = {
        findings: [
          {
            type: 'PRODUCT_CHANGE',
            severity: 'HIGH',
            description: 'Video elements are now lazy-mounted via IntersectionObserver',
            evidence: ['Product diff shows useIsElementVisible hook controls mounting'],
            relationToError: 'Direct cause',
          },
        ],
        isTestCodeFixable: false,
        recommendedApproach: 'Product needs to fix the video mounting or the feature is intentional and tests need a different approach',
        selectorsToUpdate: [],
        confidence: 90,
      };

      let callCount = 0;
      mockOpenAIClient.generateWithCustomPrompt = jest
        .fn()
        .mockImplementation(() => {
          callCount++;
          const wrap = (obj: unknown) => ({ text: JSON.stringify(obj), responseId: `mock-${callCount}` });
          switch (callCount) {
            case 1:
              return Promise.resolve(wrap(analysisResponse));
            case 2:
              return Promise.resolve(wrap(investigationResponse));
            default:
              return Promise.resolve(wrap({}));
          }
        });

      const orchestrator = createOrchestrator(mockOpenAIClient, {
        fallbackToSingleShot: false,
      });
      const context = createAgentContext({
        errorMessage: 'Expected to find element: mux-player, but never found it',
        testFile: 'skill.video.speed.ts',
        testName: 'should play video with varied speed settings',
      });

      const result = await orchestrator.orchestrate(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not test-code-fixable');
      expect(mockOpenAIClient.generateWithCustomPrompt).toHaveBeenCalledTimes(2);
    });
  });
});
