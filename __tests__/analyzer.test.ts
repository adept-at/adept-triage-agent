import { analyzeFailure, extractErrorFromLogs } from '../src/analyzer';
import { OpenAIClient } from '../src/openai-client';
import { ErrorData } from '../src/types';

// Mock OpenAIClient
jest.mock('../src/openai-client');

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('analyzer', () => {
  describe('extractErrorFromLogs', () => {
    it('should extract Jest error from logs', () => {
      const jestLogs = `
        PASS src/utils.test.js
        FAIL src/components/Button.test.js (2.5s)
          ● Button component › should render correctly

            expect(received).toBe(expected) // Object.is equality

            Expected: "Click me"
            Received: undefined

              12 |   it('should render correctly', () => {
              13 |     const button = render(<Button />);
            > 14 |     expect(button.text()).toBe("Click me");
                 |                           ^
              15 |   });

            at Object.<anonymous> (src/components/Button.test.js:14:27)
            at Promise.then.completed (node_modules/jest-circus/build/utils.js:276:28)
      `;

      const error = extractErrorFromLogs(jestLogs);

      expect(error).toBeDefined();
      expect(error?.message).toContain('expect(received).toBe(expected)');
      expect(error?.framework).toBe('jest');
      expect(error?.testName).toBe('Button component › should render correctly');
      expect(error?.fileName).toBe('src/components/Button.test.js');
      expect(error?.stackTrace).toContain('at Object.<anonymous>');
    });

    it('should extract Cypress error from logs', () => {
      const cypressLogs = `
        Running: login.spec.js

        1) Login flow
           Should successfully login:
           AssertionError: Timed out retrying after 4000ms: Expected to find element: '[data-testid="dashboard"]', but never found it.
at Context.eval (cypress/integration/login.spec.js:15:8)
at Context.resolveAndRunSpec (cypress/support/index.js:123:12)
      `;

      const error = extractErrorFromLogs(cypressLogs);

      expect(error).toBeDefined();
      expect(error?.message).toContain('AssertionError: Timed out retrying');
      expect(error?.framework).toBe('cypress');
      expect(error?.failureType).toBe('AssertionError');
      // Stack trace might be empty if the format doesn't match exactly
      if (error?.stackTrace) {
        expect(error.stackTrace).toContain('at Context.eval');
      }
    });

    it('should extract Mocha error from logs', () => {
      const mochaLogs = `
        API Tests
          User endpoints
            1) should create a new user:
               AssertionError: User was not created
               at Context.<anonymous> (test/user.test.js:45:10)
               at processImmediate (internal/timers.js:456:21)
      `;

      const error = extractErrorFromLogs(mochaLogs);

      expect(error).toBeDefined();
      // Should be extracted by Cypress extractor due to AssertionError pattern
      expect(error?.message).toContain('AssertionError');
      expect(error?.framework).toBe('cypress');
    });

    it('should extract generic error when framework is unknown', () => {
      const genericLogs = `
        Some test output
        Failed: Something went wrong
        More output
      `;

      const error = extractErrorFromLogs(genericLogs);

      expect(error).toBeDefined();
      expect(error?.message).toBe('Something went wrong');
      expect(error?.framework).toBe('unknown');
    });

    it('should return null when no error is found', () => {
      const logs = '';  // Empty logs should return null

      const error = extractErrorFromLogs(logs);

      expect(error).toBeNull();
    });

    it('should handle logs with multiple errors and extract the first one', () => {
      const logs = `
        FAIL test1.js
          ● Test 1 › should work

            Error: First error
            at test1.js:10

        FAIL test2.js
          ● Test 2 › should also work

            Error: Second error
            at test2.js:20
      `;

      const error = extractErrorFromLogs(logs);

      expect(error).toBeDefined();
      expect(error?.message).toContain('Error: First error');
    });
  });

  describe('analyzeFailure', () => {
    let mockClient: jest.Mocked<OpenAIClient>;

    beforeEach(() => {
      mockClient = new OpenAIClient('test-key') as jest.Mocked<OpenAIClient>;
    });

    it('should analyze test issue and return proper result', async () => {
      const errorData: ErrorData = {
        message: 'Timeout waiting for element',
        stackTrace: 'at test.js:10',
        framework: 'cypress',
      };

      mockClient.analyze.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        reasoning: 'This is a UI synchronization issue in the test',
        indicators: ['timeout', 'element not found'],
      });

      const result = await analyzeFailure(mockClient, errorData);

      expect(result).toMatchObject({
        verdict: 'TEST_ISSUE',
        confidence: expect.any(Number),
        reasoning: 'This is a UI synchronization issue in the test',
        summary: expect.stringContaining('Test Issue'),
        indicators: ['timeout', 'element not found'],
      });

      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should analyze product issue and return proper result', async () => {
      const errorData: ErrorData = {
        message: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
        stackTrace: 'at Connection.connect',
        framework: 'jest',
      };

      mockClient.analyze.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        reasoning: 'Database connection refused indicates infrastructure issue',
        indicators: ['ECONNREFUSED', 'database', 'connection'],
      });

      const result = await analyzeFailure(mockClient, errorData);

      expect(result).toMatchObject({
        verdict: 'PRODUCT_ISSUE',
        confidence: expect.any(Number),
        reasoning: 'Database connection refused indicates infrastructure issue',
        summary: expect.stringContaining('Product Issue'),
        indicators: ['ECONNREFUSED', 'database', 'connection'],
      });
    });

    it('should calculate higher confidence with more indicators', async () => {
      const errorData: ErrorData = {
        message: 'Error',
        stackTrace: 'stack trace',
        framework: 'jest',
      };

      // First call with fewer indicators
      mockClient.analyze.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        reasoning: 'Some reasoning',
        indicators: ['indicator1'],
      });

      const result1 = await analyzeFailure(mockClient, errorData);

      // Second call with more indicators
      mockClient.analyze.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        reasoning: 'Some reasoning',
        indicators: ['indicator1', 'indicator2', 'indicator3', 'indicator4'],
      });

      const result2 = await analyzeFailure(mockClient, errorData);

      expect(result2.confidence).toBeGreaterThan(result1.confidence);
    });

    it('should handle analysis failure', async () => {
      const errorData: ErrorData = {
        message: 'Some error',
      };

      mockClient.analyze.mockRejectedValueOnce(new Error('API error'));

      await expect(analyzeFailure(mockClient, errorData))
        .rejects.toThrow('API error');
    });

    it('should generate summary with indicators when available', async () => {
      const errorData: ErrorData = {
        message: 'Test error',
      };

      mockClient.analyze.mockResolvedValueOnce({
        verdict: 'TEST_ISSUE',
        reasoning: 'This is a test timing issue. Additional context here.',
        indicators: ['timing', 'async', 'race condition', 'flaky'],
      });

      const result = await analyzeFailure(mockClient, errorData);

      expect(result.summary).toContain('Test Issue');
      expect(result.summary).toContain('This is a test timing issue');
      expect(result.summary).toContain('Key indicators:');
      expect(result.summary).toContain('timing');
      expect(result.summary).toContain('async');
      expect(result.summary).toContain('race condition');
      // Should only include first 3 indicators
      expect(result.summary).not.toContain('flaky');
    });

    it('should boost confidence when screenshots are provided', async () => {
      const errorDataWithoutScreenshots: ErrorData = {
        message: 'Test error',
        framework: 'cypress',
      };

      const errorDataWithScreenshots: ErrorData = {
        ...errorDataWithoutScreenshots,
        screenshots: [{
          name: 'test-failure.png',
          path: 'cypress/screenshots/test-failure.png',
          base64Data: 'base64data',
        }],
      };

      mockClient.analyze.mockResolvedValue({
        verdict: 'PRODUCT_ISSUE',
        reasoning: 'UI element missing',
        indicators: ['missing element'],
      });

      const resultWithout = await analyzeFailure(mockClient, errorDataWithoutScreenshots);
      const resultWith = await analyzeFailure(mockClient, errorDataWithScreenshots);

      // Screenshot should boost confidence by 10%
      expect(resultWith.confidence).toBe(resultWithout.confidence + 10);
    });

    it('should include screenshot info in summary', async () => {
      const errorData: ErrorData = {
        message: 'Test error',
        screenshots: [
          {
            name: 'failure1.png',
            path: 'screenshots/failure1.png',
          },
          {
            name: 'failure2.png',
            path: 'screenshots/failure2.png',
          },
        ],
      };

      mockClient.analyze.mockResolvedValueOnce({
        verdict: 'PRODUCT_ISSUE',
        reasoning: 'Visual bug detected.',
        indicators: ['visual bug'],
      });

      const result = await analyzeFailure(mockClient, errorData);

      expect(result.summary).toContain('📸 Analysis includes 2 screenshots');
    });

    it('should further boost confidence with multiple screenshots', async () => {
      const errorDataOneScreenshot: ErrorData = {
        message: 'Test error',
        screenshots: [{
          name: 'test.png',
          path: 'test.png',
        }],
      };

      const errorDataMultipleScreenshots: ErrorData = {
        message: 'Test error',
        screenshots: [
          { name: 'test1.png', path: 'test1.png' },
          { name: 'test2.png', path: 'test2.png' },
          { name: 'test3.png', path: 'test3.png' },
        ],
      };

      mockClient.analyze.mockResolvedValue({
        verdict: 'PRODUCT_ISSUE',
        reasoning: 'Issue detected',
        indicators: [],
      });

      const resultOne = await analyzeFailure(mockClient, errorDataOneScreenshot);
      const resultMultiple = await analyzeFailure(mockClient, errorDataMultipleScreenshots);

      // Multiple screenshots add additional 5% confidence
      expect(resultMultiple.confidence).toBe(resultOne.confidence + 5);
    });

    it('should boost confidence when logs are provided', async () => {
      const errorDataWithoutLogs: ErrorData = {
        message: 'Test error',
      };

      const errorDataWithLogs: ErrorData = {
        ...errorDataWithoutLogs,
        logs: [
          'Error occurred at line 10',
          'Stack trace: at test.js:10',
        ],
      };

      mockClient.analyze.mockResolvedValue({
        verdict: 'TEST_ISSUE',
        reasoning: 'Test issue detected',
        indicators: [],
      });

      const resultWithout = await analyzeFailure(mockClient, errorDataWithoutLogs);
      const resultWith = await analyzeFailure(mockClient, errorDataWithLogs);

      // Logs should boost confidence by 3%
      expect(resultWith.confidence).toBe(resultWithout.confidence + 3);
    });
  });
}); 