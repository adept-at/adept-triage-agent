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
          model: 'gpt-4',
          temperature: 0.3,
          max_tokens: 1500,
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
          model: 'gpt-4.1',
          temperature: 0.3,
          max_tokens: 1500,
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

    it('should exclude screenshots when falling back to GPT-3.5', async () => {
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
            content: JSON.stringify({
              verdict: 'TEST_ISSUE',
              reasoning: 'Fallback analysis without screenshots',
              indicators: [],
            }),
          },
        }],
      };

      // Fail all GPT-4 Vision attempts
      mockCreate
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValueOnce(mockResponse); // GPT-3.5 succeeds

      const result = await client.analyze(errorDataWithScreenshots, mockExamples);

      expect(result.verdict).toBe('TEST_ISSUE');
      
      // Verify GPT-3.5 was called without image content
      const gpt35Call = mockCreate.mock.calls[3][0];
      expect(gpt35Call.model).toBe('gpt-3.5-turbo-0125');
      expect(gpt35Call.messages[1].content).toBeTypeOf('string');
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

    it('should fallback to GPT-3.5 after all retries fail', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: 'TEST_ISSUE',
              reasoning: 'Fallback analysis',
              indicators: [],
            }),
          },
        }],
      };

      mockCreate
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValueOnce(mockResponse); // GPT-3.5 succeeds

      const result = await client.analyze(mockErrorData, mockExamples);

      expect(result.verdict).toBe('TEST_ISSUE');
      expect(mockCreate).toHaveBeenCalledTimes(4);
      
      // Check that GPT-3.5 was called
      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo-0125',
        })
      );
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
        .rejects.toThrow('Fallback to GPT-3.5 also failed');
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
        .rejects.toThrow('Fallback to GPT-3.5 also failed');
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
  });
}); 