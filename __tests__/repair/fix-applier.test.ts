import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import {
  GitHubFixApplier,
  generateFixBranchName,
  generateFixCommitMessage,
  ApplyResult,
  FixApplierConfig,
} from '../../src/repair/fix-applier';
import { FixRecommendation } from '../../src/types';
import { AUTO_FIX } from '../../src/config/constants';

// Mock dependencies
jest.mock('@actions/core');

describe('fix-applier', () => {
  let mockCore: jest.Mocked<typeof core>;
  let mockOctokit: {
    git: {
      getRef: jest.Mock;
      createRef: jest.Mock;
      deleteRef: jest.Mock;
    };
    repos: {
      getContent: jest.Mock;
      createOrUpdateFileContents: jest.Mock;
    };
  };

  const createConfig = (): FixApplierConfig => ({
    octokit: mockOctokit as unknown as Octokit,
    owner: 'test-owner',
    repo: 'test-repo',
    baseBranch: 'main',
    minConfidence: 70,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockCore = core as jest.Mocked<typeof core>;

    // Create mock Octokit
    mockOctokit = {
      git: {
        getRef: jest.fn(),
        createRef: jest.fn(),
        deleteRef: jest.fn(),
      },
      repos: {
        getContent: jest.fn(),
        createOrUpdateFileContents: jest.fn(),
      },
    };

    // Default successful mocks
    mockOctokit.git.getRef.mockResolvedValue({
      data: { object: { sha: 'base-sha-123' } },
    });
    mockOctokit.git.createRef.mockResolvedValue({
      data: { ref: 'refs/heads/fix/triage-agent/test-20240315-000' },
    });
    mockOctokit.git.deleteRef.mockResolvedValue({});
  });

  describe('GitHubFixApplier.canApply()', () => {
    it('should return false when confidence is below threshold', () => {
      const applier = new GitHubFixApplier(createConfig());
      const recommendation: FixRecommendation = {
        confidence: 60,
        summary: 'Fix selector',
        proposedChanges: [
          {
            file: 'test.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      const result = applier.canApply(recommendation);

      expect(result).toBe(false);
      expect(mockCore.info).toHaveBeenCalledWith(
        'Fix confidence (60%) is below threshold (70%)'
      );
    });

    it('should return false when no proposed changes', () => {
      const applier = new GitHubFixApplier(createConfig());
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix selector',
        proposedChanges: [],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      const result = applier.canApply(recommendation);

      expect(result).toBe(false);
      expect(mockCore.info).toHaveBeenCalledWith(
        'No proposed changes in fix recommendation'
      );
    });

    it('should return false when proposedChanges is undefined', () => {
      const applier = new GitHubFixApplier(createConfig());
      const recommendation = {
        confidence: 85,
        summary: 'Fix selector',
        proposedChanges: undefined,
        evidence: ['evidence'],
        reasoning: 'reasoning',
      } as unknown as FixRecommendation;

      const result = applier.canApply(recommendation);

      expect(result).toBe(false);
      expect(mockCore.info).toHaveBeenCalledWith(
        'No proposed changes in fix recommendation'
      );
    });

    it('should return true when confidence meets threshold and has changes', () => {
      const applier = new GitHubFixApplier(createConfig());
      const recommendation: FixRecommendation = {
        confidence: 70,
        summary: 'Fix selector',
        proposedChanges: [
          {
            file: 'test.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      const result = applier.canApply(recommendation);

      expect(result).toBe(true);
    });

    it('should return true when confidence exceeds threshold', () => {
      const applier = new GitHubFixApplier(createConfig());
      const recommendation: FixRecommendation = {
        confidence: 95,
        summary: 'Fix selector',
        proposedChanges: [
          {
            file: 'test.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      const result = applier.canApply(recommendation);

      expect(result).toBe(true);
    });

    it('should use configured minimum confidence threshold', () => {
      const config = createConfig();
      config.minConfidence = 90;
      const highThresholdApplier = new GitHubFixApplier(config);

      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix selector',
        proposedChanges: [
          {
            file: 'test.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      const result = highThresholdApplier.canApply(recommendation);

      expect(result).toBe(false);
      expect(mockCore.info).toHaveBeenCalledWith(
        'Fix confidence (85%) is below threshold (90%)'
      );
    });
  });

  describe('GitHubFixApplier.applyFix()', () => {
    let applier: GitHubFixApplier;

    beforeEach(() => {
      applier = new GitHubFixApplier(createConfig());
    });

    it('should successfully create branch, apply changes, and commit via API', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix selector issue',
        proposedChanges: [
          {
            file: 'cypress/e2e/test.cy.ts',
            line: 42,
            oldCode: 'cy.get(".old-selector")',
            newCode: 'cy.get(".new-selector")',
            justification: 'Selector changed',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'The selector was updated in the application',
      };

      // Mock file content retrieval
      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const test = cy.get(".old-selector").click();').toString('base64'),
          sha: 'file-sha-123',
        },
      });

      // Mock file update
      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: {
          commit: { sha: 'new-commit-sha-456' },
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain('cypress/e2e/test.cy.ts');
      expect(result.commitSha).toBe('new-commit-sha-456');
      // Branch name now includes milliseconds suffix
      expect(result.branchName).toMatch(/^fix\/triage-agent\/cypress-e2e-test-cy-ts-\d{8}-\d{3}$/);
      expect(result.error).toBeUndefined();

      // Verify API calls
      expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/main',
      });

      expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: expect.stringMatching(/^refs\/heads\/fix\/triage-agent\//),
        sha: 'base-sha-123',
      });

      expect(mockOctokit.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'cypress/e2e/test.cy.ts',
        ref: expect.stringMatching(/^fix\/triage-agent\//),
      });

      expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'cypress/e2e/test.cy.ts',
        message: expect.stringContaining('fix(test):'),
        content: expect.any(String),
        sha: 'file-sha-123',
        branch: expect.stringMatching(/^fix\/triage-agent\//),
      });
    });

    it('should log target repository and base branch', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          { file: 'test.ts', line: 1, oldCode: 'old', newCode: 'new', justification: 'r' },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const x = old;').toString('base64'),
          sha: 'sha1',
        },
      });
      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'sha' } },
      });

      await applier.applyFix(recommendation);

      expect(mockCore.info).toHaveBeenCalledWith('Target repository: test-owner/test-repo');
      expect(mockCore.info).toHaveBeenCalledWith('Base branch: main');
    });

    it('should handle file not found errors gracefully', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix selector issue',
        proposedChanges: [
          {
            file: 'cypress/e2e/missing.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      // Mock file not found
      mockOctokit.repos.getContent.mockRejectedValue(new Error('Not Found'));

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.error).toBe('No files were successfully modified');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('modifying cypress/e2e/missing.cy.ts')
      );

      // Verify cleanup was attempted
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
    });

    it('should handle when old code not found in file', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix selector issue',
        proposedChanges: [
          {
            file: 'cypress/e2e/test.cy.ts',
            line: 42,
            oldCode: 'cy.get(".nonexistent")',
            newCode: 'cy.get(".new-selector")',
            justification: 'Selector changed',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      // Mock file content that doesn't contain the old code
      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const test = cy.get(".different-selector").click();').toString('base64'),
          sha: 'file-sha-123',
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.error).toBe('No files were successfully modified');
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Could not find old code to replace in cypress/e2e/test.cy.ts'
      );
    });

    it('should clean up branch on failure during API operations', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix selector issue',
        proposedChanges: [
          {
            file: 'cypress/e2e/test.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const test = old;').toString('base64'),
          sha: 'file-sha-123',
        },
      });

      // Simulate commit failure
      mockOctokit.repos.createOrUpdateFileContents.mockRejectedValue(
        new Error('Permission denied')
      );

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      // Per-file failures result in "No files were successfully modified"
      expect(result.error).toBe('No files were successfully modified');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('modifying cypress/e2e/test.cy.ts')
      );

      // Verify cleanup was attempted (branch deleted since no files were modified)
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
    });

    it('should return correct ApplyResult structure on success', async () => {
      const recommendation: FixRecommendation = {
        confidence: 90,
        summary: 'Multiple file fix',
        proposedChanges: [
          {
            file: 'file1.ts',
            line: 10,
            oldCode: 'oldCode1',
            newCode: 'newCode1',
            justification: 'reason1',
          },
          {
            file: 'file2.ts',
            line: 20,
            oldCode: 'oldCode2',
            newCode: 'newCode2',
            justification: 'reason2',
          },
        ],
        evidence: ['evidence1', 'evidence2'],
        reasoning: 'Multiple fixes needed',
      };

      mockOctokit.repos.getContent.mockImplementation(async ({ path }) => {
        if (path === 'file1.ts') {
          return {
            data: {
              type: 'file',
              content: Buffer.from('const x = oldCode1;').toString('base64'),
              sha: 'sha1',
            },
          };
        }
        if (path === 'file2.ts') {
          return {
            data: {
              type: 'file',
              content: Buffer.from('const y = oldCode2;').toString('base64'),
              sha: 'sha2',
            },
          };
        }
        throw new Error('Unknown file');
      });

      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'final-commit-sha' } },
      });

      const result = await applier.applyFix(recommendation);

      expect(result).toEqual<ApplyResult>({
        success: true,
        modifiedFiles: ['file1.ts', 'file2.ts'],
        commitSha: 'final-commit-sha',
        branchName: expect.stringMatching(/^fix\/triage-agent\/file1-ts-\d{8}-\d{3}$/),
      });
    });

    it('should return correct ApplyResult structure on failure', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'missing',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('different content').toString('base64'),
          sha: 'sha1',
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result).toEqual<ApplyResult>({
        success: false,
        modifiedFiles: [],
        error: 'No files were successfully modified',
      });
    });

    it('should handle partial success (some files modified, some failed)', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Multiple file fix',
        proposedChanges: [
          {
            file: 'success.ts',
            line: 10,
            oldCode: 'oldCode',
            newCode: 'newCode',
            justification: 'works',
          },
          {
            file: 'missing.ts',
            line: 20,
            oldCode: 'notFound',
            newCode: 'newCode',
            justification: 'will fail',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockImplementation(async ({ path }) => {
        if (path === 'success.ts') {
          return {
            data: {
              type: 'file',
              content: Buffer.from('const x = oldCode;').toString('base64'),
              sha: 'sha1',
            },
          };
        }
        throw new Error('File not found');
      });

      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'commitsha' } },
      });

      const result = await applier.applyFix(recommendation);

      // Should succeed with partial modifications
      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(['success.ts']);
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('modifying missing.ts')
      );
    });

    it('should skip changes without oldCode or newCode', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: '',
            newCode: 'new',
            justification: 'missing old code',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('some content').toString('base64'),
          sha: 'sha1',
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No files were successfully modified');
    });

    it('should use configured base branch for API calls', async () => {
      const config = createConfig();
      config.baseBranch = 'develop';
      const customApplier = new GitHubFixApplier(config);

      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const x = old;').toString('base64'),
          sha: 'sha1',
        },
      });

      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'sha' } },
      });

      await customApplier.applyFix(recommendation);

      expect(mockOctokit.git.getRef).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        ref: 'heads/develop',
      });
    });

    it('should handle API failure when getting base branch with helpful error', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      // Simulate base branch not found
      mockOctokit.git.getRef.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Base branch 'main'");
      expect(result.error).toContain('test-owner/test-repo');
    });

    it('should skip directories when getting file content', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'some/directory',
            line: 1,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      // Mock response indicating a directory
      mockOctokit.repos.getContent.mockResolvedValue({
        data: [{ type: 'dir', name: 'directory' }],
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No files were successfully modified');
      expect(mockCore.warning).toHaveBeenCalledWith('some/directory is not a file, skipping');
    });

    it('should retry with unique branch name when branch already exists', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      // First createRef fails with "Reference already exists", second succeeds
      mockOctokit.git.createRef
        .mockRejectedValueOnce(new Error('Reference already exists'))
        .mockResolvedValueOnce({ data: { ref: 'refs/heads/fix/triage-agent/test-unique' } });

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const x = old;').toString('base64'),
          sha: 'sha1',
        },
      });

      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'sha' } },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(mockOctokit.git.createRef).toHaveBeenCalledTimes(2);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Branch exists, trying with unique name')
      );
    });

    it('should handle missing commit SHA in response', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const x = old;').toString('base64'),
          sha: 'sha1',
        },
      });

      // Response without commit SHA
      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { content: { sha: 'content-sha' } },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(result.commitSha).toBeUndefined();
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('No commit SHA returned')
      );
    });

    it('should handle rate limiting with retry', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      // First getContent fails with rate limit, second succeeds
      mockOctokit.repos.getContent
        .mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 }))
        .mockResolvedValueOnce({
          data: {
            type: 'file',
            content: Buffer.from('const x = old;').toString('base64'),
            sha: 'sha1',
          },
        });

      mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
        data: { commit: { sha: 'sha' } },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(mockOctokit.repos.getContent).toHaveBeenCalledTimes(2);
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Rate limited')
      );
    }, 15000); // Increase timeout for retry delay
  });

  describe('generateFixBranchName()', () => {
    it('should generate correct branch name format with milliseconds suffix', () => {
      const fixedDate = new Date('2024-03-15T10:00:00.123Z');
      const branchName = generateFixBranchName('cypress/e2e/test.cy.ts', fixedDate);

      expect(branchName).toBe(`${AUTO_FIX.BRANCH_PREFIX}cypress-e2e-test-cy-ts-20240315-123`);
    });

    it('should sanitize special characters in test file names', () => {
      const fixedDate = new Date('2024-03-15T10:00:00.000Z');

      // Test with various special characters
      expect(generateFixBranchName('test@file#name!.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-file-name-ts-20240315-000`
      );

      // Test with spaces
      expect(generateFixBranchName('test file name.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-file-name-ts-20240315-000`
      );

      // Test with multiple consecutive special chars
      expect(generateFixBranchName('test///file---name.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-file-name-ts-20240315-000`
      );

      // Test with leading/trailing special chars
      expect(generateFixBranchName('---test.ts---', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-ts-20240315-000`
      );
    });

    it('should include date in branch name in YYYYMMDD format', () => {
      const dates = [
        { date: new Date('2024-01-01T00:00:00.000Z'), expected: '20240101' },
        { date: new Date('2024-12-31T23:59:59.000Z'), expected: '20241231' },
        { date: new Date('2025-06-15T12:30:00.000Z'), expected: '20250615' },
      ];

      dates.forEach(({ date, expected }) => {
        const branchName = generateFixBranchName('test.ts', date);
        expect(branchName).toContain(expected);
      });
    });

    it('should truncate long file names to 40 characters', () => {
      const fixedDate = new Date('2024-03-15T10:00:00.000Z');
      const longFileName =
        'this-is-a-very-long-file-name-that-exceeds-the-maximum-allowed-length-for-branch-names.ts';

      const branchName = generateFixBranchName(longFileName, fixedDate);

      // Prefix + truncated name (40 chars) + date (9 chars) + ms (4 chars)
      const expectedPrefix = AUTO_FIX.BRANCH_PREFIX;
      const truncatedPart = branchName.slice(expectedPrefix.length, -13); // Remove prefix and -YYYYMMDD-MMM

      expect(truncatedPart.length).toBeLessThanOrEqual(40);
    });

    it('should use current date if no timestamp provided', () => {
      const branchName = generateFixBranchName('test.ts');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      expect(branchName).toContain(today);
    });

    it('should handle file paths with multiple extensions', () => {
      const fixedDate = new Date('2024-03-15T10:00:00.000Z');

      expect(generateFixBranchName('test.spec.cy.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-spec-cy-ts-20240315-000`
      );
    });

    it('should generate more unique name when forceUnique is true', () => {
      const fixedDate = new Date('2024-03-15T10:00:00.123Z');

      const normalName = generateFixBranchName('test.ts', fixedDate, false);
      const uniqueName = generateFixBranchName('test.ts', fixedDate, true);

      // Normal name has 3-digit milliseconds
      expect(normalName).toMatch(/-\d{3}$/);
      // Unique name has base36 timestamp (longer, more unique)
      expect(uniqueName).not.toMatch(/-\d{3}$/);
      expect(uniqueName.length).toBeGreaterThan(normalName.length);
    });
  });

  describe('generateFixCommitMessage()', () => {
    it('should include summary, files, confidence, and reasoning', () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Update selector to match new button ID',
        proposedChanges: [
          {
            file: 'cypress/e2e/login.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence'],
        reasoning: 'The button ID was changed in the latest PR from submit-btn to submit-button',
      };

      const message = generateFixCommitMessage(recommendation);

      expect(message).toContain('fix(test): Update selector to match new button ID');
      expect(message).toContain('Automated fix generated by adept-triage-agent');
      expect(message).toContain('Files modified: cypress/e2e/login.cy.ts');
      expect(message).toContain('Confidence: 85%');
      expect(message).toContain('The button ID was changed in the latest PR');
    });

    it('should include all files when multiple files are changed', () => {
      const recommendation: FixRecommendation = {
        confidence: 90,
        summary: 'Fix multiple files',
        proposedChanges: [
          { file: 'file1.ts', line: 1, oldCode: 'a', newCode: 'b', justification: 'r1' },
          { file: 'file2.ts', line: 2, oldCode: 'c', newCode: 'd', justification: 'r2' },
          { file: 'file3.ts', line: 3, oldCode: 'e', newCode: 'f', justification: 'r3' },
        ],
        evidence: [],
        reasoning: 'Multiple selectors need updating',
      };

      const message = generateFixCommitMessage(recommendation);

      expect(message).toContain('Files modified: file1.ts, file2.ts, file3.ts');
    });

    it('should truncate long summaries to 50 characters', () => {
      const recommendation: FixRecommendation = {
        confidence: 75,
        summary:
          'This is a very long summary that should definitely be truncated because it exceeds the maximum allowed length',
        proposedChanges: [
          { file: 'test.ts', line: 1, oldCode: 'a', newCode: 'b', justification: 'r' },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      const message = generateFixCommitMessage(recommendation);
      const firstLine = message.split('\n')[0];

      // The summary in the first line should be truncated to 50 chars
      // 'fix(test): ' (11 chars) + summary.slice(0, 50)
      expect(firstLine).toBe('fix(test): This is a very long summary that should definitely');
      expect(firstLine.length).toBeLessThanOrEqual(61); // 'fix(test): ' (11 chars) + 50 chars max
    });

    it('should format message with proper structure', () => {
      const recommendation: FixRecommendation = {
        confidence: 80,
        summary: 'Short summary',
        proposedChanges: [
          { file: 'test.ts', line: 1, oldCode: 'a', newCode: 'b', justification: 'r' },
        ],
        evidence: [],
        reasoning: 'Detailed reasoning here',
      };

      const message = generateFixCommitMessage(recommendation);
      const lines = message.split('\n');

      // Check message structure
      expect(lines[0]).toBe('fix(test): Short summary');
      expect(lines[1]).toBe('');
      expect(lines[2]).toBe('Automated fix generated by adept-triage-agent.');
      expect(lines[3]).toBe('');
      expect(lines[4]).toBe('Files modified: test.ts');
      expect(lines[5]).toBe('Confidence: 80%');
      expect(lines[6]).toBe('');
      expect(lines[7]).toBe('Detailed reasoning here');
    });
  });
});
