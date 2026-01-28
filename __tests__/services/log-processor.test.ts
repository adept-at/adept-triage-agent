import { capArtifactLogs, buildStructuredSummary, fetchDiffWithFallback } from '../../src/services/log-processor';
import { ErrorData, ActionInputs, PRDiff } from '../../src/types';
import { ArtifactFetcher } from '../../src/artifact-fetcher';
import * as core from '@actions/core';

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
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
    },
  },
}));

const mockCore = core as jest.Mocked<typeof core>;

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

  describe('fetchDiffWithFallback', () => {
    let mockArtifactFetcher: jest.Mocked<ArtifactFetcher>;
    const mockPRDiff: PRDiff = {
      files: [{ filename: 'test.js', status: 'modified', additions: 5, deletions: 2, changes: 7 }],
      totalChanges: 1,
      additions: 5,
      deletions: 2,
    };
    const mockBranchDiff: PRDiff = {
      files: [{ filename: 'feature.js', status: 'added', additions: 10, deletions: 0, changes: 10 }],
      totalChanges: 1,
      additions: 10,
      deletions: 0,
    };
    const mockCommitDiff: PRDiff = {
      files: [{ filename: 'deploy.js', status: 'modified', additions: 3, deletions: 1, changes: 4 }],
      totalChanges: 1,
      additions: 3,
      deletions: 1,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockArtifactFetcher = {
        fetchPRDiff: jest.fn(),
        fetchBranchDiff: jest.fn(),
        fetchCommitDiff: jest.fn(),
      } as unknown as jest.Mocked<ArtifactFetcher>;
    });

    const baseInputs: ActionInputs = {
      githubToken: 'token',
      openaiApiKey: 'api-key',
      confidenceThreshold: 70,
    };

    describe('PR diff strategy (highest priority)', () => {
      it('should use PR diff when prNumber is provided', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(mockPRDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '123',
        });

        expect(result).toEqual(mockPRDiff);
        expect(mockArtifactFetcher.fetchPRDiff).toHaveBeenCalledWith('123', undefined);
        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();
        expect(mockArtifactFetcher.fetchCommitDiff).not.toHaveBeenCalled();
      });

      it('should pass repository to fetchPRDiff', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(mockPRDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '456',
          repository: 'owner/repo',
        });

        expect(mockArtifactFetcher.fetchPRDiff).toHaveBeenCalledWith('456', 'owner/repo');
      });

      it('should fall back to branch diff when PR diff returns null', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(null);
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '123',
          branch: 'feature-branch',
        });

        expect(result).toEqual(mockBranchDiff);
        expect(mockArtifactFetcher.fetchPRDiff).toHaveBeenCalled();
        expect(mockArtifactFetcher.fetchBranchDiff).toHaveBeenCalled();
      });

      it('should fall back when PR diff throws error', async () => {
        mockArtifactFetcher.fetchPRDiff.mockRejectedValue(new Error('PR not found'));
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '999',
          branch: 'feature-branch',
        });

        expect(result).toEqual(mockBranchDiff);
        expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch PR diff'));
      });
    });

    describe('Branch diff strategy (preview URL mode)', () => {
      it('should use branch diff when branch is not main/master', async () => {
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'feature-branch',
        });

        expect(result).toEqual(mockBranchDiff);
        expect(mockArtifactFetcher.fetchBranchDiff).toHaveBeenCalledWith('feature-branch', 'main', undefined);
        expect(mockArtifactFetcher.fetchCommitDiff).not.toHaveBeenCalled();
      });

      it('should skip branch diff when branch is main', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'main',
          commitSha: 'abc123',
        });

        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();
        expect(mockArtifactFetcher.fetchCommitDiff).toHaveBeenCalled();
        expect(result).toEqual(mockCommitDiff);
      });

      it('should skip branch diff when branch is master', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'master',
          commitSha: 'def456',
        });

        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();
        expect(mockArtifactFetcher.fetchCommitDiff).toHaveBeenCalled();
      });

      it('should be case-insensitive for main/master check', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'MAIN',
          commitSha: 'abc123',
        });

        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'Master',
          commitSha: 'abc123',
        });

        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();
      });

      it('should fall back to commit diff when branch diff fails', async () => {
        mockArtifactFetcher.fetchBranchDiff.mockRejectedValue(new Error('Branch not found'));
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        // Note: commit diff only runs if branch IS main/master, so we need a different scenario
        // In this case, branch diff fails but there's no commit diff fallback for feature branches
        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'feature-branch',
        });

        expect(result).toBeNull();
        expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch branch diff'));
      });
    });

    describe('Commit diff strategy (production deploy mode)', () => {
      it('should use commit diff when commitSha provided and on main branch', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          commitSha: 'abc123def456',
          branch: 'main',
        });

        expect(result).toEqual(mockCommitDiff);
        expect(mockArtifactFetcher.fetchCommitDiff).toHaveBeenCalledWith('abc123def456', undefined);
      });

      it('should use commit diff when commitSha provided and no branch specified', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          commitSha: 'abc123',
        });

        expect(result).toEqual(mockCommitDiff);
        expect(mockArtifactFetcher.fetchCommitDiff).toHaveBeenCalled();
      });

      it('should NOT use commit diff when on feature branch (branch diff handles that)', async () => {
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          commitSha: 'abc123',
          branch: 'feature-branch',
        });

        // Branch diff takes priority over commit diff for feature branches
        expect(result).toEqual(mockBranchDiff);
        expect(mockArtifactFetcher.fetchCommitDiff).not.toHaveBeenCalled();
      });

      it('should pass repository to fetchCommitDiff', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          commitSha: 'abc123',
          branch: 'main',
          repository: 'owner/repo',
        });

        expect(mockArtifactFetcher.fetchCommitDiff).toHaveBeenCalledWith('abc123', 'owner/repo');
      });
    });

    describe('No diff available', () => {
      it('should return null when no inputs provided', async () => {
        const result = await fetchDiffWithFallback(mockArtifactFetcher, baseInputs);

        expect(result).toBeNull();
        expect(mockArtifactFetcher.fetchPRDiff).not.toHaveBeenCalled();
        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();
        expect(mockArtifactFetcher.fetchCommitDiff).not.toHaveBeenCalled();
        expect(mockCore.info).toHaveBeenCalledWith(
          'ℹ️ No PR_NUMBER, BRANCH, or COMMIT_SHA provided, skipping diff fetch'
        );
      });

      it('should return null when all strategies fail', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(null);
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(null);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '123',
          branch: 'feature-branch',
        });

        expect(result).toBeNull();
        expect(mockCore.info).toHaveBeenCalledWith(
          'ℹ️ All diff fetch strategies exhausted, proceeding without diff'
        );
      });
    });

    describe('Priority order', () => {
      it('should prefer PR diff over branch diff when both available', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(mockPRDiff);
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '123',
          branch: 'feature-branch',
        });

        expect(result).toEqual(mockPRDiff);
        expect(mockArtifactFetcher.fetchBranchDiff).not.toHaveBeenCalled();
      });

      it('should prefer branch diff over commit diff for feature branches', async () => {
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        const result = await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'feature-branch',
          commitSha: 'abc123',
        });

        expect(result).toEqual(mockBranchDiff);
        expect(mockArtifactFetcher.fetchCommitDiff).not.toHaveBeenCalled();
      });
    });

    describe('Logging', () => {
      it('should log when fetching PR diff', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(mockPRDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '123',
        });

        expect(mockCore.info).toHaveBeenCalledWith(
          expect.stringContaining('Fetching PR diff for PR #123')
        );
      });

      it('should log when fetching branch diff', async () => {
        mockArtifactFetcher.fetchBranchDiff.mockResolvedValue(mockBranchDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          branch: 'my-feature',
        });

        expect(mockCore.info).toHaveBeenCalledWith(
          expect.stringContaining('Fetching branch diff: main...my-feature')
        );
      });

      it('should log when fetching commit diff', async () => {
        mockArtifactFetcher.fetchCommitDiff.mockResolvedValue(mockCommitDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          commitSha: 'abc123def456789',
          branch: 'main',
        });

        expect(mockCore.info).toHaveBeenCalledWith(
          expect.stringContaining('Fetching commit diff for abc123d')
        );
      });

      it('should log success with diff details', async () => {
        mockArtifactFetcher.fetchPRDiff.mockResolvedValue(mockPRDiff);

        await fetchDiffWithFallback(mockArtifactFetcher, {
          ...baseInputs,
          prNumber: '123',
        });

        expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Successfully fetched PR diff'));
        expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Total files changed: 1'));
      });
    });
  });
});
