/**
 * Integration tests for the fallback diff fetching functionality
 *
 * These tests verify the complete flow from input handling through
 * diff fetching and inclusion in the error data.
 */

import { Octokit } from '@octokit/rest';
import { ArtifactFetcher } from '../../src/artifact-fetcher';
import { PRDiff } from '../../src/types';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    runId: 12345,
    job: 'test-job',
    sha: 'test-sha',
    ref: 'refs/heads/main',
    payload: {},
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
    },
  },
}));

const mockCore = core as jest.Mocked<typeof core>;

describe('Diff Fallback Integration Tests', () => {
  let mockOctokit: jest.Mocked<Partial<Octokit>>;
  let artifactFetcher: ArtifactFetcher;

  const mockCommitResponse = {
    data: {
      sha: 'abc123def456',
      stats: { additions: 25, deletions: 10 },
      files: [
        {
          filename: 'cypress/e2e/login.cy.ts',
          status: 'modified',
          additions: 15,
          deletions: 5,
          changes: 20,
          patch: '@@ -10,5 +10,15 @@\n-old code\n+new code',
        },
        {
          filename: 'src/components/Login.tsx',
          status: 'modified',
          additions: 10,
          deletions: 5,
          changes: 15,
          patch: '@@ -1,5 +1,10 @@\n-old\n+new',
        },
      ],
    },
  };

  const mockBranchCompareResponse = {
    data: {
      ahead_by: 3,
      behind_by: 0,
      files: [
        {
          filename: 'cypress/support/helpers.ts',
          status: 'added',
          additions: 50,
          deletions: 0,
          changes: 50,
          patch: '@@ -0,0 +1,50 @@\n+new helper code',
        },
        {
          filename: 'src/features/newFeature.tsx',
          status: 'added',
          additions: 100,
          deletions: 0,
          changes: 100,
          patch: '@@ -0,0 +1,100 @@\n+feature code',
        },
      ],
    },
  };

  const mockPRResponse = {
    data: {
      changed_files: 2,
      additions: 30,
      deletions: 10,
    },
  };

  const mockPRFilesResponse = {
    data: [
      {
        filename: 'cypress/e2e/checkout.cy.ts',
        status: 'modified',
        additions: 20,
        deletions: 5,
        changes: 25,
        patch: '@@ -5,5 +5,20 @@\n-old\n+new',
      },
      {
        filename: 'src/checkout/Cart.tsx',
        status: 'modified',
        additions: 10,
        deletions: 5,
        changes: 15,
        patch: '@@ -1,5 +1,10 @@\n-old\n+new',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockOctokit = {
      repos: {
        getCommit: jest.fn(),
        compareCommits: jest.fn(),
      },
      pulls: {
        get: jest.fn(),
        listFiles: jest.fn(),
      },
      actions: {
        listWorkflowRunArtifacts: jest.fn().mockResolvedValue({ data: { artifacts: [] } }),
        downloadArtifact: jest.fn(),
      },
    } as any;

    artifactFetcher = new ArtifactFetcher(mockOctokit as Octokit);
  });

  describe('Production deploy scenario (commit diff)', () => {
    it('should fetch commit diff when running on main with commit SHA', async () => {
      mockOctokit.repos!.getCommit = jest.fn().mockResolvedValue(mockCommitResponse);

      const diff = await artifactFetcher.fetchCommitDiff('abc123def456');

      expect(diff).not.toBeNull();
      expect(diff!.totalChanges).toBe(2);
      expect(diff!.additions).toBe(25);
      expect(diff!.deletions).toBe(10);
      expect(diff!.files).toHaveLength(2);

      // Verify test files are sorted first
      expect(diff!.files[0].filename).toContain('cypress');
    });

    it('should include patch content for analyzing changes', async () => {
      mockOctokit.repos!.getCommit = jest.fn().mockResolvedValue(mockCommitResponse);

      const diff = await artifactFetcher.fetchCommitDiff('abc123');

      expect(diff!.files[0].patch).toContain('-old code');
      expect(diff!.files[0].patch).toContain('+new code');
    });

    it('should handle commit not found gracefully', async () => {
      mockOctokit.repos!.getCommit = jest.fn().mockRejectedValue(new Error('Not Found'));

      const diff = await artifactFetcher.fetchCommitDiff('nonexistent');

      expect(diff).toBeNull();
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch commit diff')
      );
    });
  });

  describe('Preview URL scenario (branch diff)', () => {
    it('should fetch branch diff comparing feature branch to main', async () => {
      mockOctokit.repos!.compareCommits = jest.fn().mockResolvedValue(mockBranchCompareResponse);

      const diff = await artifactFetcher.fetchBranchDiff('feature/new-checkout', 'main');

      expect(diff).not.toBeNull();
      expect(diff!.totalChanges).toBe(2);
      expect(diff!.additions).toBe(150);
      expect(diff!.deletions).toBe(0);

      expect(mockOctokit.repos!.compareCommits).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        base: 'main',
        head: 'feature/new-checkout',
      });
    });

    it('should sort test/cypress files first in branch diff', async () => {
      mockOctokit.repos!.compareCommits = jest.fn().mockResolvedValue(mockBranchCompareResponse);

      const diff = await artifactFetcher.fetchBranchDiff('feature-branch');

      // Cypress file should be sorted first
      expect(diff!.files[0].filename).toContain('cypress');
    });

    it('should handle branch comparison failure gracefully', async () => {
      const error = new Error('Not Found') as any;
      error.status = 404;
      mockOctokit.repos!.compareCommits = jest.fn().mockRejectedValue(error);

      const diff = await artifactFetcher.fetchBranchDiff('nonexistent-branch');

      expect(diff).toBeNull();
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining("branch 'nonexistent-branch' or 'main' not found")
      );
    });
  });

  describe('PR scenario (PR diff)', () => {
    it('should fetch PR diff with full file details', async () => {
      mockOctokit.pulls!.get = jest.fn().mockResolvedValue(mockPRResponse);
      mockOctokit.pulls!.listFiles = jest.fn().mockResolvedValue(mockPRFilesResponse);

      const diff = await artifactFetcher.fetchPRDiff('42');

      expect(diff).not.toBeNull();
      expect(diff!.totalChanges).toBe(2);
      expect(diff!.additions).toBe(30);
      expect(diff!.deletions).toBe(10);
      expect(diff!.files).toHaveLength(2);

      // Verify test files are sorted first
      expect(diff!.files[0].filename).toContain('cypress');
    });

    it('should include patch content for PR files', async () => {
      mockOctokit.pulls!.get = jest.fn().mockResolvedValue(mockPRResponse);
      mockOctokit.pulls!.listFiles = jest.fn().mockResolvedValue(mockPRFilesResponse);

      const diff = await artifactFetcher.fetchPRDiff('42');

      expect(diff!.files[0].patch).toBeDefined();
      expect(diff!.files[0].patch).toContain('@@');
    });
  });

  describe('File relevance sorting', () => {
    it('should sort test files before source files', async () => {
      const mixedFilesResponse = {
        data: {
          ahead_by: 1,
          behind_by: 0,
          files: [
            { filename: 'src/app.ts', status: 'modified', additions: 5, deletions: 2, changes: 7 },
            { filename: 'cypress/e2e/test.cy.ts', status: 'modified', additions: 10, deletions: 5, changes: 15 },
            { filename: 'package.json', status: 'modified', additions: 1, deletions: 1, changes: 2 },
            { filename: '__tests__/unit.test.ts', status: 'added', additions: 20, deletions: 0, changes: 20 },
          ],
        },
      };

      mockOctokit.repos!.compareCommits = jest.fn().mockResolvedValue(mixedFilesResponse);

      const diff = await artifactFetcher.fetchBranchDiff('feature');

      // Test files should come first
      expect(diff!.files[0].filename).toMatch(/cypress|__tests__|\.test\.|\.spec\./);
      expect(diff!.files[1].filename).toMatch(/cypress|__tests__|\.test\.|\.spec\./);
    });

    it('should sort heavily modified files higher within categories', async () => {
      const filesWithVaryingChanges = {
        data: {
          ahead_by: 1,
          behind_by: 0,
          files: [
            { filename: 'small-test.test.ts', status: 'modified', additions: 5, deletions: 2, changes: 7 },
            { filename: 'big-test.test.ts', status: 'modified', additions: 100, deletions: 50, changes: 150 },
          ],
        },
      };

      mockOctokit.repos!.compareCommits = jest.fn().mockResolvedValue(filesWithVaryingChanges);

      const diff = await artifactFetcher.fetchBranchDiff('feature');

      // Bigger changes should come first
      expect(diff!.files[0].filename).toBe('big-test.test.ts');
    });
  });

  describe('Cross-repository access', () => {
    it('should pass custom repository to commit diff', async () => {
      mockOctokit.repos!.getCommit = jest.fn().mockResolvedValue(mockCommitResponse);

      await artifactFetcher.fetchCommitDiff('abc123', 'other-org/other-repo');

      expect(mockOctokit.repos!.getCommit).toHaveBeenCalledWith({
        owner: 'other-org',
        repo: 'other-repo',
        ref: 'abc123',
      });
    });

    it('should pass custom repository to branch diff', async () => {
      mockOctokit.repos!.compareCommits = jest.fn().mockResolvedValue(mockBranchCompareResponse);

      await artifactFetcher.fetchBranchDiff('feature', 'main', 'other-org/other-repo');

      expect(mockOctokit.repos!.compareCommits).toHaveBeenCalledWith({
        owner: 'other-org',
        repo: 'other-repo',
        base: 'main',
        head: 'feature',
      });
    });

    it('should pass custom repository to PR diff', async () => {
      mockOctokit.pulls!.get = jest.fn().mockResolvedValue(mockPRResponse);
      mockOctokit.pulls!.listFiles = jest.fn().mockResolvedValue(mockPRFilesResponse);

      await artifactFetcher.fetchPRDiff('42', 'other-org/other-repo');

      expect(mockOctokit.pulls!.get).toHaveBeenCalledWith({
        owner: 'other-org',
        repo: 'other-repo',
        pull_number: 42,
      });
    });
  });

  describe('Error resilience', () => {
    it('should continue operation when commit has no files', async () => {
      mockOctokit.repos!.getCommit = jest.fn().mockResolvedValue({
        data: {
          sha: 'empty-commit',
          stats: { additions: 0, deletions: 0 },
          files: [],
        },
      });

      const diff = await artifactFetcher.fetchCommitDiff('empty-commit');

      expect(diff).not.toBeNull();
      expect(diff!.files).toHaveLength(0);
      expect(diff!.totalChanges).toBe(0);
    });

    it('should handle commits with undefined files array', async () => {
      mockOctokit.repos!.getCommit = jest.fn().mockResolvedValue({
        data: {
          sha: 'merge-commit',
          stats: { additions: 0, deletions: 0 },
          // files can be undefined for merge commits
        },
      });

      const diff = await artifactFetcher.fetchCommitDiff('merge-commit');

      expect(diff).not.toBeNull();
      expect(diff!.files).toHaveLength(0);
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = new Error('API rate limit exceeded') as any;
      rateLimitError.status = 403;
      mockOctokit.repos!.getCommit = jest.fn().mockRejectedValue(rateLimitError);

      const diff = await artifactFetcher.fetchCommitDiff('abc123');

      expect(diff).toBeNull();
      expect(mockCore.warning).toHaveBeenCalled();
    });
  });
});
