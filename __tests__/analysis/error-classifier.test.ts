import {
  classifyErrorType,
  categorizeTestIssue,
  extractSelector,
  extractTestIssueEvidence,
} from '../../src/analysis/error-classifier';
import { ERROR_TYPES, TEST_ISSUE_CATEGORIES } from '../../src/config/constants';

describe('error-classifier', () => {
  describe('classifyErrorType', () => {
    it('should classify ELEMENT_NOT_FOUND errors', () => {
      expect(classifyErrorType('Expected to find element [data-testid="submit"]'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_FOUND);
      expect(classifyErrorType('Could not find element'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_FOUND);
      expect(classifyErrorType('element not found'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_FOUND);
      expect(classifyErrorType('never found it'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_FOUND);
    });

    it('should classify ELEMENT_NOT_VISIBLE errors', () => {
      expect(classifyErrorType('Element is not visible'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_VISIBLE);
      expect(classifyErrorType('visibility: hidden detected'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_VISIBLE);
      expect(classifyErrorType('element exists but is not visible'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_VISIBLE);
    });

    it('should classify ELEMENT_COVERED errors', () => {
      expect(classifyErrorType('element is covered by another element'))
        .toBe(ERROR_TYPES.ELEMENT_COVERED);
      expect(classifyErrorType('covered by another element'))
        .toBe(ERROR_TYPES.ELEMENT_COVERED);
    });

    it('should classify ELEMENT_DETACHED errors', () => {
      expect(classifyErrorType('element is detached from the DOM'))
        .toBe(ERROR_TYPES.ELEMENT_DETACHED);
      expect(classifyErrorType('detached from the dom'))
        .toBe(ERROR_TYPES.ELEMENT_DETACHED);
    });

    it('should classify INVALID_ELEMENT_TYPE errors', () => {
      expect(classifyErrorType('can only be called on a single element'))
        .toBe(ERROR_TYPES.INVALID_ELEMENT_TYPE);
      expect(classifyErrorType('invalid element type'))
        .toBe(ERROR_TYPES.INVALID_ELEMENT_TYPE);
    });

    it('should classify TIMEOUT errors', () => {
      expect(classifyErrorType('Timed out after 10000ms'))
        .toBe(ERROR_TYPES.TIMEOUT);
      expect(classifyErrorType('TimeoutError: Operation timed out'))
        .toBe(ERROR_TYPES.TIMEOUT);
      expect(classifyErrorType('timeout of 5000ms exceeded'))
        .toBe(ERROR_TYPES.TIMEOUT);
    });

    it('should classify ASSERTION_FAILED errors', () => {
      expect(classifyErrorType('AssertionError: expected true'))
        .toBe(ERROR_TYPES.ASSERTION_FAILED);
      expect(classifyErrorType('expected "foo" to equal "bar"'))
        .toBe(ERROR_TYPES.ASSERTION_FAILED);
      expect(classifyErrorType('assert.equal failed'))
        .toBe(ERROR_TYPES.ASSERTION_FAILED);
      expect(classifyErrorType('to be truthy'))
        .toBe(ERROR_TYPES.ASSERTION_FAILED);
    });

    it('should classify NETWORK_ERROR', () => {
      expect(classifyErrorType('Network error occurred'))
        .toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(classifyErrorType('fetch failed'))
        .toBe(ERROR_TYPES.NETWORK_ERROR);
      expect(classifyErrorType('ERR_NETWORK'))
        .toBe(ERROR_TYPES.NETWORK_ERROR);
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      expect(classifyErrorType('Something went wrong'))
        .toBe(ERROR_TYPES.UNKNOWN);
      expect(classifyErrorType('Generic error message'))
        .toBe(ERROR_TYPES.UNKNOWN);
    });

    it('should handle case insensitivity', () => {
      expect(classifyErrorType('TIMED OUT AFTER 5000MS'))
        .toBe(ERROR_TYPES.TIMEOUT);
      expect(classifyErrorType('ELEMENT NOT FOUND'))
        .toBe(ERROR_TYPES.ELEMENT_NOT_FOUND);
    });
  });

  describe('categorizeTestIssue', () => {
    it('should categorize ELEMENT_NOT_FOUND issues', () => {
      expect(categorizeTestIssue('element was not found'))
        .toBe(TEST_ISSUE_CATEGORIES.ELEMENT_NOT_FOUND);
      expect(categorizeTestIssue('could not find element'))
        .toBe(TEST_ISSUE_CATEGORIES.ELEMENT_NOT_FOUND);
      expect(categorizeTestIssue('never found the element'))
        .toBe(TEST_ISSUE_CATEGORIES.ELEMENT_NOT_FOUND);
    });

    it('should categorize TIMEOUT issues', () => {
      expect(categorizeTestIssue('timeout after 10000ms'))
        .toBe(TEST_ISSUE_CATEGORIES.TIMEOUT);
      expect(categorizeTestIssue('Timed out waiting for element'))
        .toBe(TEST_ISSUE_CATEGORIES.TIMEOUT);
    });

    it('should categorize VISIBILITY issues', () => {
      expect(categorizeTestIssue('element is not visible'))
        .toBe(TEST_ISSUE_CATEGORIES.VISIBILITY);
      expect(categorizeTestIssue('visibility hidden'))
        .toBe(TEST_ISSUE_CATEGORIES.VISIBILITY);
      expect(categorizeTestIssue('element is covered'))
        .toBe(TEST_ISSUE_CATEGORIES.VISIBILITY);
      expect(categorizeTestIssue('element is hidden'))
        .toBe(TEST_ISSUE_CATEGORIES.VISIBILITY);
    });

    it('should categorize ASSERTION issues', () => {
      expect(categorizeTestIssue('assertion failed'))
        .toBe(TEST_ISSUE_CATEGORIES.ASSERTION);
      expect(categorizeTestIssue('expected foo to equal bar'))
        .toBe(TEST_ISSUE_CATEGORIES.ASSERTION);
    });

    it('should categorize NETWORK issues', () => {
      expect(categorizeTestIssue('network error'))
        .toBe(TEST_ISSUE_CATEGORIES.NETWORK);
      expect(categorizeTestIssue('fetch failed'))
        .toBe(TEST_ISSUE_CATEGORIES.NETWORK);
      expect(categorizeTestIssue('API request failed'))
        .toBe(TEST_ISSUE_CATEGORIES.NETWORK);
    });

    it('should return UNKNOWN for unrecognized issues', () => {
      expect(categorizeTestIssue('some random error'))
        .toBe(TEST_ISSUE_CATEGORIES.UNKNOWN);
    });
  });

  describe('extractSelector', () => {
    it('should extract data-testid selectors', () => {
      expect(extractSelector('Expected to find element [data-testid="submit-button"]'))
        .toBe('[data-testid="submit-button"]');
      expect(extractSelector("Expected to find element [data-testid='login-form']"))
        .toBe("[data-testid='login-form']");
    });

    it('should extract data-test selectors', () => {
      expect(extractSelector('Element [data-test="user-profile"] not found'))
        .toBe('[data-test="user-profile"]');
    });

    it('should extract aria-label selectors', () => {
      expect(extractSelector('Could not find [aria-label="Close dialog"]'))
        .toBe('[aria-label="Close dialog"]');
    });

    it('should extract alt attribute selectors', () => {
      expect(extractSelector('Image [alt="Logo"] not visible'))
        .toBe('[alt="Logo"]');
    });

    it('should extract class selectors', () => {
      expect(extractSelector('Element .btn-primary not found'))
        .toBe('.btn-primary');
    });

    it('should extract ID selectors', () => {
      expect(extractSelector('Element #submit-form not found'))
        .toBe('#submit-form');
    });

    it('should extract complex/compound selectors', () => {
      const error = 'button[data-testid="submit"] not found';
      const result = extractSelector(error);
      expect(result).toContain('data-testid');
    });

    it('should return undefined when no selector found', () => {
      expect(extractSelector('Generic error without selector'))
        .toBeUndefined();
      expect(extractSelector(''))
        .toBeUndefined();
    });

    it('should extract first selector when multiple present', () => {
      const error = 'Expected [data-testid="first"] or [data-testid="second"]';
      const result = extractSelector(error);
      expect(result).toContain('first');
    });
  });

  describe('extractTestIssueEvidence', () => {
    it('should extract selector from error message', () => {
      const evidence = extractTestIssueEvidence(
        'Expected to find element [data-testid="submit"]'
      );
      expect(evidence).toContainEqual(expect.stringContaining('Selector involved'));
    });

    it('should extract timeout value', () => {
      const evidence = extractTestIssueEvidence(
        'Timed out after 10000ms waiting for element'
      );
      expect(evidence).toContainEqual(expect.stringContaining('10000ms'));
    });

    it('should detect visibility issues', () => {
      const evidence = extractTestIssueEvidence(
        'Element exists but is not visible'
      );
      expect(evidence).toContainEqual(expect.stringContaining('visibility issue'));
    });

    it('should detect async/timing issues', () => {
      const evidence = extractTestIssueEvidence(
        'Promise rejected before await completed'
      );
      expect(evidence).toContainEqual(expect.stringContaining('async/timing'));
    });

    it('should handle display: none', () => {
      const evidence = extractTestIssueEvidence(
        'Element has display: none'
      );
      expect(evidence).toContainEqual(expect.stringContaining('visibility'));
    });

    it('should handle covered elements', () => {
      const evidence = extractTestIssueEvidence(
        'Element is covered by another element'
      );
      expect(evidence).toContainEqual(expect.stringContaining('visibility'));
    });

    it('should return empty array for generic errors', () => {
      const evidence = extractTestIssueEvidence('Generic error occurred');
      expect(evidence).toEqual([]);
    });

    it('should extract multiple evidence pieces', () => {
      const evidence = extractTestIssueEvidence(
        'Timed out after 5000ms waiting for [data-testid="btn"] - element not visible'
      );

      // Should have multiple pieces of evidence
      expect(evidence.length).toBeGreaterThanOrEqual(2);
      expect(evidence.some(e => e.includes('5000ms'))).toBe(true);
      expect(evidence.some(e => e.includes('Selector') || e.includes('visibility'))).toBe(true);
    });

    it('should detect hidden elements', () => {
      const evidence = extractTestIssueEvidence('Element is hidden behind overlay');
      expect(evidence).toContainEqual(expect.stringContaining('visibility'));
    });
  });
});
