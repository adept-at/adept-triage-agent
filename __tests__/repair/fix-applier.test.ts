import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import {
  GitHubFixApplier,
  generateFixBranchName,
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
    actions: {
      getWorkflowRun: jest.Mock;
      listJobsForWorkflowRun: jest.Mock;
      downloadJobLogsForWorkflowRun: jest.Mock;
    };
    git: {
      getRef: jest.Mock;
      createRef: jest.Mock;
      deleteRef: jest.Mock;
      createTree: jest.Mock;
      createCommit: jest.Mock;
      updateRef: jest.Mock;
    };
    repos: {
      getContent: jest.Mock;
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
      actions: {
        getWorkflowRun: jest.fn(),
        listJobsForWorkflowRun: jest.fn(),
        downloadJobLogsForWorkflowRun: jest.fn(),
      },
      git: {
        getRef: jest.fn(),
        createRef: jest.fn(),
        deleteRef: jest.fn(),
        createTree: jest.fn(),
        createCommit: jest.fn(),
        updateRef: jest.fn(),
      },
      repos: {
        getContent: jest.fn(),
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
    mockOctokit.git.createTree.mockResolvedValue({
      data: { sha: 'tree-sha-123' },
    });
    mockOctokit.git.createCommit.mockResolvedValue({
      data: { sha: 'atomic-commit-sha' },
    });
    mockOctokit.git.updateRef.mockResolvedValue({});
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

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain('cypress/e2e/test.cy.ts');
      expect(result.commitSha).toBe('atomic-commit-sha');
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

      expect(mockOctokit.git.createTree).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          tree: expect.arrayContaining([
            expect.objectContaining({
              path: 'cypress/e2e/test.cy.ts',
              mode: '100644',
              type: 'blob',
            }),
          ]),
        })
      );
      expect(mockOctokit.git.createCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          message: expect.stringContaining('fix(test):'),
        })
      );
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
      expect(result.error).toContain('Validation errors');
      expect(result.error).toContain('validating cypress/e2e/missing.cy.ts');

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
      expect(result.error).toContain('Could not find old code to replace in cypress/e2e/test.cy.ts');
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

      // Simulate atomic commit failure
      mockOctokit.git.createTree.mockRejectedValue(
        new Error('Permission denied')
      );

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Atomic commit failed');
      expect(mockCore.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );

      // Verify cleanup was attempted (branch deleted on commit failure)
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

      const result = await applier.applyFix(recommendation);

      expect(result).toEqual<ApplyResult>({
        success: true,
        modifiedFiles: ['file1.ts', 'file2.ts'],
        commitSha: 'atomic-commit-sha',
        branchName: expect.stringMatching(/^fix\/triage-agent\/file1-ts-\d{8}-\d{3}$/),
      });

      // Verify atomic: one tree + one commit, never per-file commits
      expect(mockOctokit.git.createTree).toHaveBeenCalledTimes(1);
      expect(mockOctokit.git.createCommit).toHaveBeenCalledTimes(1);
      expect(mockOctokit.git.createTree).toHaveBeenCalledWith(
        expect.objectContaining({
          base_tree: 'base-sha-123',
          tree: expect.arrayContaining([
            expect.objectContaining({ path: 'file1.ts', mode: '100644', type: 'blob' }),
            expect.objectContaining({ path: 'file2.ts', mode: '100644', type: 'blob' }),
          ]),
        })
      );
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

      expect(result.success).toBe(false);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.error).toContain('Could not find old code to replace in test.ts');
    });

    it('should abort multi-file fix when some changes fail validation', async () => {
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

      const result = await applier.applyFix(recommendation);

      // Multi-file fix should abort entirely when some changes fail validation
      expect(result.success).toBe(false);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.error).toContain('Partial fix rejected');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('aborting to avoid incomplete fix')
      );
      // Branch should be cleaned up
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
    });

    it('should clean up on atomic commit failure during multi-file fix', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Multi-file fix',
        proposedChanges: [
          {
            file: 'file1.ts',
            line: 10,
            oldCode: 'oldCode1',
            newCode: 'newCode1',
            justification: 'fix file 1',
          },
          {
            file: 'file2.ts',
            line: 20,
            oldCode: 'oldCode2',
            newCode: 'newCode2',
            justification: 'fix file 2',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
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

      // Atomic commit fails at createTree
      mockOctokit.git.createTree.mockRejectedValueOnce(new Error('Server error'));

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Atomic commit failed');
      expect(result.modifiedFiles).toEqual([]);
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
    });

    // Regression: multiple changes to the SAME file used to drop all but the
    // last. Each change called getContent() against the original branch state
    // and pushed its own tree item with the same path; createTree silently
    // kept only the last entry. Now changes compose against a per-file buffer
    // so all edits land in one blob.
    it('composes multiple changes to the same file in a single tree item', async () => {
      const recommendation: FixRecommendation = {
        confidence: 90,
        summary: 'Two changes to the same spec',
        proposedChanges: [
          {
            file: 'spec.ts',
            line: 10,
            oldCode: 'await snackbarOld()',
            newCode: 'await dialogOrSnackbar()',
            justification: 'switch primary success surface to dialog',
          },
          {
            file: 'spec.ts',
            line: 30,
            oldCode: 'cleanupSnackbarOld()',
            newCode: 'maybeCleanupSnackbar()',
            justification: 'guard cleanup when snackbar absent',
          },
        ],
        evidence: [],
        reasoning: 'composes both edits',
      };

      const originalContent = [
        '// header',
        '',
        'describe("redeem", () => {',
        '  it("works", async () => {',
        '    await snackbarOld()',
        '  })',
        '})',
        '',
        '// later in the file',
        'cleanupSnackbarOld()',
        '',
      ].join('\n');

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from(originalContent).toString('base64'),
          sha: 'sha-spec',
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(['spec.ts']);

      // File should be fetched ONCE — second change uses the cached buffer.
      expect(mockOctokit.repos.getContent).toHaveBeenCalledTimes(1);

      // Tree should contain ONE entry for spec.ts (not two), with BOTH edits
      // composed into a single blob.
      expect(mockOctokit.git.createTree).toHaveBeenCalledTimes(1);
      const treeArg = mockOctokit.git.createTree.mock.calls[0][0] as {
        tree: Array<{ path: string; content: string }>;
      };
      const specEntries = treeArg.tree.filter((t) => t.path === 'spec.ts');
      expect(specEntries).toHaveLength(1);
      expect(specEntries[0].content).toContain('await dialogOrSnackbar()');
      expect(specEntries[0].content).toContain('maybeCleanupSnackbar()');
      expect(specEntries[0].content).not.toContain('await snackbarOld()');
      expect(specEntries[0].content).not.toContain('cleanupSnackbarOld()');
    });

    it('aborts when a later change to the same file fails to match', async () => {
      const recommendation: FixRecommendation = {
        confidence: 90,
        summary: 'Mixed valid + invalid same-file changes',
        proposedChanges: [
          {
            file: 'spec.ts',
            line: 10,
            oldCode: 'await foo()',
            newCode: 'await bar()',
            justification: 'first change',
          },
          {
            file: 'spec.ts',
            line: 20,
            oldCode: 'NEVER_PRESENT_IN_FILE',
            newCode: 'replacement',
            justification: 'second change will fail',
          },
        ],
        evidence: [],
        reasoning: 'should abort the whole fix',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('const x = await foo();').toString('base64'),
          sha: 'sha-spec',
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Partial fix rejected');
      // No tree / commit when we abort.
      expect(mockOctokit.git.createTree).not.toHaveBeenCalled();
      expect(mockOctokit.git.createCommit).not.toHaveBeenCalled();
      // Branch should be cleaned up.
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
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
      expect(result.error).toContain('No files could be modified');
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
      expect(result.error).toContain('some/directory is not a file');
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

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(mockOctokit.git.createRef).toHaveBeenCalledTimes(2);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Branch exists, trying with unique name')
      );
    });

    it('should succeed with atomic commit SHA', async () => {
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

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(result.commitSha).toBe('atomic-commit-sha');
      expect(mockOctokit.git.createTree).toHaveBeenCalled();
      expect(mockOctokit.git.createCommit).toHaveBeenCalled();
      expect(mockOctokit.git.updateRef).toHaveBeenCalled();
    });

    it('should hard-reject when oldCode matches multiple locations in a file', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Fix',
        proposedChanges: [
          {
            file: 'test.ts',
            line: 1,
            oldCode: 'doSomething()',
            newCode: 'doSomethingElse()',
            justification: 'reason',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockResolvedValue({
        data: {
          type: 'file',
          content: Buffer.from('doSomething();\nconst y = doSomething();').toString('base64'),
          sha: 'sha1',
        },
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ambiguous replacement rejected');
    });

    it('should abort multi-file fix when one file has ambiguous oldCode', async () => {
      const recommendation: FixRecommendation = {
        confidence: 85,
        summary: 'Multi-file fix',
        proposedChanges: [
          {
            file: 'good.ts',
            line: 1,
            oldCode: 'uniqueCode',
            newCode: 'fixedCode',
            justification: 'valid fix',
          },
          {
            file: 'bad.ts',
            line: 1,
            oldCode: 'duplicated',
            newCode: 'fixed',
            justification: 'ambiguous fix',
          },
        ],
        evidence: [],
        reasoning: 'reasoning',
      };

      mockOctokit.repos.getContent.mockImplementation(async ({ path }) => {
        if (path === 'good.ts') {
          return {
            data: {
              type: 'file',
              content: Buffer.from('const x = uniqueCode;').toString('base64'),
              sha: 'sha1',
            },
          };
        }
        if (path === 'bad.ts') {
          return {
            data: {
              type: 'file',
              content: Buffer.from('duplicated; duplicated;').toString('base64'),
              sha: 'sha2',
            },
          };
        }
        throw new Error('Unknown file');
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Partial fix rejected');
    });

    it('should clean up on createCommit failure', async () => {
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

      mockOctokit.git.createCommit.mockRejectedValueOnce(new Error('Commit creation failed'));

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Atomic commit failed');
      expect(result.modifiedFiles).toEqual([]);
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
    });

    it('should clean up on updateRef failure', async () => {
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

      mockOctokit.git.updateRef.mockRejectedValueOnce(new Error('Ref update failed'));

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Atomic commit failed');
      expect(result.modifiedFiles).toEqual([]);
      expect(mockOctokit.git.deleteRef).toHaveBeenCalled();
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

  describe('GitHubFixApplier.waitForValidation()', () => {
    let timeoutSpy: jest.SpyInstance;

    beforeEach(() => {
      timeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: (...args: unknown[]) => void) => {
          callback();
          return 0 as unknown as NodeJS.Timeout;
        });
    });

    afterEach(() => {
      timeoutSpy.mockRestore();
    });

    it('returns a passed remote validation result when success has concrete pass evidence', async () => {
      const applier = new GitHubFixApplier(createConfig());
      mockOctokit.actions.getWorkflowRun.mockResolvedValue({
        data: {
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/test-owner/test-repo/actions/runs/123',
        },
      });
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [{ id: 10, conclusion: 'success' }] },
      });
      mockOctokit.actions.downloadJobLogsForWorkflowRun.mockResolvedValue({
        data: '1 passing (5s)',
      });

      const result = await applier.waitForValidation(123);

      expect(result.passed).toBe(true);
      expect(result.validationResult).toEqual({
        status: 'passed',
        mode: 'remote',
        runId: 123,
        url: 'https://github.com/test-owner/test-repo/actions/runs/123',
        conclusion: 'success',
        testEvidence: {
          trustworthy: true,
          reason: 'concrete pass evidence (matched "1 passing")',
          matched: '1 passing',
        },
      });
    });

    it('uses pass evidence from any validation job, not just the first job', async () => {
      const applier = new GitHubFixApplier(createConfig());
      mockOctokit.actions.getWorkflowRun.mockResolvedValue({
        data: {
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/test-owner/test-repo/actions/runs/126',
        },
      });
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            { id: 20, name: 'setup', conclusion: 'success' },
            { id: 21, name: 'validate', conclusion: 'success' },
          ],
        },
      });
      mockOctokit.actions.downloadJobLogsForWorkflowRun
        .mockResolvedValueOnce({ data: 'npm ci completed' })
        .mockResolvedValueOnce({ data: '1 passing (5s)' });

      const result = await applier.waitForValidation(126);

      expect(result.passed).toBe(true);
      expect(result.validationResult?.status).toBe('passed');
      expect(mockOctokit.actions.downloadJobLogsForWorkflowRun).toHaveBeenCalledTimes(2);
    });

    it('downgrades success without trustworthy test evidence to inconclusive', async () => {
      const applier = new GitHubFixApplier(createConfig());
      mockOctokit.actions.getWorkflowRun.mockResolvedValue({
        data: {
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/test-owner/test-repo/actions/runs/124',
        },
      });
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [{ id: 11, conclusion: 'success' }] },
      });
      mockOctokit.actions.downloadJobLogsForWorkflowRun.mockResolvedValue({
        data: 'No spec files were found',
      });

      const result = await applier.waitForValidation(124);

      expect(result.passed).toBe(false);
      expect(result.conclusion).toBe('success-without-test-evidence');
      expect(result.validationResult?.status).toBe('inconclusive');
      expect(result.validationResult?.testEvidence?.trustworthy).toBe(false);
      expect(result.validationResult?.testEvidence?.reason).toContain('zero tests ran');
    });

    it('extracts failure details from failed validation logs', async () => {
      const applier = new GitHubFixApplier(createConfig());
      mockOctokit.actions.getWorkflowRun.mockResolvedValue({
        data: {
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/test-owner/test-repo/actions/runs/125',
        },
      });
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [{ id: 12, conclusion: 'failure' }] },
      });
      mockOctokit.actions.downloadJobLogsForWorkflowRun.mockResolvedValue({
        data: '1 failing\nAssertionError: image component should be persisted before preview: expected undefined to exist',
      });

      const result = await applier.waitForValidation(125);

      expect(result.passed).toBe(false);
      expect(result.validationResult?.status).toBe('failed');
      expect(result.validationResult?.failure).toEqual({
        primaryError:
          'AssertionError: image component should be persisted before preview: expected undefined to exist',
        failedAssertion: 'expected undefined to exist',
        failureStage: 'validation',
      });
    });

    it('treats cancelled validation without concrete failure evidence as inconclusive', async () => {
      const applier = new GitHubFixApplier(createConfig());
      mockOctokit.actions.getWorkflowRun.mockResolvedValue({
        data: {
          status: 'completed',
          conclusion: 'cancelled',
          html_url: 'https://github.com/test-owner/test-repo/actions/runs/127',
        },
      });
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: { jobs: [{ id: 13, conclusion: 'cancelled' }] },
      });
      mockOctokit.actions.downloadJobLogsForWorkflowRun.mockResolvedValue({
        data: 'The workflow was cancelled before tests completed',
      });

      const result = await applier.waitForValidation(127);

      expect(result.passed).toBe(false);
      expect(result.validationResult?.status).toBe('inconclusive');
      expect(result.validationResult?.failure).toBeUndefined();
    });
  });

});
