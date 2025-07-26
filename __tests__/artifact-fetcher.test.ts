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
      },
      pulls: {
        get: jest.fn(),
        listFiles: jest.fn()
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
      
      expect(result.some(line => line.includes('Error: Something went wrong'))).toBe(true);
      expect(result.some(line => line.includes('Expected value to be true'))).toBe(true);
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
  
  describe('fetchPRDiff', () => {
    it('should fetch and sort PR diff successfully', async () => {
      const mockPRData = {
        changed_files: 10,
        additions: 150,
        deletions: 75
      };
      
      const mockFiles = [
        {
          filename: 'src/index.js',
          status: 'modified',
          additions: 50,
          deletions: 25,
          changes: 75,
          patch: '@@ -1,5 +1,6 @@\n+// New comment\n function test() {'
        },
        {
          filename: 'test/index.test.js',
          status: 'modified',
          additions: 30,
          deletions: 10,
          changes: 40,
          patch: '@@ -10,3 +10,5 @@\n+it("new test", () => {});'
        },
        {
          filename: 'package.json',
          status: 'modified',
          additions: 5,
          deletions: 5,
          changes: 10,
          patch: '@@ -5,1 +5,1 @@\n-"version": "1.0.0"\n+"version": "1.0.1"'
        }
      ];
      
      mockOctokit.pulls = {
        get: jest.fn().mockResolvedValue({ data: mockPRData }),
        listFiles: jest.fn().mockResolvedValue({ data: mockFiles })
      } as any;
      
      const result = await artifactFetcher.fetchPRDiff('123');
      
      expect(result).toBeTruthy();
      expect(result!.totalChanges).toBe(10);
      expect(result!.additions).toBe(150);
      expect(result!.deletions).toBe(75);
      
      // Verify files are sorted (test files first)
      expect(result!.files[0].filename).toBe('test/index.test.js');
      expect(result!.files[1].filename).toBe('src/index.js');
      expect(result!.files[2].filename).toBe('package.json');
    });
    
    it('should handle custom repository parameter', async () => {
      mockOctokit.pulls = {
        get: jest.fn().mockResolvedValue({ data: { changed_files: 1, additions: 10, deletions: 5 } }),
        listFiles: jest.fn().mockResolvedValue({ data: [] })
      } as any;
      
      await artifactFetcher.fetchPRDiff('456', 'custom-owner/custom-repo');
      
      expect(mockOctokit.pulls!.get).toHaveBeenCalledWith({
        owner: 'custom-owner',
        repo: 'custom-repo',
        pull_number: 456
      });
    });
    
    it('should return null on API error', async () => {
      mockOctokit.pulls = {
        get: jest.fn().mockRejectedValue(new Error('PR not found'))
      } as any;
      
      const result = await artifactFetcher.fetchPRDiff('789');
      
      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith('Failed to fetch PR diff: Error: PR not found');
    });
    
    it('should handle large PRs with pagination', async () => {
      const mockFiles = Array.from({ length: 100 }, (_, i) => ({
        filename: `file${i}.js`,
        status: 'modified',
        additions: 1,
        deletions: 1,
        changes: 2,
        patch: `@@ -1,1 +1,1 @@\n-old\n+new`
      }));
      
      mockOctokit.pulls = {
        get: jest.fn().mockResolvedValue({ 
          data: { changed_files: 100, additions: 100, deletions: 100 } 
        }),
        listFiles: jest.fn().mockResolvedValue({ data: mockFiles })
      } as any;
      
      const result = await artifactFetcher.fetchPRDiff('999');
      
      expect(result).toBeTruthy();
      expect(result!.files).toHaveLength(100);
      expect(mockOctokit.pulls!.listFiles).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 999,
        per_page: 100
      });
    });
  });
  
  describe('fetchCypressArtifactLogs', () => {
    it('should fetch and process Cypress artifact logs', async () => {
      const mockArtifacts = [
        {
          id: 1,
          name: 'cy-logs-test-123'
        }
      ];
      
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 1,
          artifacts: mockArtifacts
        }
      });
      
      // Create a mock ZIP with log files
      const zip = new AdmZip();
      zip.addFile('output.txt', Buffer.from('Test execution output'));
      zip.addFile('screenshots/test.png', Buffer.from('png-data'));
      zip.addFile('cypress.log', Buffer.from('Cypress test logs'));
      
      mockOctokit.actions!.downloadArtifact = jest.fn().mockResolvedValue({
        data: zip.toBuffer()
      });
      
      const result = await artifactFetcher.fetchCypressArtifactLogs('123');
      
      expect(result).toContain('Artifact: cy-logs-test-123');
      expect(result).toContain('Found: 1 screenshots, 0 videos, 2 text files');
      expect(result).toContain('Test execution output');
      expect(result).toContain('Cypress test logs');
    });
    
    it('should filter by job name when provided', async () => {
      const mockArtifacts = [
        { id: 1, name: 'cy-logs-job1' },
        { id: 2, name: 'cy-logs-job2' }
      ];
      
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 2,
          artifacts: mockArtifacts
        }
      });
      
      const zip = new AdmZip();
      zip.addFile('log.txt', Buffer.from('Job 2 logs'));
      
      mockOctokit.actions!.downloadArtifact = jest.fn().mockResolvedValue({
        data: zip.toBuffer()
      });
      
      const result = await artifactFetcher.fetchCypressArtifactLogs('123', 'job2');
      
      expect(mockOctokit.actions!.downloadArtifact).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        artifact_id: 2,
        archive_format: 'zip'
      });
      expect(result).toContain('Job 2 logs');
    });
    
    it('should return empty string when no artifacts found', async () => {
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 0,
          artifacts: []
        }
      });
      
      const result = await artifactFetcher.fetchCypressArtifactLogs('123');
      
      expect(result).toBe('');
      expect(core.info).toHaveBeenCalledWith('No Cypress log artifacts found');
    });
    
    it('should handle artifact processing errors gracefully', async () => {
      const mockArtifacts = [{ id: 1, name: 'cy-logs' }];
      
      mockOctokit.actions!.listWorkflowRunArtifacts = jest.fn().mockResolvedValue({
        data: {
          total_count: 1,
          artifacts: mockArtifacts
        }
      });
      
      mockOctokit.actions!.downloadArtifact = jest.fn().mockRejectedValue(
        new Error('Download failed')
      );
      
      const result = await artifactFetcher.fetchCypressArtifactLogs('123');
      
      expect(result).toBe('');
      expect(core.warning).toHaveBeenCalledWith('Failed to process artifact cy-logs: Error: Download failed');
    });
  });
}); 