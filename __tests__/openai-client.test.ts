import { OpenAIClient } from '../src/openai-client';
import { ErrorData, FewShotExample } from '../src/types';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai');

// Mock @actions/core
jest.mock('@actions/core', () => ({
  warning: jest.fn(),
  info: jest.fn(),
}));

describe('OpenAIClient', () => {
  let client: OpenAIClient;
  let mockOpenAI: jest.Mocked<OpenAI>;
  let mockCreate: jest.Mock;

  const mockErrorData: ErrorData = {
    message: 'Test error message',
    stackTrace: 'at test.js:10',
    framework: 'jest',
    testName: 'should do something',
  };

  const mockExamples: FewShotExample[] = [
    {
      error: 'TimeoutError',
      verdict: 'TEST_ISSUE',
      reasoning: 'Timeout indicates test issue',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockCreate = jest.fn();
    mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);
    
    client = new OpenAIClient('test-api-key');
  });

  describe('analyze', () => {
    it('should successfully analyze error and return response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'TEST_ISSUE',
              reasoning: 'This is a test synchronization issue',
              indicators: ['timeout', 'element not found'],
            }),
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result).toEqual({
        verdict: 'TEST_ISSUE',
        reasoning: 'This is a test synchronization issue',
        indicators: ['timeout', 'element not found'],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          temperature: 1,
          max_completion_tokens: 32768,
          response_format: { type: 'json_object' },
        })
      );
    });

    it('should use GPT-4 Vision when screenshots are provided', async () => {
      const errorDataWithScreenshots: ErrorData = {
        ...mockErrorData,
        screenshots: [{
          name: 'test-failure.png',
          path: 'cypress/screenshots/test-failure.png',
          base64Data: 'base64encodeddata',
        }],
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'PRODUCT_ISSUE',
              reasoning: 'UI element is missing from the page as shown in screenshot',
              indicators: ['missing element', 'visual bug'],
            }),
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithScreenshots, mockExamples);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5',
          temperature: 1,
          max_completion_tokens: 32768,
          response_format: { type: 'json_object' },
        })
      );

      // Verify the message structure includes image content
      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[1].content).toContainEqual(
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({
            url: expect.stringContaining('data:image/png;base64,'),
          }),
        })
      );
    });

    it('should handle non-JSON response from vision model', async () => {
      const errorDataWithScreenshots: ErrorData = {
        ...mockErrorData,
        screenshots: [{
          name: 'test.png',
          path: 'test.png',
          base64Data: 'data',
        }],
      };

      const mockResponse = {
        choices: [{
          message: {
            content: 'Verdict: TEST_ISSUE\nReasoning: The test is using wrong selectors\nIndicators: wrong selector, element exists',
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithScreenshots, mockExamples);

      expect(result).toEqual({
        verdict: 'TEST_ISSUE',
        reasoning: 'The test is using wrong selectors',
        indicators: ['wrong selector', 'element exists'],
      });
    });

    it('should retry on failure and succeed', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'PRODUCT_ISSUE',
              reasoning: 'Database connection error',
              indicators: ['ECONNREFUSED'],
            }),
          },
        }],
      };

      mockCreate
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should throw error after all retries fail', async () => {
      mockCreate
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      await expect(client.analyze(mockErrorData, mockExamples))
        .rejects.toThrow('Failed to get analysis from OpenAI after 3 attempts');

      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should throw error when response is empty', async () => {
      mockCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
            },
          }],
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: null,
            },
          }],
        })
        .mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'choices')"));

      await expect(client.analyze(mockErrorData, mockExamples))
        .rejects.toThrow('Failed to get analysis from OpenAI after 3 attempts');
    });

    it('should throw error when response has invalid verdict', async () => {
      const invalidResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'INVALID_VERDICT',
              reasoning: 'Some reasoning',
              indicators: [],
            }),
          },
        }],
      };

      mockCreate
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(invalidResponse)
        .mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'choices')"));

      await expect(client.analyze(mockErrorData, mockExamples))
        .rejects.toThrow('Failed to get analysis from OpenAI after 3 attempts');
    });

    it('should handle missing indicators in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'TEST_ISSUE',
              reasoning: 'Valid reasoning without indicators',
            }),
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result.indicators).toEqual([]);
    });

    it('should include suggestedSourceLocations for PRODUCT_ISSUE with PR diff', async () => {
      const errorDataWithPRDiff: ErrorData = {
        ...mockErrorData,
        prDiff: {
          files: [{
            filename: 'src/components/UserProfile.tsx',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
            patch: '@@ -45,7 +45,6 @@ export function UserProfile() {\n-  if (!user || !user.name) return null;\n   return <div>{user.name}</div>;',
          }],
          totalChanges: 1,
          additions: 10,
          deletions: 5,
        },
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'PRODUCT_ISSUE',
              reasoning: 'Null pointer error due to removed null check in UserProfile component',
              indicators: ['TypeError', 'Cannot read property name of null'],
              suggestedSourceLocations: [{
                file: 'src/components/UserProfile.tsx',
                lines: '45-47',
                reason: 'Removed null check for user.name causing null pointer error',
              }],
            }),
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithPRDiff, mockExamples);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(result.suggestedSourceLocations).toEqual([{
        file: 'src/components/UserProfile.tsx',
        lines: '45-47',
        reason: 'Removed null check for user.name causing null pointer error',
      }]);
    });

    it('should not include suggestedSourceLocations for TEST_ISSUE', async () => {
      const errorDataWithPRDiff: ErrorData = {
        ...mockErrorData,
        prDiff: {
          files: [{
            filename: 'src/utils/helper.ts',
            status: 'modified',
            additions: 5,
            deletions: 3,
            changes: 8,
            patch: '@@ -10,3 +10,5 @@\n+export function newHelper() {\n+  return true;\n+}',
          }],
          totalChanges: 1,
          additions: 5,
          deletions: 3,
        },
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'TEST_ISSUE',
              reasoning: 'Test timeout due to missing wait for element',
              indicators: ['TimeoutError', 'element not visible'],
            }),
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithPRDiff, mockExamples);

      expect(result.verdict).toBe('TEST_ISSUE');
      expect(result.suggestedSourceLocations).toBeUndefined();
    });

    it('should handle response with empty suggestedSourceLocations array', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'PRODUCT_ISSUE',
              reasoning: 'Product issue but no specific location identified',
              indicators: ['500 error'],
              suggestedSourceLocations: [],
            }),
          },
        }],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(result.suggestedSourceLocations).toEqual([]);
    });
  });
}); 