import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';

// Mock all dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('@octokit/rest');
jest.mock('../src/simplified-analyzer');
jest.mock('../src/openai-client');
jest.mock('../src/artifact-fetcher');
jest.mock('../src/repair-context');
jest.mock('../src/repair/simplified-repair-agent');

// Import required modules
import {
  analyzeFailure,
  extractErrorFromLogs,
} from '../src/simplified-analyzer';
import { ArtifactFetcher } from '../src/artifact-fetcher';
import { buildRepairContext } from '../src/repair-context';
import { SimplifiedRepairAgent } from '../src/repair/simplified-repair-agent';
import { run } from '../src/index';

describe('Fix Recommendation Integration', () => {
  let mockCore: jest.Mocked<typeof core>;
  let mockGithub: jest.Mocked<typeof github>;
  let mockOctokit: jest.Mocked<Octokit>;
  let mockAnalyzeFailure: jest.MockedFunction<typeof analyzeFailure>;
  let mockExtractErrorFromLogs: jest.MockedFunction<
    typeof extractErrorFromLogs
  >;
  let mockArtifactFetcher: jest.Mocked<ArtifactFetcher>;
  let mockBuildRepairContext: jest.MockedFunction<typeof buildRepairContext>;
  let mockGenerateFixRecommendation: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup core mocks
    mockCore = core as jest.Mocked<typeof core>;
    mockCore.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        GITHUB_TOKEN: 'github-token',
        OPENAI_API_KEY: 'openai-key',
        CONFIDENCE_THRESHOLD: '70',
        ERROR_MESSAGE: 'Test error message',
      };
      return inputs[name] || '';
    });

    // Setup GitHub context
    mockGithub = github as jest.Mocked<typeof github>;
    (mockGithub.context as any) = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      payload: {},
      runId: 999999,
      sha: 'abc123',
      ref: 'refs/heads/main',
    };

    // Setup Octokit mock
    mockOctokit = {
      actions: {
        getWorkflowRun: jest.fn(),
        listJobsForWorkflowRun: jest.fn(),
      },
    } as any;
    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(
      () => mockOctokit
    );

    // Setup analyzer mocks
    mockAnalyzeFailure = analyzeFailure as jest.MockedFunction<
      typeof analyzeFailure
    >;
    mockExtractErrorFromLogs = extractErrorFromLogs as jest.MockedFunction<
      typeof extractErrorFromLogs
    >;

    // Setup artifact fetcher mock
    mockArtifactFetcher = {
      fetchScreenshots: jest.fn().mockResolvedValue([]),
      fetchLogs: jest.fn().mockResolvedValue(null),
      fetchPRDiff: jest.fn().mockResolvedValue(null),
      fetchTestArtifactLogs: jest.fn().mockResolvedValue(''),
    } as any;
    (
      ArtifactFetcher as jest.MockedClass<typeof ArtifactFetcher>
    ).mockImplementation(() => mockArtifactFetcher);

    // Setup repair context mock
    mockBuildRepairContext = buildRepairContext as jest.MockedFunction<
      typeof buildRepairContext
    >;
    mockBuildRepairContext.mockReturnValue({
      testFile: 'test.cy.ts',
      testName: 'test name',
      errorType: 'ELEMENT_NOT_FOUND',
      errorMessage: 'Element not found',
      errorSelector: '[data-testid="btn"]',
      workflowRunId: '999999',
      jobName: 'test-job',
      commitSha: 'abc123',
      branch: 'main',
      repository: 'test-owner/test-repo',
    });

    // Setup SimplifiedRepairAgent mock
    mockGenerateFixRecommendation = jest.fn();
    (
      SimplifiedRepairAgent as jest.MockedClass<typeof SimplifiedRepairAgent>
    ).mockImplementation(
      () =>
        ({
          generateFixRecommendation: mockGenerateFixRecommendation,
        } as any)
    );
  });

  describe('TEST_ISSUE with fix recommendation', () => {
    it('should generate fix recommendation for TEST_ISSUE verdict', async () => {
      // Setup test data
      const fixRecommendation = {
        confidence: 85,
        summary: 'Fix recommendation summary',
        proposedChanges: [
          {
            file: 'test.cy.ts',
            line: 42,
            oldCode: 'old',
            newCode: 'new',
            justification: 'reason',
          },
        ],
        evidence: ['evidence 1'],
        reasoning: 'Fix reasoning',
      };

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 80,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: ['indicator1'],
      });

      mockGenerateFixRecommendation.mockResolvedValue(fixRecommendation);

      // Run the action
      await run();

      // Verify fix recommendation was attempted
      // SimplifiedRepairAgent now accepts an OpenAI client instance, source fetch context, and config
      expect(SimplifiedRepairAgent).toHaveBeenCalledWith(
        expect.any(Object), // OpenAI client
        expect.objectContaining({
          octokit: expect.any(Object),
          owner: expect.any(String),
          repo: expect.any(String),
          branch: expect.any(String),
        }),
        expect.objectContaining({
          enableAgenticRepair: expect.any(Boolean),
        })
      );
      expect(mockGenerateFixRecommendation).toHaveBeenCalled();

      // Verify repair context was built
      expect(mockBuildRepairContext).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'Test error message',
          repository: 'test-owner/test-repo',
        })
      );

      // Verify outputs include fix recommendation
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'has_fix_recommendation',
        'true'
      );
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'fix_recommendation',
        JSON.stringify(fixRecommendation)
      );
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'fix_summary',
        'Fix recommendation summary'
      );
      expect(mockCore.setOutput).toHaveBeenCalledWith('fix_confidence', '85');

      // Verify triage JSON includes fix recommendation
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        (call) => call[0] === 'triage_json'
      );
      const triageJson = JSON.parse(triageJsonCall[1]);
      expect(triageJson.fixRecommendation).toEqual(fixRecommendation);
      expect(triageJson.metadata.hasFixRecommendation).toBe(true);
    });

    it('should handle when fix recommendation cannot be generated', async () => {
      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 80,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: ['indicator1'],
      });

      mockGenerateFixRecommendation.mockResolvedValue(null);

      // Run the action
      await run();

      // Verify fix recommendation was attempted
      expect(mockGenerateFixRecommendation).toHaveBeenCalled();

      // Verify outputs indicate no fix recommendation
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'has_fix_recommendation',
        'false'
      );
      expect(mockCore.setOutput).not.toHaveBeenCalledWith(
        'fix_recommendation',
        expect.anything()
      );
      expect(mockCore.setOutput).not.toHaveBeenCalledWith(
        'fix_summary',
        expect.anything()
      );
      expect(mockCore.setOutput).not.toHaveBeenCalledWith(
        'fix_confidence',
        expect.anything()
      );

      // Verify triage JSON doesn't include fix recommendation
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        (call) => call[0] === 'triage_json'
      );
      const triageJson = JSON.parse(triageJsonCall[1]);
      expect(triageJson.fixRecommendation).toBeUndefined();
      expect(triageJson.metadata.hasFixRecommendation).toBe(false);
    });

    it('should handle fix recommendation generation errors gracefully', async () => {
      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 80,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: ['indicator1'],
      });

      mockGenerateFixRecommendation.mockRejectedValue(new Error('API error'));

      // Run the action
      await run();

      // Verify error was handled gracefully
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate fix recommendation')
      );

      // Verify outputs indicate no fix recommendation
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'has_fix_recommendation',
        'false'
      );

      // Verify action still completes successfully
      expect(mockCore.setFailed).not.toHaveBeenCalled();
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'TEST_ISSUE');
    });
  });

  describe('PRODUCT_ISSUE verdict', () => {
    it('should not generate fix recommendation for PRODUCT_ISSUE', async () => {
      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'PRODUCT_ISSUE',
        confidence: 85,
        reasoning: 'Product bug detected',
        summary: 'Product issue detected',
        indicators: ['indicator1'],
        suggestedSourceLocations: [
          {
            file: 'app.js',
            lines: '10-20',
            reason: 'Likely bug location',
          },
        ],
      });

      // Run the action
      await run();

      // Verify fix recommendation was NOT attempted
      expect(SimplifiedRepairAgent).not.toHaveBeenCalled();
      expect(mockGenerateFixRecommendation).not.toHaveBeenCalled();

      // Verify outputs don't include fix recommendation
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'has_fix_recommendation',
        'false'
      );
      expect(mockCore.setOutput).not.toHaveBeenCalledWith(
        'fix_recommendation',
        expect.anything()
      );

      // Verify triage JSON includes suggestedSourceLocations but not fixRecommendation
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        (call) => call[0] === 'triage_json'
      );
      const triageJson = JSON.parse(triageJsonCall[1]);
      expect(triageJson.suggestedSourceLocations).toBeDefined();
      expect(triageJson.fixRecommendation).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle missing test file and name gracefully', async () => {
      // Don't set ERROR_MESSAGE to simulate extraction from logs
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          GITHUB_TOKEN: 'github-token',
          OPENAI_API_KEY: 'openai-key',
          CONFIDENCE_THRESHOLD: '70',
          WORKFLOW_RUN_ID: '123456',
        };
        return inputs[name] || '';
      });

      // Mock workflow API calls
      mockOctokit.actions.getWorkflowRun.mockResolvedValue({
        data: { status: 'completed' },
      });

      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValue({
        data: {
          jobs: [
            {
              name: 'test-job',
              conclusion: 'failure',
              steps: [
                {
                  name: 'Run tests',
                  conclusion: 'failure',
                },
              ],
            },
          ],
        },
      });

      mockExtractErrorFromLogs.mockReturnValue({
        message: 'Error without file info',
        framework: 'cypress',
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 75,
        reasoning: 'Test issue',
        summary: 'Test needs update',
        indicators: [],
      });

      const fixRecommendation = {
        confidence: 70,
        summary: 'Fix with unknown file',
        proposedChanges: [],
        evidence: [],
        reasoning: 'Generic fix',
      };

      mockGenerateFixRecommendation.mockResolvedValue(fixRecommendation);

      // Run the action
      await run();

      // Verify repair context was built (may not have 'unknown' for test file/name)
      expect(mockBuildRepairContext).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: expect.any(String),
          repository: 'test-owner/test-repo',
        })
      );

      // Verify fix recommendation was still attempted
      expect(mockGenerateFixRecommendation).toHaveBeenCalled();
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'has_fix_recommendation',
        'true'
      );
    });

    it('should log fix recommendation details when generated', async () => {
      const fixRecommendation = {
        confidence: 90,
        summary: '## Fix Summary\nDetailed fix information',
        proposedChanges: [
          {
            file: 'test1.cy.ts',
            line: 10,
            oldCode: 'old1',
            newCode: 'new1',
            justification: 'fix1',
          },
          {
            file: 'test2.cy.ts',
            line: 20,
            oldCode: 'old2',
            newCode: 'new2',
            justification: 'fix2',
          },
        ],
        evidence: ['evidence1', 'evidence2', 'evidence3'],
        reasoning: 'Detailed reasoning',
      };

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue',
        indicators: [],
      });

      mockGenerateFixRecommendation.mockResolvedValue(fixRecommendation);

      // Run the action
      await run();

      // Verify detailed logging
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('🔧 Fix Recommendation Generated:')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Confidence: 90%')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Changes: 2 file(s)')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Evidence: 3 item(s)')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('📝 Fix Summary:')
      );
      expect(mockCore.info).toHaveBeenCalledWith(fixRecommendation.summary);
    });
  });
});
