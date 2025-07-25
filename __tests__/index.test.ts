import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';

// Mock all dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('@octokit/rest');
jest.mock('../src/analyzer');
jest.mock('../src/openai-client');

// Import analyzer functions
import { analyzeFailure, extractErrorFromLogs } from '../src/analyzer';
import { run } from '../src/index';

describe('GitHub Action', () => {
  let mockCore: jest.Mocked<typeof core>;
  let mockGithub: jest.Mocked<typeof github>;
  let mockOctokit: jest.Mocked<Octokit>;
  let mockAnalyzeFailure: jest.MockedFunction<typeof analyzeFailure>;
  let mockExtractErrorFromLogs: jest.MockedFunction<typeof extractErrorFromLogs>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup core mocks
    mockCore = core as jest.Mocked<typeof core>;
    mockCore.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'GITHUB_TOKEN': 'github-token',
        'OPENAI_API_KEY': 'openai-key',
        'CONFIDENCE_THRESHOLD': '70',
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
    };

    // Setup Octokit mocks
    mockOctokit = {
      actions: {
        getWorkflowRun: jest.fn() as any,
        listJobsForWorkflowRun: jest.fn() as any,
        downloadJobLogsForWorkflowRun: jest.fn() as any,
      },
    } as any;
    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);

    // Setup analyzer mocks
    mockAnalyzeFailure = analyzeFailure as jest.MockedFunction<typeof analyzeFailure>;
    mockExtractErrorFromLogs = extractErrorFromLogs as jest.MockedFunction<typeof extractErrorFromLogs>;
  });

  describe('with direct error message', () => {
    beforeEach(() => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Direct error message',
          'CONFIDENCE_THRESHOLD': '70',
        };
        return inputs[name] || '';
      });
    });

    it('should analyze direct error message successfully', async () => {
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'This is a test timing issue',
        summary: '🧪 **Test Issue**: This is a test timing issue',
        indicators: ['timeout'],
      });

      // Run the action
      await run();

      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          message: 'Direct error message',
          framework: 'unknown',
        })
      );

      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'TEST_ISSUE');
      expect(mockCore.setOutput).toHaveBeenCalledWith('confidence', '85');
      expect(mockCore.setOutput).toHaveBeenCalledWith('reasoning', 'This is a test timing issue');
      expect(mockCore.setOutput).toHaveBeenCalledWith('summary', '🧪 **Test Issue**: This is a test timing issue');
    });

    it('should set inconclusive when confidence is below threshold', async () => {
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 60, // Below threshold of 70
        reasoning: 'Low confidence analysis',
        summary: 'Summary',
      });

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Confidence 60% is below threshold 70%');
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'INCONCLUSIVE');
      expect(mockCore.setOutput).toHaveBeenCalledWith('confidence', '60');
      expect(mockCore.setOutput).toHaveBeenCalledWith('reasoning', 'Low confidence: Low confidence analysis');
      expect(mockCore.setOutput).toHaveBeenCalledWith('summary', 'Analysis inconclusive due to low confidence');
    });
  });

  describe('with workflow run ID', () => {
    beforeEach(() => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'WORKFLOW_RUN_ID': '12345',
          'JOB_NAME': 'test-job',
          'CONFIDENCE_THRESHOLD': '70',
        };
        return inputs[name] || '';
      });
    });

    it('should fetch and analyze workflow logs', async () => {
      // Mock workflow run response
      mockOctokit.actions.getWorkflowRun.mockResolvedValueOnce({
        data: { status: 'completed' },
      } as any);

      // Mock jobs response
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValueOnce({
        data: {
          jobs: [
            {
              id: 1,
              name: 'test-job',
              conclusion: 'failure',
            },
          ],
        },
      } as any);

      // Mock logs response
      const mockLogs = 'Error: Test failed\nat test.js:10';
      mockOctokit.actions.downloadJobLogsForWorkflowRun.mockResolvedValueOnce({
        data: mockLogs,
      } as any);

      // Mock error extraction
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Test failed',
        stackTrace: 'at test.js:10',
        framework: 'jest',
        context: 'Job: test-job',
      });

      // Mock analysis
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        confidence: 90,
        reasoning: 'Application error',
        summary: '🐛 **Product Issue**: Application error',
      });

      await run();

      expect(mockOctokit.actions.getWorkflowRun).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        run_id: 12345,
      });

      expect(mockExtractErrorFromLogs).toHaveBeenCalledWith(mockLogs);
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'PRODUCT_ISSUE');
      expect(mockCore.setOutput).toHaveBeenCalledWith('confidence', '90');
    });

    it('should handle workflow not completed', async () => {
      mockOctokit.actions.getWorkflowRun.mockResolvedValueOnce({
        data: { status: 'in_progress' },
      } as any);

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Workflow run is not completed yet');
      expect(mockCore.setFailed).toHaveBeenCalledWith('No error data found to analyze');
    });

    it('should handle no failed jobs', async () => {
      mockOctokit.actions.getWorkflowRun.mockResolvedValueOnce({
        data: { status: 'completed' },
      } as any);

      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValueOnce({
        data: { jobs: [] },
      } as any);

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('No failed jobs found');
      expect(mockCore.setFailed).toHaveBeenCalledWith('No error data found to analyze');
    });
  });

  describe('with workflow_run event', () => {
    beforeEach(() => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'CONFIDENCE_THRESHOLD': '70',
        };
        return inputs[name] || '';
      });

      // Set up workflow_run event context
      (mockGithub.context as any).payload = {
        workflow_run: {
          id: 67890,
        },
      };
    });

    it('should use workflow_run from event context', async () => {
      mockOctokit.actions.getWorkflowRun.mockResolvedValueOnce({
        data: { status: 'completed' },
      } as any);

      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValueOnce({
        data: {
          jobs: [{
            id: 1,
            name: 'test',
            conclusion: 'failure',
          }],
        },
      } as any);

      mockOctokit.actions.downloadJobLogsForWorkflowRun.mockResolvedValueOnce({
        data: 'Error logs',
      } as any);

      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Error from workflow run',
        framework: 'unknown',
      });

      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 75,
        reasoning: 'Test issue found',
        summary: 'Summary',
      });

      await run();

      expect(mockOctokit.actions.getWorkflowRun).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        run_id: 67890,
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing OpenAI API key', async () => {
      mockCore.getInput.mockImplementation((name: string, options?: any) => {
        if (name === 'OPENAI_API_KEY' && options?.required) {
          throw new Error('Input required and not supplied: OPENAI_API_KEY');
        }
        return '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed: Input required and not supplied: OPENAI_API_KEY');
    });

    it('should handle no error data available', async () => {
      // No error message, no workflow run ID, no event context
      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('No error data found to analyze');
    });

    it('should handle analysis failure', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Some error',
          'CONFIDENCE_THRESHOLD': '70',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockRejectedValueOnce(new Error('OpenAI API error'));

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed: OpenAI API error');
    });

    it('should handle non-Error exceptions', async () => {
      mockCore.getInput.mockImplementation(() => {
        throw 'String error';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('An unknown error occurred');
    });
  });
}); 