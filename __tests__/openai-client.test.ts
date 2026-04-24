import { OpenAIClient } from '../src/openai-client';
import { ErrorData, FewShotExample } from '../src/types';
import { OPENAI } from '../src/config/constants';
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
      responses: {
        create: mockCreate,
      },
    } as any;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);
    
    client = new OpenAIClient('test-api-key');
  });

  describe('analyze', () => {
    it('should successfully analyze error and return response', async () => {
      const mockResponse = {
        id: 'resp-abc',
        usage: {
          input_tokens: 100,
          output_tokens: 25,
          total_tokens: 125,
        },
        output_text: JSON.stringify({
          verdict: 'TEST_ISSUE',
          reasoning: 'This is a test synchronization issue',
          indicators: ['timeout', 'element not found'],
        }),
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result).toEqual({
        verdict: 'TEST_ISSUE',
        reasoning: 'This is a test synchronization issue',
        indicators: ['timeout', 'element not found'],
        responseId: 'resp-abc',
        tokensUsed: 125,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: OPENAI.MODEL,
          max_output_tokens: OPENAI.MAX_COMPLETION_TOKENS,
          text: { format: { type: 'json_object' } },
          instructions: expect.any(String),
          input: expect.any(Array),
        })
      );
    });

    it('should use configured model with vision when screenshots are provided', async () => {
      const errorDataWithScreenshots: ErrorData = {
        ...mockErrorData,
        screenshots: [{
          name: 'test-failure.png',
          path: 'cypress/screenshots/test-failure.png',
          base64Data: 'base64encodeddata',
        }],
      };

      const mockResponse = {
        output_text: JSON.stringify({
          verdict: 'PRODUCT_ISSUE',
          reasoning: 'UI element is missing from the page as shown in screenshot',
          indicators: ['missing element', 'visual bug'],
        }),
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithScreenshots, mockExamples);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: OPENAI.MODEL,
          max_output_tokens: OPENAI.MAX_COMPLETION_TOKENS,
          text: { format: { type: 'json_object' } },
        })
      );

      // Verify the input structure includes converted image content
      const call = mockCreate.mock.calls[0][0];
      const userMessage = call.input[0];
      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toContainEqual(
        expect.objectContaining({
          type: 'input_image',
          image_url: expect.stringContaining('data:image/png;base64,'),
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
        id: 'resp-vision',
        output_text: 'Verdict: TEST_ISSUE\nReasoning: The test is using wrong selectors\nIndicators: wrong selector, element exists',
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithScreenshots, mockExamples);

      expect(result).toEqual(expect.objectContaining({
        verdict: 'TEST_ISSUE',
        reasoning: 'The test is using wrong selectors',
        indicators: ['wrong selector', 'element exists'],
        responseId: 'resp-vision',
      }));
    });

    it('should retry on failure and succeed', async () => {
      const mockResponse = {
        id: 'resp-retry',
        output_text: JSON.stringify({
          verdict: 'PRODUCT_ISSUE',
          reasoning: 'Database connection error',
          indicators: ['ECONNREFUSED'],
        }),
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
        .mockResolvedValueOnce({ output_text: null })
        .mockResolvedValueOnce({ output_text: null })
        .mockResolvedValueOnce({ output_text: null });

      await expect(client.analyze(mockErrorData, mockExamples))
        .rejects.toThrow('Failed to get analysis from OpenAI after 3 attempts');
    });

    it('should throw error when response has invalid verdict', async () => {
      const invalidResponse = {
        output_text: JSON.stringify({
          verdict: 'INVALID_VERDICT',
          reasoning: 'Some reasoning',
          indicators: [],
        }),
      };

      mockCreate
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(invalidResponse);

      await expect(client.analyze(mockErrorData, mockExamples))
        .rejects.toThrow('Failed to get analysis from OpenAI after 3 attempts');
    });

    it('should handle missing indicators in response', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          verdict: 'TEST_ISSUE',
          reasoning: 'Valid reasoning without indicators',
        }),
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
        output_text: JSON.stringify({
          verdict: 'PRODUCT_ISSUE',
          reasoning: 'Null pointer error due to removed null check in UserProfile component',
          indicators: ['TypeError', 'Cannot read property name of null'],
          suggestedSourceLocations: [{
            file: 'src/components/UserProfile.tsx',
            lines: '45-47',
            reason: 'Removed null check for user.name causing null pointer error',
          }],
        }),
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
        output_text: JSON.stringify({
          verdict: 'TEST_ISSUE',
          reasoning: 'Test timeout due to missing wait for element',
          indicators: ['TimeoutError', 'element not visible'],
        }),
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(errorDataWithPRDiff, mockExamples);

      expect(result.verdict).toBe('TEST_ISSUE');
      expect(result.suggestedSourceLocations).toBeUndefined();
    });

    it('should handle response with empty suggestedSourceLocations array', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          verdict: 'PRODUCT_ISSUE',
          reasoning: 'Product issue but no specific location identified',
          indicators: ['500 error'],
          suggestedSourceLocations: [],
        }),
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(result.suggestedSourceLocations).toEqual([]);
    });
  });

  describe('generateWithCustomPrompt', () => {
    it('should call OpenAI Responses API with custom system and user prompts', async () => {
      const mockResponse = {
        id: 'resp_mock_1',
        usage: {
          input_tokens: 50,
          output_tokens: 20,
        },
        output_text: JSON.stringify({
          confidence: 85,
          reasoning: 'Test fix identified',
          changes: [],
        }),
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await client.generateWithCustomPrompt({
        systemPrompt: 'You are an expert at fixing tests.',
        userContent: 'Fix this test failure.',
        responseAsJson: true,
        maxTokens: 6000,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: OPENAI.MODEL,
          max_output_tokens: 6000,
          text: { format: { type: 'json_object' } },
          instructions: 'You are an expert at fixing tests.',
          input: [{ role: 'user', content: 'Fix this test failure.\n\nRespond with a JSON object.' }],
        })
      );

      expect(result).toEqual({
        text: JSON.stringify({
          confidence: 85,
          reasoning: 'Test fix identified',
          changes: [],
        }),
        responseId: 'resp_mock_1',
        tokensUsed: 70,
      });
    });

    it('should accept temperature parameter for backward compatibility', async () => {
      const mockResponse = {
        id: 'resp_mock_temp',
        output_text: 'Creative response',
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const tempResult = await client.generateWithCustomPrompt({
        systemPrompt: 'Be creative',
        userContent: 'Generate something',
        temperature: 0.8,
      });

      expect(tempResult).toEqual({
        text: 'Creative response',
        responseId: 'resp_mock_temp',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: OPENAI.MODEL,
        })
      );
      // Verify temperature is NOT in the request
      const call = mockCreate.mock.calls[0][0];
      expect(call.temperature).toBeUndefined();
    });

    it('should handle multimodal content with images', async () => {
      const mockResponse = {
        id: 'resp_mock_mm',
        output_text: 'Analysis of images',
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const multimodalContent = [
        { type: 'text' as const, text: 'Analyze these images' },
        {
          type: 'image_url' as const,
          image_url: { url: 'data:image/png;base64,abc123' },
        },
      ];

      const result = await client.generateWithCustomPrompt({
        systemPrompt: 'You are an image analyzer',
        userContent: multimodalContent,
      });

      // Verify content was converted to Responses API format
      const call = mockCreate.mock.calls[0][0];
      const userMessage = call.input[0];
      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toContainEqual(
        expect.objectContaining({
          type: 'input_text',
          text: 'Analyze these images',
        })
      );
      expect(userMessage.content).toContainEqual(
        expect.objectContaining({
          type: 'input_image',
          image_url: 'data:image/png;base64,abc123',
        })
      );

      expect(result.text).toBe('Analysis of images');
      expect(result.responseId).toBe('resp_mock_mm');
    });

    it('should throw error when response is empty', async () => {
      mockCreate
        .mockResolvedValueOnce({ output_text: null })
        .mockResolvedValueOnce({ output_text: null })
        .mockResolvedValueOnce({ output_text: null });

      await expect(client.generateWithCustomPrompt({
        systemPrompt: 'Test',
        userContent: 'Test',
      })).rejects.toThrow('Failed to get custom prompt response from OpenAI after 3 attempts');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should retry custom prompt calls on transient failure', async () => {
      mockCreate
        .mockRejectedValueOnce(new Error('temporary outage'))
        .mockResolvedValueOnce({
          id: 'resp_custom_retry',
          output_text: 'Recovered',
        });

      const result = await client.generateWithCustomPrompt({
        systemPrompt: 'Test',
        userContent: 'Test',
      });

      expect(result).toEqual({ text: 'Recovered', responseId: 'resp_custom_retry' });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should not include text format when responseAsJson is false', async () => {
      const mockResponse = {
        id: 'resp_mock_plain',
        output_text: 'Plain text response',
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const out = await client.generateWithCustomPrompt({
        systemPrompt: 'Test',
        userContent: 'Test',
        responseAsJson: false,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: undefined,
        })
      );
      expect(out).toEqual({ text: 'Plain text response', responseId: 'resp_mock_plain' });
    });
  });
});
