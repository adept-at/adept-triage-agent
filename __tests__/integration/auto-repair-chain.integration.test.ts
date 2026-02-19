/**
 * Auto-repair chain integration test.
 * Covers FixApplier: confidence threshold, branch creation, validation trigger (workflow_dispatch inputs).
 *
 * Run: npm run test:integration -- --testPathPattern=auto-repair-chain
 */

import { Octokit } from '@octokit/rest';
import {
  GitHubFixApplier,
  createFixApplier,
  ApplyResult,
} from '../../src/repair/fix-applier';
import type { FixRecommendation } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

describe('Auto-repair chain integration', () => {
  const baseRecommendation: FixRecommendation = {
    confidence: 85,
    summary: 'Update selector',
    proposedChanges: [
      {
        file: 'cypress/e2e/login.cy.ts',
        line: 25,
        oldCode: "cy.get('[data-testid=\"submit\"]')",
        newCode: "cy.get('[data-testid=\"submit-button\"]')",
        justification: 'Selector renamed',
      },
    ],
    evidence: ['Button uses data-testid="submit-button"'],
    reasoning: 'Selector mismatch',
  };

  it('should not apply when confidence is below threshold', () => {
    const mockOctokit = {
      git: {
        getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'base-sha' } } }),
        createRef: jest.fn(),
        deleteRef: jest.fn(),
      },
      repos: {
        getContent: jest.fn(),
        createOrUpdateFileContents: jest.fn(),
      },
      actions: {},
    } as unknown as Octokit;

    const applier = createFixApplier({
      octokit: mockOctokit,
      owner: 'test-owner',
      repo: 'test-repo',
      baseBranch: 'main',
      minConfidence: 90,
      enableValidation: false,
    });

    const canApply = applier.canApply({
      ...baseRecommendation,
      confidence: 85,
    });
    expect(canApply).toBe(false);
    expect(mockOctokit.git.createRef).not.toHaveBeenCalled();
  });

  it('should create branch and commit when confidence meets threshold', async () => {
    const mockOctokit = {
      git: {
        getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'base-sha' } } }),
        createRef: jest.fn().mockResolvedValue({
          data: { ref: 'refs/heads/fix/triage-agent/login-20240315-120000' },
        }),
        deleteRef: jest.fn().mockResolvedValue({}),
      },
      repos: {
        getContent: jest.fn().mockResolvedValue({
          data: {
            type: 'file',
            content: Buffer.from("cy.get('[data-testid=\"submit\"]').click();").toString('base64'),
            sha: 'file-sha-123',
          },
        }),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'new-commit-sha' } },
        }),
      },
      actions: {},
    } as unknown as Octokit;

    const applier = createFixApplier({
      octokit: mockOctokit,
      owner: 'test-owner',
      repo: 'test-repo',
      baseBranch: 'main',
      minConfidence: 70,
      enableValidation: false,
    });

    const result = await applier.applyFix(baseRecommendation);
    expect(result.success).toBe(true);
    expect(result.branchName).toBeDefined();
    expect(result.commitSha).toBe('new-commit-sha');
    expect(mockOctokit.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: expect.stringMatching(/^refs\/heads\/fix\/triage-agent\//),
        sha: 'base-sha',
      })
    );
    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.any(String),
        path: 'cypress/e2e/login.cy.ts',
      })
    );
  });

  it('should call createWorkflowDispatch with correct inputs when validation enabled', async () => {
    const createWorkflowDispatch = jest.fn().mockResolvedValue({});
    const listWorkflowRuns = jest
      .fn()
      .mockResolvedValueOnce({ data: { workflow_runs: [{ id: 999, html_url: 'https://example.com' }] } });

    const mockOctokit = {
      git: {
        getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'base-sha' } } }),
        createRef: jest.fn().mockResolvedValue({
          data: { ref: 'refs/heads/fix/triage-agent/login-20240315-120000' },
        }),
        deleteRef: jest.fn().mockResolvedValue({}),
      },
      repos: {
        getContent: jest.fn().mockResolvedValue({
          data: {
            type: 'file',
            content: Buffer.from("cy.get('[data-testid=\"submit\"]').click();").toString('base64'),
            sha: 'file-sha-123',
          },
        }),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'new-commit-sha' } },
        }),
      },
      actions: {
        createWorkflowDispatch,
        listWorkflowRuns,
      },
    } as unknown as Octokit;

    const applier = new GitHubFixApplier({
      octokit: mockOctokit,
      owner: 'test-owner',
      repo: 'test-repo',
      baseBranch: 'main',
      minConfidence: 70,
      enableValidation: true,
      validationWorkflow: 'validate-fix.yml',
    });

    await applier.applyFix(baseRecommendation);
    const triggerResult = await applier.triggerValidation({
      branch: 'fix/triage-agent/login-20240315-120000',
      spec: 'cypress/e2e/login.cy.ts',
      previewUrl: 'https://preview.example.com',
      triageRunId: '12345',
    });

    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      workflow_id: 'validate-fix.yml',
      ref: 'main',
      inputs: {
        branch: 'fix/triage-agent/login-20240315-120000',
        spec: 'cypress/e2e/login.cy.ts',
        preview_url: 'https://preview.example.com',
        triage_run_id: '12345',
        fix_branch_name: 'fix/triage-agent/login-20240315-120000',
      },
    });
    expect(triggerResult).not.toBeNull();
    expect(triggerResult?.runId).toBe(999);
  });
});
