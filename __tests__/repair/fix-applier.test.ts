import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs/promises';
import {
  GitHubFixApplier,
  generateFixBranchName,
  generateFixCommitMessage,
  ApplyResult,
} from '../../src/repair/fix-applier';
import { FixRecommendation } from '../../src/types';
import { AUTO_FIX } from '../../src/config/constants';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('fs/promises');

describe('fix-applier', () => {
  let mockCore: jest.Mocked<typeof core>;
  let mockExec: jest.Mocked<typeof exec>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCore = core as jest.Mocked<typeof core>;
    mockExec = exec as jest.Mocked<typeof exec>;
    mockFs = fs as jest.Mocked<typeof fs>;

    // Default successful exec mock
    mockExec.exec.mockResolvedValue(0);
  });

  describe('GitHubFixApplier.canApply()', () => {
    const applier = new GitHubFixApplier({
      baseBranch: 'main',
      minConfidence: 70,
    });

    it('should return false when confidence is below threshold', () => {
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
      const highThresholdApplier = new GitHubFixApplier({
        baseBranch: 'main',
        minConfidence: 90,
      });

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
      applier = new GitHubFixApplier({
        baseBranch: 'main',
        minConfidence: 70,
      });
    });

    it('should successfully create branch, apply changes, commit, and push', async () => {
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

      // Mock file read with content containing old code
      mockFs.readFile.mockResolvedValue('const test = cy.get(".old-selector").click();');
      mockFs.writeFile.mockResolvedValue(undefined);

      // Mock getting commit SHA
      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (args && args[0] === 'rev-parse' && args[1] === 'HEAD') {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from('abc123def456\n'));
          }
        }
        return 0;
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain('cypress/e2e/test.cy.ts');
      expect(result.commitSha).toBe('abc123def456');
      expect(result.branchName).toMatch(/^fix\/triage-agent\/cypress-e2e-test-cy-ts-\d{8}$/);
      expect(result.error).toBeUndefined();

      // Verify git commands were called
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['fetch', 'origin', 'main']);
      expect(mockExec.exec).toHaveBeenCalledWith('git', expect.arrayContaining(['checkout', '-b']));
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['add', 'cypress/e2e/test.cy.ts']);
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['commit', '-m', expect.any(String)]);
      expect(mockExec.exec).toHaveBeenCalledWith('git', expect.arrayContaining(['push', '-u', 'origin']));

      // Verify file was written with new content
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'cypress/e2e/test.cy.ts',
        'const test = cy.get(".new-selector").click();',
        'utf-8'
      );
    });

    it('should handle file read errors gracefully', async () => {
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

      // Mock file read failure
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.error).toBe('No files were successfully modified');
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to modify cypress/e2e/missing.cy.ts')
      );

      // Verify cleanup was attempted
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['checkout', '-']);
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['branch', '-D', expect.any(String)]);
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
      mockFs.readFile.mockResolvedValue('const test = cy.get(".different-selector").click();');

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.error).toBe('No files were successfully modified');
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Could not find old code to replace in cypress/e2e/test.cy.ts'
      );
    });

    it('should clean up branch on failure during git operations', async () => {
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

      mockFs.readFile.mockResolvedValue('const test = old;');
      mockFs.writeFile.mockResolvedValue(undefined);

      // Simulate push failure
      let callCount = 0;
      mockExec.exec.mockImplementation(async (cmd, args) => {
        callCount++;
        if (args && args[0] === 'push') {
          throw new Error('Permission denied');
        }
        return 0;
      });

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
      expect(mockCore.error).toHaveBeenCalledWith('Failed to apply fix: Permission denied');

      // Verify cleanup was attempted
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['checkout', '-']);
      expect(mockExec.exec).toHaveBeenCalledWith('git', ['branch', '-D', expect.any(String)]);
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

      mockFs.readFile.mockImplementation(async (path) => {
        if (path === 'file1.ts') return 'const x = oldCode1;';
        if (path === 'file2.ts') return 'const y = oldCode2;';
        throw new Error('Unknown file');
      });
      mockFs.writeFile.mockResolvedValue(undefined);

      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (args && args[0] === 'rev-parse') {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from('sha123456789\n'));
          }
        }
        return 0;
      });

      const result = await applier.applyFix(recommendation);

      expect(result).toEqual<ApplyResult>({
        success: true,
        modifiedFiles: ['file1.ts', 'file2.ts'],
        commitSha: 'sha123456789',
        branchName: expect.stringMatching(/^fix\/triage-agent\/file1-ts-\d{8}$/),
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

      mockFs.readFile.mockResolvedValue('different content');

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

      mockFs.readFile.mockImplementation(async (path) => {
        if (path === 'success.ts') return 'const x = oldCode;';
        throw new Error('File not found');
      });
      mockFs.writeFile.mockResolvedValue(undefined);

      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (args && args[0] === 'rev-parse') {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from('commitsha\n'));
          }
        }
        return 0;
      });

      const result = await applier.applyFix(recommendation);

      // Should succeed with partial modifications
      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(['success.ts']);
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to modify missing.ts')
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

      mockFs.readFile.mockResolvedValue('some content');

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No files were successfully modified');
    });

    it('should use configured base branch for checkout', async () => {
      const customApplier = new GitHubFixApplier({
        baseBranch: 'develop',
        minConfidence: 70,
      });

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

      mockFs.readFile.mockResolvedValue('const x = old;');
      mockFs.writeFile.mockResolvedValue(undefined);

      mockExec.exec.mockImplementation(async (cmd, args, options) => {
        if (args && args[0] === 'rev-parse') {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from('sha\n'));
          }
        }
        return 0;
      });

      await customApplier.applyFix(recommendation);

      expect(mockExec.exec).toHaveBeenCalledWith('git', ['fetch', 'origin', 'develop']);
      expect(mockExec.exec).toHaveBeenCalledWith('git', [
        'checkout',
        '-b',
        expect.any(String),
        'origin/develop',
      ]);
    });

    it('should handle git command failure with non-zero exit code', async () => {
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

      // Simulate fetch failure
      mockExec.exec.mockResolvedValueOnce(1);

      const result = await applier.applyFix(recommendation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git command failed: git fetch origin main');
    });
  });

  describe('generateFixBranchName()', () => {
    it('should generate correct branch name format with AUTO_FIX.BRANCH_PREFIX', () => {
      const fixedDate = new Date('2024-03-15T10:00:00Z');
      const branchName = generateFixBranchName('cypress/e2e/test.cy.ts', fixedDate);

      expect(branchName).toBe(`${AUTO_FIX.BRANCH_PREFIX}cypress-e2e-test-cy-ts-20240315`);
    });

    it('should sanitize special characters in test file names', () => {
      const fixedDate = new Date('2024-03-15T10:00:00Z');

      // Test with various special characters
      expect(generateFixBranchName('test@file#name!.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-file-name-ts-20240315`
      );

      // Test with spaces
      expect(generateFixBranchName('test file name.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-file-name-ts-20240315`
      );

      // Test with multiple consecutive special chars
      expect(generateFixBranchName('test///file---name.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-file-name-ts-20240315`
      );

      // Test with leading/trailing special chars
      expect(generateFixBranchName('---test.ts---', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-ts-20240315`
      );
    });

    it('should include date in branch name in YYYYMMDD format', () => {
      const dates = [
        { date: new Date('2024-01-01T00:00:00Z'), expected: '20240101' },
        { date: new Date('2024-12-31T23:59:59Z'), expected: '20241231' },
        { date: new Date('2025-06-15T12:30:00Z'), expected: '20250615' },
      ];

      dates.forEach(({ date, expected }) => {
        const branchName = generateFixBranchName('test.ts', date);
        expect(branchName).toContain(expected);
      });
    });

    it('should truncate long file names to 50 characters', () => {
      const fixedDate = new Date('2024-03-15T10:00:00Z');
      const longFileName =
        'this-is-a-very-long-file-name-that-exceeds-the-maximum-allowed-length-for-branch-names.ts';

      const branchName = generateFixBranchName(longFileName, fixedDate);

      // Prefix + truncated name (50 chars) + date (9 chars including dash)
      const expectedPrefix = AUTO_FIX.BRANCH_PREFIX;
      const truncatedPart = branchName.slice(expectedPrefix.length, -9); // Remove prefix and -YYYYMMDD

      expect(truncatedPart.length).toBeLessThanOrEqual(50);
    });

    it('should use current date if no timestamp provided', () => {
      const branchName = generateFixBranchName('test.ts');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      expect(branchName).toContain(today);
    });

    it('should handle file paths with multiple extensions', () => {
      const fixedDate = new Date('2024-03-15T10:00:00Z');

      expect(generateFixBranchName('test.spec.cy.ts', fixedDate)).toBe(
        `${AUTO_FIX.BRANCH_PREFIX}test-spec-cy-ts-20240315`
      );
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
