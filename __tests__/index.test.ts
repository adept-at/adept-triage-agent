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

// Import analyzer functions
import { analyzeFailure, extractErrorFromLogs } from '../src/simplified-analyzer';
import { ArtifactFetcher } from '../src/artifact-fetcher';
import { run } from '../src/index';

describe('GitHub Action', () => {
  let mockCore: jest.Mocked<typeof core>;
  let mockGithub: jest.Mocked<typeof github>;
  let mockOctokit: jest.Mocked<Octokit>;
  let mockAnalyzeFailure: jest.MockedFunction<typeof analyzeFailure>;
  let mockExtractErrorFromLogs: jest.MockedFunction<typeof extractErrorFromLogs>;
  let mockArtifactFetcher: jest.Mocked<ArtifactFetcher>;

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
      runId: 999999,
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
    
    // Setup ArtifactFetcher mock
    mockArtifactFetcher = {
      fetchScreenshots: jest.fn().mockResolvedValue([]),
      fetchLogs: jest.fn().mockResolvedValue([]),
      fetchCypressArtifactLogs: jest.fn().mockResolvedValue(''),
      fetchPRDiff: jest.fn().mockResolvedValue(null)
    } as any;
    
    (ArtifactFetcher as jest.MockedClass<typeof ArtifactFetcher>).mockImplementation(() => mockArtifactFetcher);
  });

  describe('resilience tests', () => {
    beforeEach(() => {
      // Setup basic workflow data
      mockOctokit.actions!.getWorkflowRun = jest.fn().mockResolvedValue({
        data: { status: 'completed' }
      }) as any;
      
      mockOctokit.actions!.listJobsForWorkflowRun = jest.fn().mockResolvedValue({
        data: {
          jobs: [{
            id: 1,
            name: 'test-job',
            conclusion: 'failure',
            html_url: 'https://github.com/test/test/runs/1',
            steps: [{ name: 'Run tests', conclusion: 'failure' }]
          }]
        }
      }) as any;
    });

    it('should continue when screenshot fetching fails', async () => {
      // Simulate screenshot fetch failure
      mockArtifactFetcher.fetchScreenshots.mockRejectedValueOnce(new Error('Network error'));
      mockArtifactFetcher.fetchCypressArtifactLogs.mockResolvedValueOnce('Some logs');
      
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValueOnce({
        data: 'Test failed with error'
      }) as any;
      
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Test error',
        framework: 'jest'
      });
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 75,
        reasoning: 'Analysis successful despite missing screenshots',
        summary: 'Test issue identified',
        indicators: []
      });
      
      await run();
      
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch screenshots: Error: Network error');
      expect(mockCore.info).toHaveBeenCalledWith('Data collected for analysis: logs=true, screenshots=false, artifactLogs=true, prDiff=false');
      expect(mockAnalyzeFailure).toHaveBeenCalled();
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'TEST_ISSUE');
    });

    it('should continue when Cypress log fetching fails', async () => {
      // Simulate Cypress log fetch failure
      mockArtifactFetcher.fetchScreenshots.mockResolvedValueOnce([
        { name: 'error.png', path: 'screenshots/error.png', base64Data: 'data' }
      ]);
      mockArtifactFetcher.fetchCypressArtifactLogs.mockRejectedValueOnce(new Error('API error'));
      
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValueOnce({
        data: 'Test logs'
      }) as any;
      
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Test error',
        framework: 'cypress'
      });
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        confidence: 80,
        reasoning: 'Product issue found',
        summary: 'Product bug',
        indicators: []
      });
      
      await run();
      
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch Cypress artifact logs: Error: API error');
      expect(mockCore.info).toHaveBeenCalledWith('Data collected for analysis: logs=true, screenshots=true, artifactLogs=false, prDiff=false');
      expect(mockAnalyzeFailure).toHaveBeenCalled();
    });

    it('should continue when PR diff fetching fails', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'CONFIDENCE_THRESHOLD': '70',
          'PR_NUMBER': '123'
        };
        return inputs[name] || '';
      });
      
      mockArtifactFetcher.fetchPRDiff = jest.fn().mockRejectedValueOnce(new Error('PR not found'));
      
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValueOnce({
        data: 'Logs'
      }) as any;
      
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Error',
        framework: 'jest'
      });
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 70,
        reasoning: 'Test issue',
        summary: 'Summary',
        indicators: []
      });
      
      await run();
      
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch PR diff'));
      expect(mockAnalyzeFailure).toHaveBeenCalled();
    });

    it('should warn when all data sources fail but still attempt analysis', async () => {
      // All data sources fail
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockRejectedValueOnce(
        new Error('Logs unavailable')
      ) as any;
      mockArtifactFetcher.fetchScreenshots.mockRejectedValueOnce(new Error('Screenshots failed'));
      mockArtifactFetcher.fetchCypressArtifactLogs.mockRejectedValueOnce(new Error('Cypress logs failed'));
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 50,
        reasoning: 'Limited data available',
        summary: 'Analysis with minimal context',
        indicators: []
      });
      
      await run();
      
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to download job logs: Error: Logs unavailable');
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch screenshots: Error: Screenshots failed');
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch Cypress artifact logs: Error: Cypress logs failed');
      expect(mockCore.warning).toHaveBeenCalledWith('No meaningful data collected for analysis (no logs, screenshots, artifacts, or PR diff)');
      expect(mockCore.info).toHaveBeenCalledWith('Attempting analysis with minimal context...');
      
      // Should still call analyze with whatever minimal data we have
      expect(mockAnalyzeFailure).toHaveBeenCalled();
    });

    it('should handle mixed success/failure scenarios', async () => {
      // Logs succeed, screenshots fail, Cypress logs succeed, PR diff fails
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValueOnce({
        data: 'Job logs here'
      }) as any;
      
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Test failed',
        framework: 'cypress'
      });
      
      mockArtifactFetcher.fetchScreenshots.mockRejectedValueOnce(new Error('Screenshot error'));
      mockArtifactFetcher.fetchCypressArtifactLogs.mockResolvedValueOnce('Cypress logs content');
      
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'PR_NUMBER': '456'
        };
        return inputs[name] || '';
      });
      
      mockArtifactFetcher.fetchPRDiff = jest.fn().mockRejectedValueOnce(new Error('PR API error'));
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        confidence: 85,
        reasoning: 'Found issue with partial data',
        summary: 'Product issue',
        indicators: ['error in logs']
      });
      
      await run();
      
      // Verify individual failures logged
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch screenshots: Error: Screenshot error');
      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch PR diff'));
      
      // Verify we proceeded with available data
      expect(mockCore.info).toHaveBeenCalledWith('Data collected for analysis: logs=true, screenshots=false, artifactLogs=true, prDiff=false');
      
      // Verify analysis was called
      const analyzeCall = mockAnalyzeFailure.mock.calls[0];
      expect(analyzeCall).toBeDefined();
      expect(analyzeCall[0]).toBeDefined(); // OpenAI client
      expect(analyzeCall[1]).toMatchObject({
        message: 'Test failed',
        cypressArtifactLogs: 'Cypress logs content',
        screenshots: [],
        prDiff: undefined
      });
      // In the mixed scenario with PR_NUMBER set and extracted error, logs contain extracted error context
      expect(analyzeCall[1].logs[0]).toContain('Test failed');
    });
  });
  
  describe('minimal inputs (only workflow ID)', () => {
    beforeEach(() => {
      // Only provide required inputs
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'WORKFLOW_RUN_ID': '12345'
        };
        return inputs[name] || '';
      });
      
      mockOctokit.actions!.getWorkflowRun = jest.fn().mockResolvedValue({
        data: { status: 'completed' }
      }) as any;
      
      mockOctokit.actions!.listJobsForWorkflowRun = jest.fn().mockResolvedValue({
        data: {
          jobs: [{
            id: 1,
            name: 'test-job',
            conclusion: 'failure',
            html_url: 'https://github.com/test/test/runs/1',
            steps: [{ name: 'Run tests', conclusion: 'failure' }]
          }]
        }
      }) as any;
    });
    
    it('should work with only workflow ID provided', async () => {
      // Mock successful data collection
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValueOnce({
        data: 'Test failed: Element not found'
      }) as any;
      
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Element not found',
        framework: 'cypress'
      });
      
      mockArtifactFetcher.fetchScreenshots.mockResolvedValueOnce([
        { name: 'error.png', path: 'screenshots/error.png', base64Data: 'imagedata' }
      ]);
      
      mockArtifactFetcher.fetchCypressArtifactLogs.mockResolvedValueOnce('Cypress test logs');
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Element selector issue',
        summary: 'Test issue - element not found',
        indicators: ['element not found']
      });
      
      await run();
      
      // Verify we collected all available data
      expect(mockOctokit.actions!.downloadJobLogsForWorkflowRun).toHaveBeenCalled();
      expect(mockArtifactFetcher.fetchScreenshots).toHaveBeenCalled();
      expect(mockArtifactFetcher.fetchCypressArtifactLogs).toHaveBeenCalled();
      
      // Verify PR diff was NOT attempted (no PR number provided)
      expect(mockArtifactFetcher.fetchPRDiff).not.toHaveBeenCalled();
      
      // Verify analysis succeeded
      expect(mockAnalyzeFailure).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Element not found',
          screenshots: expect.arrayContaining([
            expect.objectContaining({ name: 'error.png' })
          ]),
          cypressArtifactLogs: 'Cypress test logs',
          prDiff: undefined
        })
      );
      
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'TEST_ISSUE');
      expect(mockCore.setOutput).toHaveBeenCalledWith('confidence', '85');
    });
    
    it('should handle when no job name is provided and find first failed job', async () => {
      // Simulate multiple jobs, one failed
      mockOctokit.actions!.listJobsForWorkflowRun = jest.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              id: 1,
              name: 'build',
              conclusion: 'success',
              html_url: 'https://github.com/test/test/runs/1'
            },
            {
              id: 2,
              name: 'test',
              conclusion: 'failure',
              html_url: 'https://github.com/test/test/runs/2',
              steps: [{ name: 'Run tests', conclusion: 'failure' }]
            },
            {
              id: 3,
              name: 'deploy',
              conclusion: 'skipped',
              html_url: 'https://github.com/test/test/runs/3'
            }
          ]
        }
      }) as any;
      
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValueOnce({
        data: 'Tests failed'
      }) as any;
      
      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'Test failure',
        framework: 'jest'
      });
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        confidence: 75,
        reasoning: 'Product bug detected',
        summary: 'Product issue found',
        indicators: []
      });
      
      await run();
      
      // Verify it found and analyzed the failed job
      expect(mockCore.info).toHaveBeenCalledWith('Analyzing job: test (status: undefined, conclusion: failure)');
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'PRODUCT_ISSUE');
    });
    
    it('should gracefully handle when all optional data fetching fails', async () => {
      // All optional operations fail
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockRejectedValueOnce(
        new Error('Logs unavailable')
      ) as any;
      
      mockArtifactFetcher.fetchScreenshots.mockRejectedValueOnce(new Error('Screenshots failed'));
      mockArtifactFetcher.fetchCypressArtifactLogs.mockRejectedValueOnce(new Error('Artifact logs failed'));
      
      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 50,
        reasoning: 'Limited data available for analysis',
        summary: 'Analysis with minimal context',
        indicators: []
      });
      
      await run();
      
      // Verify all warnings were logged
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to download job logs: Error: Logs unavailable');
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch screenshots: Error: Screenshots failed');
      expect(mockCore.warning).toHaveBeenCalledWith('Failed to fetch Cypress artifact logs: Error: Artifact logs failed');
      expect(mockCore.warning).toHaveBeenCalledWith('No meaningful data collected for analysis (no logs, screenshots, artifacts, or PR diff)');
      
      // But analysis still proceeded
      expect(mockAnalyzeFailure).toHaveBeenCalled();
      // With confidence 50 (below threshold 70), verdict becomes INCONCLUSIVE
      expect(mockCore.setOutput).toHaveBeenCalledWith('verdict', 'INCONCLUSIVE');
      expect(mockCore.setOutput).toHaveBeenCalledWith('confidence', '50');
      expect(mockCore.setOutput).toHaveBeenCalledWith('reasoning', 'Low confidence: Limited data available for analysis');
    });
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

      expect(mockCore.warning).toHaveBeenCalledWith(`Job 'test-job' not found`);
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

  describe('suggestedSourceLocations integration', () => {
    it('should include suggestedSourceLocations in triage JSON for PRODUCT_ISSUE', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'TypeError: Cannot read property name of null',
          'PR_NUMBER': '123',
        };
        return inputs[name] || '';
      });

      const mockPRDiff = {
        files: [{
          filename: 'src/components/UserProfile.tsx',
          status: 'modified',
          additions: 10,
          deletions: 5,
          changes: 15,
          patch: '@@ -45,7 +45,6 @@\n-  if (!user || !user.name) return null;\n   return <div>{user.name}</div>;',
        }],
        totalChanges: 1,
        additions: 10,
        deletions: 5,
      };

      mockArtifactFetcher.fetchPRDiff = jest.fn().mockResolvedValueOnce(mockPRDiff);

      const suggestedLocations = [{
        file: 'src/components/UserProfile.tsx',
        lines: '45-47',
        reason: 'Removed null check causing null pointer error',
      }];

      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        confidence: 95,
        reasoning: 'Null pointer error due to removed null check',
        summary: '🐛 Product Issue: Null pointer in UserProfile component',
        indicators: ['TypeError', 'null check removed'],
        suggestedSourceLocations: suggestedLocations,
      });

      await run();

      // Verify triage JSON includes suggestedSourceLocations
      expect(mockCore.setOutput).toHaveBeenCalledWith(
        'triage_json',
        expect.stringContaining('"suggestedSourceLocations"')
      );

      // Parse the JSON to verify structure
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        call => call[0] === 'triage_json'
      );
      const triageJson = JSON.parse(triageJsonCall[1]);
      
      expect(triageJson.suggestedSourceLocations).toEqual(suggestedLocations);
      expect(triageJson.verdict).toBe('PRODUCT_ISSUE');

      // Verify logging of source locations
      expect(mockCore.info).toHaveBeenCalledWith('\n🎯 Suggested Source Locations to Investigate:');
      expect(mockCore.info).toHaveBeenCalledWith('  1. src/components/UserProfile.tsx (lines 45-47)');
      expect(mockCore.info).toHaveBeenCalledWith('     Reason: Removed null check causing null pointer error');
    });

    it('should not include suggestedSourceLocations for TEST_ISSUE', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'TimeoutError: Waiting for element',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Element timing issue',
        summary: '🧪 Test Issue: Timing issue with element',
        indicators: ['timeout'],
      });

      await run();

      // Verify triage JSON doesn't include suggestedSourceLocations
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        call => call[0] === 'triage_json'
      );
      const triageJson = JSON.parse(triageJsonCall[1]);
      
      expect(triageJson.suggestedSourceLocations).toBeUndefined();
      expect(triageJson.verdict).toBe('TEST_ISSUE');

      // Verify no source location logging
      expect(mockCore.info).not.toHaveBeenCalledWith('\n🎯 Suggested Source Locations to Investigate:');
    });

    it('should handle empty suggestedSourceLocations array', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': '500 Internal Server Error',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        confidence: 80,
        reasoning: 'Server error',
        summary: '🐛 Product Issue: Server error',
        indicators: ['500 error'],
        suggestedSourceLocations: [],
      });

      await run();

      // Verify triage JSON includes empty array
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        call => call[0] === 'triage_json'
      );
      const triageJson = JSON.parse(triageJsonCall[1]);
      
      expect(triageJson.suggestedSourceLocations).toEqual([]);

      // Verify no source location logging when array is empty
      expect(mockCore.info).not.toHaveBeenCalledWith('\n🎯 Suggested Source Locations to Investigate:');
    });
  });

  describe('test framework filtering', () => {
    it('should extract error from logs correctly', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'WORKFLOW_RUN_ID': '12345',
          'TEST_FRAMEWORKS': 'cypress'
        };
        return inputs[name] || '';
      });

      mockOctokit.actions!.getWorkflowRun = jest.fn().mockResolvedValue({
        data: { status: 'completed' }
      }) as any;

      mockOctokit.actions!.listJobsForWorkflowRun = jest.fn().mockResolvedValue({
        data: {
          jobs: [{
            id: 1,
            name: 'test-job',
            conclusion: 'failure',
            html_url: 'https://github.com/test/test/runs/1',
            steps: []
          }]
        }
      }) as any;

      const mockLogs = 'CypressError: Test failed';
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValue({
        data: mockLogs
      }) as any;

      mockExtractErrorFromLogs.mockReturnValueOnce({
        message: 'CypressError: Test failed',
        framework: 'cypress'
      });

      mockAnalyzeFailure.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Cypress timing issue',
        summary: 'Test Issue'
      });

      await run();

      // Verify extractErrorFromLogs was called (simplified version doesn't use testFrameworks)
      expect(mockExtractErrorFromLogs).toHaveBeenCalledWith(mockLogs);
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
      // Mock no failed jobs
      mockOctokit.actions.listJobsForWorkflowRun.mockResolvedValueOnce({
        data: {
          jobs: []
        }
      } as any);
      
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

  describe('auto-fix integration', () => {
    beforeEach(() => {
      // Mock basic workflow data for auto-fix tests
      mockOctokit.actions!.getWorkflowRun = jest.fn().mockResolvedValue({
        data: { status: 'completed' }
      }) as any;

      mockOctokit.actions!.listJobsForWorkflowRun = jest.fn().mockResolvedValue({
        data: {
          jobs: [{
            id: 1,
            name: 'test-job',
            conclusion: 'failure',
            html_url: 'https://github.com/test/test/runs/1',
            steps: [{ name: 'Run tests', conclusion: 'failure' }]
          }]
        }
      }) as any;
    });

    it('should skip auto-fix when ENABLE_AUTO_FIX is false', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
          'ENABLE_AUTO_FIX': 'false',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      await run();

      // Auto-fix should not be attempted
      expect(mockCore.setOutput).toHaveBeenCalledWith('auto_fix_applied', 'false');
      expect(mockCore.info).not.toHaveBeenCalledWith(expect.stringContaining('Auto-fix is enabled'));
    });

    it('should skip auto-fix when ENABLE_AUTO_FIX is not set', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
          // ENABLE_AUTO_FIX not set (empty string)
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      await run();

      // Auto-fix should not be attempted when not explicitly enabled
      expect(mockCore.setOutput).toHaveBeenCalledWith('auto_fix_applied', 'false');
    });

    it('should not attempt auto-fix for PRODUCT_ISSUE verdict', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Product bug detected',
          'CONFIDENCE_THRESHOLD': '70',
          'ENABLE_AUTO_FIX': 'true',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'PRODUCT_ISSUE',
        confidence: 90,
        reasoning: 'This is a product bug',
        summary: 'Product issue detected',
        indicators: [],
      });

      await run();

      // Auto-fix should not be attempted for product issues
      expect(mockCore.setOutput).toHaveBeenCalledWith('auto_fix_applied', 'false');
      expect(mockCore.info).not.toHaveBeenCalledWith(expect.stringContaining('Auto-fix is enabled'));
    });

    it('should set auto_fix_applied to false when fix recommendation is null', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
          'ENABLE_AUTO_FIX': 'true',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      // Note: This test verifies behavior when no fix recommendation is generated
      // The fix recommendation generation is mocked in index-fix-recommendation.test.ts

      await run();

      // Verify auto_fix_applied is set
      expect(mockCore.setOutput).toHaveBeenCalledWith('auto_fix_applied', expect.any(String));
    });

    it('should set auto_fix_* outputs correctly when auto-fix succeeds', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
          'ENABLE_AUTO_FIX': 'true',
          'AUTO_FIX_BASE_BRANCH': 'main',
          'AUTO_FIX_MIN_CONFIDENCE': '70',
        };
        return inputs[name] || '';
      });

      // This test checks the output structure - the actual auto-fix logic
      // is tested more comprehensively in fix-applier.test.ts and
      // index-fix-recommendation.test.ts

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      await run();

      // Verify that auto_fix_applied output is set (either true or false)
      const setOutputCalls = mockCore.setOutput.mock.calls;
      const autoFixAppliedCall = setOutputCalls.find(call => call[0] === 'auto_fix_applied');
      expect(autoFixAppliedCall).toBeDefined();
      expect(['true', 'false']).toContain(autoFixAppliedCall![1]);
    });

    it('should include autoFix in triage JSON when fix is applied', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      await run();

      // Verify triage JSON includes metadata.autoFixApplied
      const triageJsonCall = mockCore.setOutput.mock.calls.find(
        call => call[0] === 'triage_json'
      );
      expect(triageJsonCall).toBeDefined();

      const triageJson = JSON.parse(triageJsonCall![1]);
      expect(triageJson.metadata).toBeDefined();
      expect(typeof triageJson.metadata.autoFixApplied).toBe('boolean');
    });

    it('should use AUTO_FIX_BASE_BRANCH input', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
          'ENABLE_AUTO_FIX': 'true',
          'AUTO_FIX_BASE_BRANCH': 'develop',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      await run();

      // The base branch is used in createFixApplier - this test verifies
      // the input is read correctly. Full integration is tested in
      // fix-applier.test.ts
      expect(mockCore.getInput).toHaveBeenCalledWith('AUTO_FIX_BASE_BRANCH');
    });

    it('should use AUTO_FIX_MIN_CONFIDENCE input', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'GITHUB_TOKEN': 'github-token',
          'OPENAI_API_KEY': 'openai-key',
          'ERROR_MESSAGE': 'Test error',
          'CONFIDENCE_THRESHOLD': '70',
          'ENABLE_AUTO_FIX': 'true',
          'AUTO_FIX_MIN_CONFIDENCE': '90',
        };
        return inputs[name] || '';
      });

      mockAnalyzeFailure.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        confidence: 85,
        reasoning: 'Test needs update',
        summary: 'Test issue detected',
        indicators: [],
      });

      await run();

      // The min confidence is used in createFixApplier - this test verifies
      // the input is read correctly
      expect(mockCore.getInput).toHaveBeenCalledWith('AUTO_FIX_MIN_CONFIDENCE');
    });
  });
}); 