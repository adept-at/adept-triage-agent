import { capArtifactLogs, buildStructuredSummary } from '../../src/services/log-processor';
import { ErrorData } from '../../src/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    runId: 12345,
    job: 'test-job',
    payload: {},
  },
}));

describe('log-processor', () => {
  describe('capArtifactLogs', () => {
    it('should return empty string for empty input', () => {
      expect(capArtifactLogs('')).toBe('');
    });

    it('should return clean string for short input', () => {
      const input = 'Short log message';
      expect(capArtifactLogs(input)).toBe(input);
    });

    it('should remove ANSI escape codes', () => {
      const input = '\x1b[31mError:\x1b[0m Something failed';
      const result = capArtifactLogs(input);
      expect(result).toBe('Error: Something failed');
    });

    it('should focus on error-related lines for large logs', () => {
      const lines = [];
      // Add 100 lines of normal logs
      for (let i = 0; i < 100; i++) {
        lines.push(`Line ${i}: Normal log message`);
      }
      // Add error context
      lines.push('Context before error');
      lines.push('ERROR: Something failed here');
      lines.push('Context after error');
      // Add more normal lines
      for (let i = 0; i < 100; i++) {
        lines.push(`Line ${i + 200}: More normal logs`);
      }

      const input = lines.join('\n');
      const result = capArtifactLogs(input);

      // Should contain the error line
      expect(result).toContain('ERROR: Something failed here');
    });

    it('should handle logs with multiple error patterns', () => {
      const lines = [
        'Starting test...',
        'FAILURE: Test assertion failed',
        'More context',
        'Another line',
        'TIMEOUT: Operation timed out',
        'End of logs',
      ];
      const input = lines.join('\n');
      const result = capArtifactLogs(input);

      expect(result).toContain('FAILURE');
      expect(result).toContain('TIMEOUT');
    });

    it('should use head/tail truncation when no errors found in large logs', () => {
      // Create logs larger than the soft cap (20KB) without error patterns
      const longLine = 'Normal log line without any special patterns. '.repeat(100);
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push(`${i}: ${longLine}`);
      }
      const input = lines.join('\n');
      const result = capArtifactLogs(input);

      // Should contain truncation indicator
      expect(result).toContain('truncated');
    });
  });

  describe('buildStructuredSummary', () => {
    it('should detect timeout errors', () => {
      const errorData: ErrorData = {
        message: 'Timed out after 10000ms waiting for element',
        framework: 'cypress',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasTimeoutErrors).toBe(true);
      expect(summary.failureIndicators.hasLongTimeout).toBe(true);
    });

    it('should detect assertion errors', () => {
      const errorData: ErrorData = {
        message: 'AssertionError: Expected "foo" to equal "bar"',
        framework: 'jest',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasAssertionErrors).toBe(true);
    });

    it('should detect DOM/element errors', () => {
      const errorData: ErrorData = {
        message: 'Expected to find element [data-testid="submit"], but never found it',
        framework: 'cypress',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasDOMErrors).toBe(true);
      expect(summary.failureIndicators.hasElementExistenceCheck).toBe(true);
    });

    it('should detect network errors', () => {
      const errorData: ErrorData = {
        message: 'GraphQL API returned 500 error',
        framework: 'cypress',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasNetworkErrors).toBe(true);
    });

    it('should detect null pointer errors', () => {
      const errorData: ErrorData = {
        message: 'TypeError: Cannot read properties of null (reading "value")',
        framework: 'jest',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasNullPointerErrors).toBe(true);
    });

    it('should detect visibility issues', () => {
      const errorData: ErrorData = {
        message: 'Element exists but is not visible or covered by another element',
        framework: 'cypress',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasVisibilityIssue).toBe(true);
    });

    it('should detect alt text selectors', () => {
      const errorData: ErrorData = {
        message: 'Expected to find element [alt="Submit button"], but never found it',
        framework: 'cypress',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.failureIndicators.hasAltTextSelector).toBe(true);
    });

    it('should include test context from ErrorData', () => {
      const errorData: ErrorData = {
        message: 'Test failed',
        framework: 'cypress',
        testName: 'should submit form',
        fileName: 'login.cy.ts',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.testContext.testName).toBe('should submit form');
      expect(summary.testContext.testFile).toBe('login.cy.ts');
      expect(summary.testContext.framework).toBe('cypress');
    });

    it('should include screenshot metrics when available', () => {
      const errorData: ErrorData = {
        message: 'Test failed',
        framework: 'cypress',
        screenshots: [
          { name: 'failure.png', path: '/tmp/failure.png' },
          { name: 'before.png', path: '/tmp/before.png' },
        ],
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.keyMetrics.hasScreenshots).toBe(true);
    });

    it('should calculate log size correctly', () => {
      const errorData: ErrorData = {
        message: 'Test failed',
        framework: 'cypress',
        logs: ['First log entry', 'Second log entry'],
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.keyMetrics.logSize).toBe(31); // Length of both log entries
    });

    it('should handle missing optional fields', () => {
      const errorData: ErrorData = {
        message: 'Test failed',
        framework: 'unknown',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.testContext.testName).toBe('unknown');
      expect(summary.testContext.testFile).toBe('unknown');
      expect(summary.keyMetrics.hasScreenshots).toBe(false);
      expect(summary.keyMetrics.logSize).toBe(0);
    });

    it('should truncate long error messages', () => {
      const longMessage = 'A'.repeat(1000);
      const errorData: ErrorData = {
        message: longMessage,
        framework: 'cypress',
      };

      const summary = buildStructuredSummary(errorData);

      expect(summary.primaryError.message.length).toBeLessThanOrEqual(500);
    });
  });
});
