import { inferRootCauseCategoryFromText } from '../../src/repair/root-cause-category';
import type { RootCauseCategory } from '../../src/agents/analysis-agent';

describe('inferRootCauseCategoryFromText', () => {
  describe('representative messages per category', () => {
    const cases: Array<[string, RootCauseCategory]> = [
      // SELECTOR_MISMATCH
      ['no such element: Unable to locate element', 'SELECTOR_MISMATCH'],
      ['expected to find element `[data-testid=submit]`', 'SELECTOR_MISMATCH'],
      ['querySelector returned null for .save-button', 'SELECTOR_MISMATCH'],
      // TIMING_ISSUE
      ['Timeout of 30000ms exceeded', 'TIMING_ISSUE'],
      ['race condition between page load and click', 'TIMING_ISSUE'],
      ['element was not ready when the click fired', 'TIMING_ISSUE'],
      // NETWORK_ISSUE
      ['Request failed with status code 500', 'NETWORK_ISSUE'],
      ['GraphQL mutation returned errors', 'NETWORK_ISSUE'],
      ['connect ECONNREFUSED 127.0.0.1:4000', 'NETWORK_ISSUE'],
      // DATA_DEPENDENCY
      ['fixture user could not be loaded', 'DATA_DEPENDENCY'],
      ['test data was never created for this org', 'DATA_DEPENDENCY'],
      // ELEMENT_VISIBILITY
      ['element is covered by another element', 'ELEMENT_VISIBILITY'],
      ['button is not clickable at point (100, 200)', 'ELEMENT_VISIBILITY'],
      // ASSERTION_MISMATCH
      ['AssertionError: values mismatch', 'ASSERTION_MISMATCH'],
      ['expected 5 to equal 6', 'ASSERTION_MISMATCH'],
      // STATE_DEPENDENCY
      ['user was not authenticated before the flow began', 'STATE_DEPENDENCY'],
      ['login precondition was never satisfied', 'STATE_DEPENDENCY'],
      // ENVIRONMENT_ISSUE
      ['browser crash detected mid-run', 'ENVIRONMENT_ISSUE'],
      ['Sauce Labs infrastructure outage', 'ENVIRONMENT_ISSUE'],
      ['session finished before the spec completed', 'ENVIRONMENT_ISSUE'],
    ];

    it.each(cases)('classifies %j as %s', (text, expected) => {
      expect(inferRootCauseCategoryFromText(text)).toBe(expected);
    });
  });

  it('is case-insensitive (input is lowercased before matching)', () => {
    expect(inferRootCauseCategoryFromText('TIMEOUT OF 5000MS EXCEEDED')).toBe(
      'TIMING_ISSUE'
    );
    expect(inferRootCauseCategoryFromText('NO SUCH ELEMENT')).toBe(
      'SELECTOR_MISMATCH'
    );
  });

  describe('order sensitivity: first matching category wins', () => {
    it('selector beats timing when a timeout message mentions a selector', () => {
      expect(
        inferRootCauseCategoryFromText(
          'Timeout waiting for selector [data-testid=submit]'
        )
      ).toBe('SELECTOR_MISMATCH');
    });

    it('timing beats network when a timeout message mentions the network', () => {
      expect(
        inferRootCauseCategoryFromText(
          'Timeout waiting for network request to complete'
        )
      ).toBe('TIMING_ISSUE');
    });

    it('visibility beats assertion when an expect message mentions hidden/visible', () => {
      expect(
        inferRootCauseCategoryFromText(
          'element is hidden, expected it to be visible'
        )
      ).toBe('ELEMENT_VISIBILITY');
    });

    it('text patterns take precedence over the errorType hint', () => {
      expect(
        inferRootCauseCategoryFromText('unable to locate element', 'TIMEOUT')
      ).toBe('SELECTOR_MISMATCH');
    });
  });

  describe('errorType fallback when no text pattern matches', () => {
    const fallbacks: Array<[string, RootCauseCategory]> = [
      ['ELEMENT_NOT_FOUND', 'SELECTOR_MISMATCH'],
      ['TIMEOUT', 'TIMING_ISSUE'],
      ['ASSERTION_FAILED', 'ASSERTION_MISMATCH'],
      ['NETWORK_ERROR', 'NETWORK_ISSUE'],
      ['ELEMENT_NOT_VISIBLE', 'ELEMENT_VISIBILITY'],
      ['ELEMENT_COVERED', 'ELEMENT_VISIBILITY'],
      ['ELEMENT_DETACHED', 'ELEMENT_VISIBILITY'],
    ];

    it.each(fallbacks)('maps errorType %s to %s', (errorType, expected) => {
      expect(inferRootCauseCategoryFromText('zzz', errorType)).toBe(expected);
    });

    it('returns UNKNOWN for an unrecognized errorType', () => {
      expect(inferRootCauseCategoryFromText('zzz', 'SOMETHING_ELSE')).toBe(
        'UNKNOWN'
      );
    });
  });

  describe('edge inputs', () => {
    it('returns UNKNOWN for empty text with no errorType', () => {
      expect(inferRootCauseCategoryFromText('')).toBe('UNKNOWN');
    });

    it('falls back to errorType for empty text', () => {
      expect(inferRootCauseCategoryFromText('', 'TIMEOUT')).toBe(
        'TIMING_ISSUE'
      );
    });

    it('returns UNKNOWN for unmatched text with no errorType', () => {
      expect(inferRootCauseCategoryFromText('zzz')).toBe('UNKNOWN');
    });
  });
});
