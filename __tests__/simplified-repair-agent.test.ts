import { SimplifiedRepairAgent } from '../src/repair/simplified-repair-agent';
import { RepairContext } from '../src/types';
import { OpenAIClient } from '../src/openai-client';
import { Octokit } from '@octokit/rest';

// Mock OpenAIClient
jest.mock('../src/openai-client');

describe('SimplifiedRepairAgent', () => {
  let agent: SimplifiedRepairAgent;
  let mockAnalyze: jest.Mock;
  let mockGenerateWithCustomPrompt: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyze = jest.fn();
    mockGenerateWithCustomPrompt = jest.fn();
    (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(() => ({
      analyze: mockAnalyze,
      generateWithCustomPrompt: mockGenerateWithCustomPrompt,
    } as any));

    agent = new SimplifiedRepairAgent('test-api-key');
  });

  describe('hallucination filtering', () => {
    const baseContext: RepairContext = {
      testFile: 'cypress/e2e/test.cy.ts',
      testName: 'should click button',
      errorType: 'ELEMENT_NOT_FOUND',
      errorMessage: "Expected to find element: '[data-testid=\"submit-btn\"]', but never found it",
      errorSelector: '[data-testid="submit-btn"]',
      errorLine: 42,
      workflowRunId: '123456',
      jobName: 'test-job',
      commitSha: 'abc123',
      branch: 'main',
      repository: 'test/repo',
    };

    const sourceFileContent = `describe('test', () => {
  it('should click button', () => {
    cy.get('[data-testid="submit-btn"]').click();
    cy.get('[data-testid="result"]').should('be.visible');
  });
});`;

    it('should reject recommendation when all changes have hallucinated oldCode', async () => {
      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Update selector',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: 'cy.get(".nonexistent-selector").click()',
              newCode: 'cy.get("[data-testid=\\"new-btn\\"]").click()',
              justification: 'Selector changed',
            },
          ],
          evidence: ['Selector mismatch'],
          rootCause: 'Selector changed',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: {
              type: 'file',
              content: Buffer.from(sourceFileContent).toString('base64'),
              sha: 'file-sha',
            },
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () =>
          ({
            analyze: mockAnalyze,
            generateWithCustomPrompt: mockGenerateWithCustomPrompt,
          }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      // All changes had hallucinated oldCode, so recommendation should be null
      expect(result).toBeNull();
    });

    it('should validate each change against its own target file', async () => {
      const componentContent = `export const Button = () => {
  return <button data-testid="submit-btn">Submit</button>;
};`;

      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Update selector in test and component',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: `cy.get('[data-testid="submit-btn"]').click();`,
              newCode: `cy.get('[data-testid="submit-button"]').click();`,
              justification: 'Update test selector',
            },
            {
              file: 'src/components/Button.tsx',
              line: 2,
              oldCode: `return <button data-testid="submit-btn">Submit</button>;`,
              newCode: `return <button data-testid="submit-button">Submit</button>;`,
              justification: 'Update component testid',
            },
          ],
          evidence: ['Selector standardization'],
          rootCause: 'Inconsistent testids',
        })
      );

      const mockGetContent = jest.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === 'cypress/e2e/test.cy.ts') {
          return Promise.resolve({
            data: { type: 'file', content: Buffer.from(sourceFileContent).toString('base64'), sha: 'sha1' },
          });
        }
        if (path === 'src/components/Button.tsx') {
          return Promise.resolve({
            data: { type: 'file', content: Buffer.from(componentContent).toString('base64'), sha: 'sha2' },
          });
        }
        throw new Error('Not found');
      });

      const mockOctokit = { repos: { getContent: mockGetContent } } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () => ({ analyze: mockAnalyze, generateWithCustomPrompt: mockGenerateWithCustomPrompt }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.proposedChanges).toHaveLength(2);
      expect(result?.proposedChanges[0].file).toBe('cypress/e2e/test.cy.ts');
      expect(result?.proposedChanges[1].file).toBe('src/components/Button.tsx');
    });

    it('should reject changes targeting files that cannot be fetched', async () => {
      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Fix in unfetchable file',
          changes: [
            {
              file: 'src/utils/missing-file.ts',
              line: 10,
              oldCode: 'const x = 1;',
              newCode: 'const x = 2;',
              justification: 'Update value',
            },
          ],
          evidence: ['Value wrong'],
          rootCause: 'Wrong value',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockImplementation(({ path }: { path: string }) => {
            if (path === 'cypress/e2e/test.cy.ts') {
              return Promise.resolve({
                data: { type: 'file', content: Buffer.from(sourceFileContent).toString('base64'), sha: 'sha1' },
              });
            }
            throw new Error('Not Found');
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () => ({ analyze: mockAnalyze, generateWithCustomPrompt: mockGenerateWithCustomPrompt }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should reject changes where oldCode matches multiple locations (ambiguous)', async () => {
      const sourceWithDuplicates = `describe('test', () => {
  it('first test', () => {
    cy.get('[data-testid="submit-btn"]').click();
  });
  it('second test', () => {
    cy.get('[data-testid="submit-btn"]').click();
  });
});`;

      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Update selector',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: `cy.get('[data-testid="submit-btn"]').click();`,
              newCode: `cy.get('[data-testid="submit-button"]').click();`,
              justification: 'Update selector',
            },
          ],
          evidence: ['Selector changed'],
          rootCause: 'Selector mismatch',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: { type: 'file', content: Buffer.from(sourceWithDuplicates).toString('base64'), sha: 'sha1' },
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () => ({ analyze: mockAnalyze, generateWithCustomPrompt: mockGenerateWithCustomPrompt }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should keep valid changes and reject invalid ones across multiple files', async () => {
      const helperContent = `export function setupTest() {
  return { timeout: 5000 };
}`;

      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Multi-file fix',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: `cy.get('[data-testid="submit-btn"]').click();`,
              newCode: `cy.get('[data-testid="submit-button"]').click();`,
              justification: 'Valid — oldCode exists in test file',
            },
            {
              file: 'src/utils/gone.ts',
              line: 1,
              oldCode: 'const gone = true;',
              newCode: 'const gone = false;',
              justification: 'Invalid — file cannot be fetched',
            },
            {
              file: 'cypress/support/helpers.ts',
              line: 1,
              oldCode: 'return { timeout: 5000 };',
              newCode: 'return { timeout: 10000 };',
              justification: 'Valid — oldCode exists in helper',
            },
          ],
          evidence: ['Multiple issues'],
          rootCause: 'Several problems',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockImplementation(({ path }: { path: string }) => {
            if (path === 'cypress/e2e/test.cy.ts') {
              return Promise.resolve({
                data: { type: 'file', content: Buffer.from(sourceFileContent).toString('base64'), sha: 'sha1' },
              });
            }
            if (path === 'cypress/support/helpers.ts') {
              return Promise.resolve({
                data: { type: 'file', content: Buffer.from(helperContent).toString('base64'), sha: 'sha2' },
              });
            }
            throw new Error('Not Found');
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () => ({ analyze: mockAnalyze, generateWithCustomPrompt: mockGenerateWithCustomPrompt }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.proposedChanges).toHaveLength(2);
      expect(result?.proposedChanges[0].file).toBe('cypress/e2e/test.cy.ts');
      expect(result?.proposedChanges[1].file).toBe('cypress/support/helpers.ts');
    });

    it('should fetch each target file only once when multiple changes target it', async () => {
      const helperContent = `export function helperA() {
  return 'a';
}

export function helperB() {
  return 'b';
}`;

      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Two changes in same helper file',
          changes: [
            {
              file: 'cypress/support/helpers.ts',
              line: 2,
              oldCode: `return 'a';`,
              newCode: `return 'alpha';`,
              justification: 'Update return value',
            },
            {
              file: 'cypress/support/helpers.ts',
              line: 6,
              oldCode: `return 'b';`,
              newCode: `return 'beta';`,
              justification: 'Update return value',
            },
          ],
          evidence: ['Return values changed'],
          rootCause: 'Outdated values',
        })
      );

      const mockGetContent = jest.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === 'cypress/e2e/test.cy.ts') {
          return Promise.resolve({
            data: { type: 'file', content: Buffer.from(sourceFileContent).toString('base64'), sha: 'sha1' },
          });
        }
        if (path === 'cypress/support/helpers.ts') {
          return Promise.resolve({
            data: { type: 'file', content: Buffer.from(helperContent).toString('base64'), sha: 'sha2' },
          });
        }
        throw new Error('Not Found');
      });

      const mockOctokit = { repos: { getContent: mockGetContent } } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () => ({ analyze: mockAnalyze, generateWithCustomPrompt: mockGenerateWithCustomPrompt }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.proposedChanges).toHaveLength(2);

      const helperFetches = mockGetContent.mock.calls.filter(
        (call: any[]) => call[0].path === 'cypress/support/helpers.ts'
      );
      expect(helperFetches).toHaveLength(1);
    });

    it('should keep valid changes and discard hallucinated ones', async () => {
      const mockGenerateWithCustomPrompt = jest.fn().mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Update selectors',
          changes: [
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 3,
              oldCode: 'cy.get(\'[data-testid="submit-btn"]\').click();',
              newCode: 'cy.get(\'[data-testid="new-btn"]\').click();',
              justification: 'Valid fix — oldCode exists in source',
            },
            {
              file: 'cypress/e2e/test.cy.ts',
              line: 5,
              oldCode: 'cy.get(".hallucinated").should("exist")',
              newCode: 'cy.get(".fixed").should("exist")',
              justification: 'Hallucinated — oldCode not in source',
            },
          ],
          evidence: ['Selector mismatch'],
          rootCause: 'Selector changed',
        })
      );

      const mockOctokit = {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: {
              type: 'file',
              content: Buffer.from(sourceFileContent).toString('base64'),
              sha: 'file-sha',
            },
          }),
        },
      } as unknown as Octokit;

      (OpenAIClient as jest.MockedClass<typeof OpenAIClient>).mockImplementation(
        () =>
          ({
            analyze: mockAnalyze,
            generateWithCustomPrompt: mockGenerateWithCustomPrompt,
          }) as any
      );

      const agentWithSource = new SimplifiedRepairAgent(
        new OpenAIClient('key'),
        { octokit: mockOctokit, owner: 'test', repo: 'repo', branch: 'main' }
      );

      const result = await agentWithSource.generateFixRecommendation(baseContext);

      // Should keep only the valid change
      expect(result).not.toBeNull();
      expect(result?.proposedChanges).toHaveLength(1);
      expect(result?.proposedChanges[0].oldCode).toContain('submit-btn');
    });
  });

  describe('generateFixRecommendation', () => {
    const baseContext: RepairContext = {
      testFile: 'cypress/e2e/test.cy.ts',
      testName: 'should click button',
      errorType: 'ELEMENT_NOT_FOUND',
      errorMessage: "Expected to find element: '[data-testid=\"submit-btn\"]', but never found it",
      errorSelector: '[data-testid="submit-btn"]',
      errorLine: 42,
      workflowRunId: '123456',
      jobName: 'test-job',
      commitSha: 'abc123',
      branch: 'main',
      repository: 'test/repo'
    };

    it('should generate fix recommendation for high confidence response', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        JSON.stringify({
          confidence: 85,
          reasoning: 'Selector has changed in the application',
          changes: [{
            file: 'cypress/e2e/test.cy.ts',
            line: 42,
            oldCode: 'cy.get(\'[data-testid="submit-btn"]\')',
            newCode: 'cy.get(\'[data-testid="submit-button"]\')',
            justification: 'Update selector to match new application'
          }],
          evidence: ['Button selector changed in recent commit'],
          rootCause: 'Selector mismatch'
        })
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(85);
      expect(result?.proposedChanges).toHaveLength(1);
      expect(result?.evidence).toContain('Button selector changed in recent commit');
      expect(result?.summary).toContain('Fix Recommendation');
    });

    it('should return null for low confidence response', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        JSON.stringify({
          confidence: 30,
          reasoning: 'Not enough information',
          changes: [],
          evidence: [],
          rootCause: 'Unknown'
        })
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should handle non-JSON response gracefully', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        'This is a plain text response suggesting to update the selector'
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(60); // Default confidence
      expect(result?.reasoning).toContain('update the selector');
      expect(result?.proposedChanges).toHaveLength(1); // Should extract basic change
    });

    it('should generate appropriate fix for TIMEOUT errors', async () => {
      const timeoutContext: RepairContext = {
        ...baseContext,
        errorType: 'TIMEOUT',
        errorMessage: 'Timed out waiting for element',
        errorSelector: undefined
      };

      mockGenerateWithCustomPrompt.mockResolvedValue(
        'Element is loading slowly, suggest adding wait'
      );

      const result = await agent.generateFixRecommendation(timeoutContext);

      expect(result).not.toBeNull();
      expect(result?.proposedChanges[0]?.newCode).toContain('wait');
    });

    it('should handle API errors gracefully', async () => {
      mockGenerateWithCustomPrompt.mockRejectedValue(new Error('API error'));

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result).toBeNull();
    });

    it('should include selector in summary when available', async () => {
      mockGenerateWithCustomPrompt.mockResolvedValue(
        JSON.stringify({
          confidence: 75,
          reasoning: 'Fix needed',
          changes: [],
          evidence: [],
          rootCause: 'Selector issue'
        })
      );

      const result = await agent.generateFixRecommendation(baseContext);

      expect(result?.summary).toContain('[data-testid="submit-btn"]');
    });
  });
});
