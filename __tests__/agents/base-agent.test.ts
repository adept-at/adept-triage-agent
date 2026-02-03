import {
  AgentResult,
  AgentContext,
  AgentConfig,
  DEFAULT_AGENT_CONFIG,
  createAgentContext,
} from '../../src/agents/base-agent';

describe('base-agent', () => {
  describe('DEFAULT_AGENT_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_AGENT_CONFIG.timeoutMs).toBe(60000);
      expect(DEFAULT_AGENT_CONFIG.temperature).toBe(0.3);
      expect(DEFAULT_AGENT_CONFIG.maxTokens).toBe(4000);
      expect(DEFAULT_AGENT_CONFIG.verbose).toBe(false);
    });
  });

  describe('createAgentContext', () => {
    it('should create context with required fields', () => {
      const context = createAgentContext({
        errorMessage: 'Element not found',
        testFile: 'cypress/e2e/login.cy.ts',
        testName: 'should login successfully',
      });

      expect(context.errorMessage).toBe('Element not found');
      expect(context.testFile).toBe('cypress/e2e/login.cy.ts');
      expect(context.testName).toBe('should login successfully');
    });

    it('should include optional fields when provided', () => {
      const context = createAgentContext({
        errorMessage: 'Timeout',
        testFile: 'test.ts',
        testName: 'test',
        errorType: 'TIMEOUT',
        errorSelector: '[data-testid="submit"]',
        stackTrace: 'Error at line 10',
        screenshots: [{ name: 'failure.png', base64Data: 'abc123' }],
        logs: ['log line 1', 'log line 2'],
        prDiff: {
          files: [{ filename: 'app.ts', patch: '+line', status: 'modified' }],
        },
      });

      expect(context.errorType).toBe('TIMEOUT');
      expect(context.errorSelector).toBe('[data-testid="submit"]');
      expect(context.stackTrace).toBe('Error at line 10');
      expect(context.screenshots).toHaveLength(1);
      expect(context.logs).toHaveLength(2);
      expect(context.prDiff?.files).toHaveLength(1);
    });

    it('should leave optional fields undefined when not provided', () => {
      const context = createAgentContext({
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
      });

      expect(context.errorType).toBeUndefined();
      expect(context.errorSelector).toBeUndefined();
      expect(context.stackTrace).toBeUndefined();
      expect(context.screenshots).toBeUndefined();
      expect(context.logs).toBeUndefined();
      expect(context.prDiff).toBeUndefined();
    });
  });

  describe('AgentResult interface', () => {
    it('should allow successful result with data', () => {
      const result: AgentResult<string> = {
        success: true,
        data: 'test data',
        executionTimeMs: 100,
        apiCalls: 1,
      };

      expect(result.success).toBe(true);
      expect(result.data).toBe('test data');
      expect(result.error).toBeUndefined();
    });

    it('should allow failed result with error', () => {
      const result: AgentResult<string> = {
        success: false,
        error: 'Something went wrong',
        executionTimeMs: 50,
        apiCalls: 1,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      expect(result.data).toBeUndefined();
    });

    it('should include optional tokensUsed', () => {
      const result: AgentResult<number> = {
        success: true,
        data: 42,
        executionTimeMs: 200,
        apiCalls: 2,
        tokensUsed: 1500,
      };

      expect(result.tokensUsed).toBe(1500);
    });
  });

  describe('AgentConfig interface', () => {
    it('should allow custom configuration', () => {
      const config: AgentConfig = {
        timeoutMs: 30000,
        temperature: 0.5,
        maxTokens: 2000,
        verbose: true,
      };

      expect(config.timeoutMs).toBe(30000);
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(2000);
      expect(config.verbose).toBe(true);
    });
  });

  describe('AgentContext interface', () => {
    it('should support relatedFiles as Map', () => {
      const context: AgentContext = {
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
        relatedFiles: new Map([
          ['helper.ts', 'export const helper = () => {}'],
          ['utils.ts', 'export const util = () => {}'],
        ]),
      };

      expect(context.relatedFiles?.size).toBe(2);
      expect(context.relatedFiles?.get('helper.ts')).toContain('helper');
    });

    it('should support sourceFileContent', () => {
      const context: AgentContext = {
        errorMessage: 'Error',
        testFile: 'test.ts',
        testName: 'test',
        sourceFileContent: 'describe("test", () => { it("works", () => {}) })',
      };

      expect(context.sourceFileContent).toContain('describe');
    });
  });
});
