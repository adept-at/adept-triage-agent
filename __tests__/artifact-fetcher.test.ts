import { ArtifactFetcher } from '../src/artifact-fetcher';
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';
import * as github from '@actions/github';
import AdmZip from 'adm-zip';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  }
}));

describe('ArtifactFetcher', () => {
  let artifactFetcher: ArtifactFetcher;
  let mockOctokit: jest.Mocked<Partial<Octokit>>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOctokit = {
      actions: {
        listWorkflowRunArtifacts: jest.fn(),
        downloadArtifact: jest.fn(),
        downloadJobLogsForWorkflowRun: jest.fn()
      }
    } as any;
    
    artifactFetcher = new ArtifactFetcher(mockOctokit as Octokit);
  });

  describe('fetchScreenshots', () => {
    it('should return empty array when no artifacts found', async () => {
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 0,
          artifacts: []
        }
      });

      const result = await artifactFetcher.fetchScreenshots('123');
      
      expect(result).toEqual([]);
      expect(core.info).toHaveBeenCalledWith('Found 0 artifacts');
    });

    it('should fetch and extract screenshots from artifacts', async () => {
      const mockArtifacts = [
        {
          id: 1,
          name: 'cypress-screenshots',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 1,
          artifacts: mockArtifacts
        }
      });

      // Create a mock ZIP file with a screenshot
      const zip = new AdmZip();
      const screenshotData = Buffer.from('fake-image-data');
      zip.addFile('cypress/screenshots/test.spec.js/test-failure.png', screenshotData);
      
      mockOctokit.actions!.downloadArtifact = jest.fn().mockResolvedValue({
        data: zip.toBuffer()
      });

      const result = await artifactFetcher.fetchScreenshots('123');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'test-failure.png',
        path: 'cypress/screenshots/test.spec.js/test-failure.png',
        base64Data: screenshotData.toString('base64'),
        timestamp: '2024-01-01T00:00:00Z'
      });
    });

    it('should filter artifacts by job name when provided', async () => {
      const mockArtifacts = [
        {
          id: 1,
          name: 'cy-logs-test-job-123'
        },
        {
          id: 2,
          name: 'other-artifact'
        }
      ];

      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 2,
          artifacts: mockArtifacts
        }
      });

      const zip = new AdmZip();
      zip.addFile('screenshots/error.png', Buffer.from('data'));
      
      mockOctokit.actions!.downloadArtifact = jest.fn().mockResolvedValue({
        data: zip.toBuffer()
      });

      const result = await artifactFetcher.fetchScreenshots('123', 'test-job');
      
      expect(mockOctokit.actions!.downloadArtifact).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        artifact_id: 1,
        archive_format: 'zip'
      });
    });

    it('should handle artifact download errors gracefully', async () => {
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 1,
          artifacts: [{ id: 1, name: 'screenshots' }]
        }
      });

      mockOctokit.actions!.downloadArtifact = jest.fn().mockRejectedValue(
        new Error('Download failed')
      );

      const result = await artifactFetcher.fetchScreenshots('123');
      
      expect(result).toEqual([]);
      expect(core.warning).toHaveBeenCalledWith(
        'Failed to process artifact screenshots: Error: Download failed'
      );
    });

    it('should only extract image files from artifacts', async () => {
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 1,
          artifacts: [{ id: 1, name: 'cypress-artifacts' }]
        }
      });

      const zip = new AdmZip();
      zip.addFile('screenshots/test.png', Buffer.from('png-data'));
      zip.addFile('logs/test.log', Buffer.from('log-data'));
      zip.addFile('videos/test.mp4', Buffer.from('video-data'));
      
      mockOctokit.actions!.downloadArtifact = jest.fn().mockResolvedValue({
        data: zip.toBuffer()
      });

      const result = await artifactFetcher.fetchScreenshots('123');
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.png');
    });
  });

  describe('fetchLogs', () => {
    it('should extract error context from logs', async () => {
      const mockLogs = `
        Running tests...
        Test passed
        Error: Something went wrong
        at testFile.js:10
        Expected value to be true
        Another line
        Test completed
      `;

      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockResolvedValue({
        data: mockLogs
      });

      const result = await artifactFetcher.fetchLogs('123', 456);
      
      expect(result).toContain('Error: Something went wrong');
      expect(result).toContain('Expected value to be true');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle log fetch errors gracefully', async () => {
      mockOctokit.actions!.downloadJobLogsForWorkflowRun = jest.fn().mockRejectedValue(
        new Error('API error')
      );

      const result = await artifactFetcher.fetchLogs('123', 456);
      
      expect(result).toEqual([]);
      expect(core.warning).toHaveBeenCalledWith(
        'Failed to fetch additional logs: Error: API error'
      );
    });
  });
}); 