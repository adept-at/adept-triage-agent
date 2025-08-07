import { RepairContext, AnalysisResult } from '../src/types';
import {
  classifyErrorType,
  extractSelector,
  buildRepairContext,
  enhanceAnalysisWithRepairContext
} from '../src/repair-context';

describe('RepairContext', () => {
  describe('RepairContext Type Structure', () => {
    it('should have all required location information fields', () => {
      const repairContext: RepairContext = {
        // Location information
        testFile: 'cypress/e2e/auth/login.cy.ts',
        errorLine: 47,
        testName: 'should login successfully',

        // Failure identification
        errorType: 'ELEMENT_NOT_FOUND',
        errorSelector: '.submit-btn',
        errorMessage: 'Expected to find element: .submit-btn, but never found it.',

        // Repository context
        workflowRunId: '123456789',
        jobName: 'cypress-tests',
        commitSha: 'abc123def456',
        branch: 'feature/new-login',
        repository: 'Adept/lib-cypress-canary',

        // Optional PR context
        prNumber: '42',
        targetAppPrNumber: '100'
      };

      expect(repairContext.testFile).toBe('cypress/e2e/auth/login.cy.ts');
      expect(repairContext.errorLine).toBe(47);
      expect(repairContext.testName).toBe('should login successfully');
      expect(repairContext.errorType).toBe('ELEMENT_NOT_FOUND');
      expect(repairContext.errorSelector).toBe('.submit-btn');
      expect(repairContext.errorMessage).toContain('Expected to find element');
      expect(repairContext.workflowRunId).toBe('123456789');
      expect(repairContext.jobName).toBe('cypress-tests');
      expect(repairContext.commitSha).toBe('abc123def456');
      expect(repairContext.branch).toBe('feature/new-login');
      expect(repairContext.repository).toBe('Adept/lib-cypress-canary');
      expect(repairContext.prNumber).toBe('42');
      expect(repairContext.targetAppPrNumber).toBe('100');
    });

    it('should allow optional fields to be undefined', () => {
      const minimalContext: RepairContext = {
        testFile: 'cypress/e2e/test.cy.ts',
        testName: 'test name',
        errorType: 'UNKNOWN',
        errorMessage: 'Some error',
        workflowRunId: '123',
        jobName: 'test-job',
        commitSha: 'sha123',
        branch: 'main',
        repository: 'org/repo'
      };

      expect(minimalContext.errorLine).toBeUndefined();
      expect(minimalContext.errorSelector).toBeUndefined();
      expect(minimalContext.prNumber).toBeUndefined();
      expect(minimalContext.targetAppPrNumber).toBeUndefined();
    });
  });

  describe('classifyErrorType', () => {
    it('should classify ELEMENT_NOT_FOUND errors correctly', () => {
      const errors = [
        'Expected to find element: .submit-btn, but never found it.',
        'CypressError: Timed out retrying after 4000ms: Expected to find element: `[data-testid="login"]`, but never found it.',
        'element not found: Unable to locate element',
        'Could not find element with selector [data-test="button"]'
      ];

      errors.forEach(error => {
        expect(classifyErrorType(error)).toBe('ELEMENT_NOT_FOUND');
      });
    });

    it('should classify TIMEOUT errors correctly', () => {
      const errors = [
        'Timed out retrying after 10000ms',
        'TimeoutError: Waiting for element to be visible',
        'The operation timed out',
        'Cypress command timeout of 4000ms exceeded'
      ];

      errors.forEach(error => {
        expect(classifyErrorType(error)).toBe('TIMEOUT');
      });
    });

    it('should classify ASSERTION_FAILED errors correctly', () => {
      const errors = [
        'AssertionError: expected true to equal false',
        'expected "Hello" to equal "World"',
        'assert.equal failed',
        'Expected value to be truthy'
      ];

      errors.forEach(error => {
        expect(classifyErrorType(error)).toBe('ASSERTION_FAILED');
      });
    });

    it('should classify NETWORK_ERROR correctly', () => {
      const errors = [
        'Network request failed',
        'Failed to fetch resource',
        'ERR_NETWORK_FAILURE',
        'fetch failed with status 500'
      ];

      errors.forEach(error => {
        expect(classifyErrorType(error)).toBe('NETWORK_ERROR');
      });
    });

    it('should classify ELEMENT_NOT_VISIBLE correctly', () => {
      const errors = [
        'Element is not visible',
        'This element `<button>` is not visible',
        'Element exists but is not visible',
        'visibility: hidden'
      ];

      errors.forEach(error => {
        expect(classifyErrorType(error)).toBe('ELEMENT_NOT_VISIBLE');
      });
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      const errors = [
        'Some random error',
        'Undefined is not a function',
        'Cannot read property of null'
      ];

      errors.forEach(error => {
        expect(classifyErrorType(error)).toBe('UNKNOWN');
      });
    });

    it('should handle case variations', () => {
      expect(classifyErrorType('EXPECTED TO FIND ELEMENT')).toBe('ELEMENT_NOT_FOUND');
      expect(classifyErrorType('timed OUT')).toBe('TIMEOUT');
      expect(classifyErrorType('ASSERTIONERROR')).toBe('ASSERTION_FAILED');
    });
  });

  describe('extractSelector', () => {
    it('should extract data-testid selectors', () => {
      const errors = [
        {
          error: 'Expected to find element: [data-testid="submit-button"]',
          expected: '[data-testid="submit-button"]'
        },
        {
          error: "Could not find [data-testid='login-form']",
          expected: "[data-testid='login-form']"
        },
        {
          error: 'Element [data-testid="user-profile"] not found',
          expected: '[data-testid="user-profile"]'
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should extract data-test selectors', () => {
      const errors = [
        {
          error: 'Expected to find element: [data-test="submit"]',
          expected: '[data-test="submit"]'
        },
        {
          error: "Element [data-test='form'] is not visible",
          expected: "[data-test='form']"
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should extract class selectors', () => {
      const errors = [
        {
          error: 'Expected to find element: .submit-button',
          expected: '.submit-button'
        },
        {
          error: 'Element .login-form not found',
          expected: '.login-form'
        },
        {
          error: 'Could not interact with .btn-primary',
          expected: '.btn-primary'
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should extract ID selectors', () => {
      const errors = [
        {
          error: 'Expected to find element: #submit-button',
          expected: '#submit-button'
        },
        {
          error: 'Element #login-form not visible',
          expected: '#login-form'
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should extract alt attribute selectors', () => {
      const errors = [
        {
          error: 'Could not find image [alt="Logo"]',
          expected: '[alt="Logo"]'
        },
        {
          error: "Element [alt='Profile Picture'] not found",
          expected: "[alt='Profile Picture']"
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should extract aria-label selectors', () => {
      const errors = [
        {
          error: 'Expected to find element: [aria-label="Close dialog"]',
          expected: '[aria-label="Close dialog"]'
        },
        {
          error: "Button [aria-label='Submit form'] not clickable",
          expected: "[aria-label='Submit form']"
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should extract complex/compound selectors', () => {
      const errors = [
        {
          error: 'Expected to find element: button[data-testid="submit"]',
          expected: 'button[data-testid="submit"]'
        },
        {
          error: 'Could not find div.container > button.submit',
          expected: 'div.container > button.submit'
        },
        {
          error: 'Element form#login input[type="email"] not found',
          expected: 'input[type="email"]'
        }
      ];

      errors.forEach(({ error, expected }) => {
        expect(extractSelector(error)).toBe(expected);
      });
    });

    it('should return undefined when no selector is found', () => {
      const errors = [
        'Generic error message',
        'Test failed',
        'Unexpected behavior',
        'Something went wrong'
      ];

      errors.forEach(error => {
        expect(extractSelector(error)).toBeUndefined();
      });
    });

    it('should handle selectors with special characters', () => {
      expect(extractSelector('Element .btn-primary-2 not found')).toBe('.btn-primary-2');
      expect(extractSelector('Could not find #user_name')).toBe('#user_name');
      expect(extractSelector('Element .nav__item--active missing')).toBe('.nav__item--active');
    });

    it('should extract the first selector when multiple are present', () => {
      const error = 'Expected .button or #submit or [data-testid="submit"]';
      const selector = extractSelector(error);
      expect(selector).toBe('[data-testid="submit"]'); // data-testid has priority
    });
  });

  describe('buildRepairContext', () => {
    it('should build complete repair context from analysis data', () => {
      const analysisData = {
        testFile: 'cypress/e2e/auth/login.cy.ts',
        errorLine: 42,
        testName: 'should login successfully',
        errorMessage: 'Expected to find element: [data-testid="submit"], but never found it.',
        workflowRunId: '789456123',
        jobName: 'e2e-tests',
        commitSha: 'def789abc123',
        branch: 'main',
        repository: 'Adept/lib-cypress-canary',
        prNumber: '55',
        targetAppPrNumber: '200'
      };

      const context = buildRepairContext(analysisData);

      expect(context.testFile).toBe('cypress/e2e/auth/login.cy.ts');
      expect(context.errorLine).toBe(42);
      expect(context.testName).toBe('should login successfully');
      expect(context.errorType).toBe('ELEMENT_NOT_FOUND');
      expect(context.errorSelector).toBe('[data-testid="submit"]');
      expect(context.errorMessage).toContain('Expected to find element');
      expect(context.workflowRunId).toBe('789456123');
      expect(context.jobName).toBe('e2e-tests');
      expect(context.commitSha).toBe('def789abc123');
      expect(context.branch).toBe('main');
      expect(context.repository).toBe('Adept/lib-cypress-canary');
      expect(context.prNumber).toBe('55');
      expect(context.targetAppPrNumber).toBe('200');
    });

    it('should handle missing optional fields', () => {
      const analysisData = {
        testFile: 'cypress/e2e/test.cy.ts',
        testName: 'test',
        errorMessage: 'Some error occurred',
        workflowRunId: '123',
        jobName: 'test',
        commitSha: 'abc',
        branch: 'main',
        repository: 'org/repo'
      };

      const context = buildRepairContext(analysisData);

      expect(context.errorLine).toBeUndefined();
      expect(context.errorSelector).toBeUndefined();
      expect(context.prNumber).toBeUndefined();
      expect(context.targetAppPrNumber).toBeUndefined();
      expect(context.errorType).toBe('UNKNOWN');
    });

    it('should extract complex error information', () => {
      const analysisData = {
        testFile: 'cypress/e2e/complex.cy.ts',
        errorLine: 100,
        testName: 'complex test',
        errorMessage: 'AssertionError: Timed out retrying after 4000ms: Expected to find element: `.btn-primary`, but never found it. The element may be hidden or not visible.',
        workflowRunId: '999',
        jobName: 'complex-job',
        commitSha: 'xyz123',
        branch: 'develop',
        repository: 'org/repo'
      };

      const context = buildRepairContext(analysisData);

      expect(context.errorType).toBe('ELEMENT_NOT_FOUND'); // Should prioritize element not found over timeout
      expect(context.errorSelector).toBe('.btn-primary');
    });
  });

  describe('enhanceAnalysisWithRepairContext', () => {
    it('should add repair context to TEST_ISSUE verdict', () => {
      const analysisResult: AnalysisResult = {
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test failed due to element not found',
        evidence: ['Expected to find element: .submit-btn'],
        suggestedAction: 'Fix test selector',
        category: 'UI_CHANGE'
      };

      const testData = {
        testFile: 'cypress/e2e/auth/login.cy.ts',
        errorLine: 42,
        testName: 'should login',
        errorMessage: 'Expected to find element: .submit-btn, but never found it.',
        workflowRunId: '123',
        jobName: 'cypress',
        commitSha: 'abc123',
        branch: 'main',
        repository: 'org/repo'
      };

      const enhanced = enhanceAnalysisWithRepairContext(analysisResult, testData);

      expect(enhanced.repairContext).toBeDefined();
      expect(enhanced.repairContext?.testFile).toBe('cypress/e2e/auth/login.cy.ts');
      expect(enhanced.repairContext?.errorType).toBe('ELEMENT_NOT_FOUND');
      expect(enhanced.repairContext?.errorSelector).toBe('.submit-btn');
    });

    it('should not add repair context to non-TEST_ISSUE verdicts', () => {
      // Only test with PRODUCT_ISSUE since Verdict type only has TEST_ISSUE and PRODUCT_ISSUE
      const analysisResult: AnalysisResult = {
        verdict: 'PRODUCT_ISSUE',
        confidence: 90,
        reasoning: 'Some reason',
        evidence: ['evidence'],
        suggestedAction: 'action',
        category: 'NETWORK'
      };

      const testData = {
        testFile: 'test.cy.ts',
        testName: 'test',
        errorMessage: 'error',
        workflowRunId: '123',
        jobName: 'job',
        commitSha: 'sha',
        branch: 'main',
        repository: 'repo'
      };

      const enhanced = enhanceAnalysisWithRepairContext(analysisResult, testData);

      expect(enhanced.repairContext).toBeUndefined();
    });

    it('should preserve all original analysis fields', () => {
      const analysisResult: AnalysisResult = {
        verdict: 'TEST_ISSUE',
        confidence: 95,
        reasoning: 'Clear test issue',
        evidence: ['evidence1', 'evidence2'],
        suggestedAction: 'Fix the test',
        category: 'UI_CHANGE',
        affectedTests: ['test1', 'test2'],
        patterns: { repeated: true }
      };

      const testData = {
        testFile: 'test.cy.ts',
        testName: 'test',
        errorMessage: 'error',
        workflowRunId: '123',
        jobName: 'job',
        commitSha: 'sha',
        branch: 'main',
        repository: 'repo'
      };

      const enhanced = enhanceAnalysisWithRepairContext(analysisResult, testData);

      expect(enhanced.verdict).toBe('TEST_ISSUE');
      expect(enhanced.confidence).toBe(95);
      expect(enhanced.reasoning).toBe('Clear test issue');
      expect(enhanced.evidence).toEqual(['evidence1', 'evidence2']);
      expect(enhanced.suggestedAction).toBe('Fix the test');
      expect(enhanced.category).toBe('UI_CHANGE');
      expect(enhanced.affectedTests).toEqual(['test1', 'test2']);
      expect(enhanced.patterns).toEqual({ repeated: true });
      expect(enhanced.repairContext).toBeDefined();
    });

    it('should handle edge cases in error messages', () => {
      const testCases = [
        {
          errorMessage: 'CypressError: cy.click() failed because this element is detached from the DOM.\n\n<button data-testid="submit">...</button>',
          expectedType: 'ELEMENT_DETACHED',
          expectedSelector: '[data-testid="submit"]'
        },
        {
          errorMessage: 'The element <input#email> is covered by another element',
          expectedType: 'ELEMENT_COVERED',
          expectedSelector: '#email'
        },
        {
          errorMessage: 'cy.type() can only be called on :text, :password, textarea or contenteditable elements. Your subject is a: <div class="editor">',
          expectedType: 'INVALID_ELEMENT_TYPE',
          expectedSelector: '.editor'
        }
      ];

      testCases.forEach(({ errorMessage, expectedType, expectedSelector }) => {
        const analysisResult: AnalysisResult = {
          verdict: 'TEST_ISSUE',
          confidence: 85,
          reasoning: 'Test issue detected',
          evidence: [errorMessage],
          suggestedAction: 'Fix test',
          category: 'UI_CHANGE'
        };

        const testData = {
          testFile: 'test.cy.ts',
          testName: 'test',
          errorMessage,
          workflowRunId: '123',
          jobName: 'job',
          commitSha: 'sha',
          branch: 'main',
          repository: 'repo'
        };

        const enhanced = enhanceAnalysisWithRepairContext(analysisResult, testData);

        expect(enhanced.repairContext?.errorType).toBe(expectedType);
        expect(enhanced.repairContext?.errorSelector).toBe(expectedSelector);
      });
    });
  });

  describe('Integration with existing analyzer', () => {
    it('should integrate repair context into analysis workflow', () => {
      // This test verifies that repair context can be properly integrated
      // with the existing analyzer workflow
      const mockAnalyzerOutput = {
        verdict: 'TEST_ISSUE',
        confidence: 90,
        reasoning: 'Element selector has changed',
        evidence: ['Expected to find element: .old-button'],
        suggestedAction: 'Update test selector',
        category: 'UI_CHANGE'
      };

      const workflowContext = {
        testFile: 'cypress/e2e/workflow.cy.ts',
        errorLine: 75,
        testName: 'workflow test',
        errorMessage: 'Expected to find element: .old-button, but never found it.',
        workflowRunId: '555',
        jobName: 'workflow-job',
        commitSha: 'workflow123',
        branch: 'feature/workflow',
        repository: 'Adept/test-repo',
        prNumber: '99'
      };

      const enhancedResult = enhanceAnalysisWithRepairContext(
        mockAnalyzerOutput as AnalysisResult,
        workflowContext
      );

      // Verify the repair context is properly attached
      expect(enhancedResult.repairContext).toBeDefined();
      expect(enhancedResult.repairContext?.testFile).toBe('cypress/e2e/workflow.cy.ts');
      expect(enhancedResult.repairContext?.errorLine).toBe(75);
      expect(enhancedResult.repairContext?.errorType).toBe('ELEMENT_NOT_FOUND');
      expect(enhancedResult.repairContext?.errorSelector).toBe('.old-button');
      
      // Verify original analysis is preserved
      expect(enhancedResult.verdict).toBe('TEST_ISSUE');
      expect(enhancedResult.confidence).toBe(90);
    });
  });
});
