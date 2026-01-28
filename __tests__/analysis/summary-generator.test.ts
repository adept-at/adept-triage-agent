import {
  generateAnalysisSummary,
  generateFixSummary,
  createBriefSummary,
  formatVerdict,
} from '../../src/analysis/summary-generator';
import { ErrorData, OpenAIResponse, RepairContext } from '../../src/types';

describe('summary-generator', () => {
  describe('generateAnalysisSummary', () => {
    it('should generate summary for TEST_ISSUE verdict', () => {
      const response: OpenAIResponse = {
        verdict: 'TEST_ISSUE',
        reasoning: 'The test is using an incorrect selector. The element exists but the selector has a typo.',
        indicators: ['incorrect selector', 'element exists'],
      };
      const errorData: ErrorData = {
        message: 'Element not found',
        framework: 'cypress',
        testName: 'should submit form',
        fileName: 'login.cy.ts',
      };

      const summary = generateAnalysisSummary(response, errorData);

      expect(summary).toContain('🧪 Test Issue');
      expect(summary).toContain('The test is using an incorrect selector');
      expect(summary).toContain('Test: "should submit form"');
      expect(summary).toContain('File: login.cy.ts');
    });

    it('should generate summary for PRODUCT_ISSUE verdict', () => {
      const response: OpenAIResponse = {
        verdict: 'PRODUCT_ISSUE',
        reasoning: 'The API returned a 500 error indicating a server-side bug.',
        indicators: ['500 error', 'server bug'],
      };
      const errorData: ErrorData = {
        message: 'API error',
        framework: 'cypress',
      };

      const summary = generateAnalysisSummary(response, errorData);

      expect(summary).toContain('🐛 Product Issue');
      expect(summary).toContain('The API returned a 500 error');
    });

    it('should include screenshot count when available', () => {
      const response: OpenAIResponse = {
        verdict: 'TEST_ISSUE',
        reasoning: 'Test timing issue detected.',
        indicators: ['timeout'],
      };
      const errorData: ErrorData = {
        message: 'Timeout error',
        framework: 'cypress',
        screenshots: [
          { name: 'failure1.png', path: '/tmp/failure1.png' },
          { name: 'failure2.png', path: '/tmp/failure2.png' },
        ],
      };

      const summary = generateAnalysisSummary(response, errorData);

      expect(summary).toContain('2 screenshot(s) analyzed');
    });

    it('should handle missing optional error data fields', () => {
      const response: OpenAIResponse = {
        verdict: 'TEST_ISSUE',
        reasoning: 'Generic test failure.',
        indicators: [],
      };
      const errorData: ErrorData = {
        message: 'Test failed',
        framework: 'unknown',
      };

      const summary = generateAnalysisSummary(response, errorData);

      expect(summary).toContain('🧪 Test Issue');
      expect(summary).not.toContain('Test:');
      expect(summary).not.toContain('File:');
    });

    it('should truncate very long summaries', () => {
      const longReasoning = 'This is a very detailed reasoning. '.repeat(100);
      const response: OpenAIResponse = {
        verdict: 'TEST_ISSUE',
        reasoning: longReasoning,
        indicators: [],
      };
      const errorData: ErrorData = {
        message: 'Test failed',
        framework: 'cypress',
      };

      const summary = generateAnalysisSummary(response, errorData);

      // Should be truncated to max length
      expect(summary.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('generateFixSummary', () => {
    const baseContext: RepairContext = {
      testFile: 'cypress/e2e/login.cy.ts',
      testName: 'should submit login form',
      errorMessage: 'Element not found',
      errorType: 'ELEMENT_NOT_FOUND',
      workflowRunId: '12345',
      jobName: 'cypress-tests',
      repository: 'owner/repo',
    };

    it('should generate fix summary with all sections', () => {
      const recommendation = {
        confidence: 85,
        reasoning: 'The selector needs to be updated to match the new component structure.',
        rootCause: 'Selector mismatch after UI refactor',
        changes: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 25,
            oldCode: 'cy.get("[data-testid=submit]")',
            newCode: 'cy.get("[data-testid=submit-button]")',
            justification: 'The data-testid was renamed in the latest UI update',
          },
        ],
        evidence: ['Selector found in error message', 'Component was modified in PR'],
      };

      const summary = generateFixSummary(recommendation, baseContext, false);

      expect(summary).toContain('🔧 Fix Recommendation');
      expect(summary).toContain('should submit login form');
      expect(summary).toContain('ELEMENT_NOT_FOUND');
      expect(summary).toContain('Confidence: 85%');
      expect(summary).toContain('Selector mismatch after UI refactor');
      expect(summary).toContain('Change 1');
      expect(summary).toContain('cypress/e2e/login.cy.ts');
      expect(summary).toContain('submit-button');
      expect(summary).toContain('Supporting Evidence');
    });

    it('should include code blocks when requested', () => {
      const recommendation = {
        confidence: 80,
        reasoning: 'Update required',
        rootCause: 'Selector changed',
        changes: [
          {
            file: 'test.cy.ts',
            oldCode: 'old code',
            newCode: 'new code',
            justification: 'Updated selector',
          },
        ],
        evidence: [],
      };

      const summary = generateFixSummary(recommendation, baseContext, true);

      expect(summary).toContain('```typescript');
      expect(summary).toContain('old code');
      expect(summary).toContain('new code');
    });

    it('should handle context with errorSelector', () => {
      const contextWithSelector: RepairContext = {
        ...baseContext,
        errorSelector: '[data-testid="submit"]',
      };
      const recommendation = {
        confidence: 75,
        reasoning: 'Selector issue',
        rootCause: 'Wrong selector',
        changes: [],
        evidence: [],
      };

      const summary = generateFixSummary(recommendation, contextWithSelector, false);

      expect(summary).toContain('Failed Selector:');
      expect(summary).toContain('[data-testid="submit"]');
    });

    it('should handle empty changes array', () => {
      const recommendation = {
        confidence: 60,
        reasoning: 'Analysis complete but no specific fix identified',
        rootCause: 'Unknown',
        changes: [],
        evidence: [],
      };

      const summary = generateFixSummary(recommendation, baseContext, false);

      expect(summary).toContain('🔧 Fix Recommendation');
      expect(summary).not.toContain('Change 1');
    });

    it('should include disclaimer about automated recommendations', () => {
      const recommendation = {
        confidence: 80,
        reasoning: 'Fix identified',
        rootCause: 'Known issue',
        changes: [],
        evidence: [],
      };

      const summary = generateFixSummary(recommendation, baseContext, false);

      expect(summary).toContain('automated fix recommendation');
      expect(summary).toContain('review before applying');
    });
  });

  describe('createBriefSummary', () => {
    it('should create brief summary for TEST_ISSUE', () => {
      const brief = createBriefSummary(
        'TEST_ISSUE',
        85,
        'This is a detailed summary about the test failure.',
        'should submit form'
      );

      expect(brief).toContain('TEST_ISSUE');
      expect(brief).toContain('85%');
    });

    it('should create brief summary for PRODUCT_ISSUE', () => {
      const brief = createBriefSummary(
        'PRODUCT_ISSUE',
        90,
        'The API is returning 500 errors.',
        'API test'
      );

      expect(brief).toContain('PRODUCT_ISSUE');
      expect(brief).toContain('90%');
    });

    it('should handle missing test name', () => {
      const brief = createBriefSummary(
        'TEST_ISSUE',
        75,
        'Summary without test name'
      );

      expect(brief).toContain('TEST_ISSUE');
      expect(brief).toContain('75%');
    });

    it('should truncate long summaries', () => {
      const longSummary = 'This is a very long summary. '.repeat(50);
      const brief = createBriefSummary(
        'TEST_ISSUE',
        80,
        longSummary,
        'test name'
      );

      expect(brief.length).toBeLessThanOrEqual(500);
    });
  });

  describe('formatVerdict', () => {
    it('should format TEST_ISSUE with test emoji', () => {
      const formatted = formatVerdict('TEST_ISSUE');
      expect(formatted).toBe('🧪 Test Issue');
    });

    it('should format PRODUCT_ISSUE with bug emoji', () => {
      const formatted = formatVerdict('PRODUCT_ISSUE');
      expect(formatted).toBe('🐛 Product Issue');
    });
  });
});
