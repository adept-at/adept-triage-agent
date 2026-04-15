/**
 * Integration test: verify the repair agent proposes oldCode that actually exists
 * in the source file. Hits the real OpenAI API.
 *
 * Run: OPENAI_API_KEY=sk-... npx jest --testPathPattern=repair-oldcode-match --testPathIgnorePatterns=[]
 */

import { SimplifiedRepairAgent } from '../../src/repair/simplified-repair-agent';
import { OpenAIClient } from '../../src/openai-client';
import { RepairContext, ErrorData } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn((...args: unknown[]) => console.log('WARN:', ...args)),
  debug: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYNTHETIC_TEST_FILE = `import LoginPage from '../../pageobjects/login.page';

describe('Dashboard greeting displays after login', () => {
    it('should login and verify dashboard loads', async () => {
        await LoginPage.openLoginPageLearn();
        await LoginPage.login('phil+test7@adept.at', 'Adept123!', false);

        await browser.waitUntil(async () => {
            const url = await browser.getUrl();
            return url.includes('dashboard');
        }, {
            timeout: 15000,
            interval: 1000,
            timeoutMsg: 'expected to be redirected to dashboard after login'
        });
    });

    it('should display the user greeting on the dashboard', async () => {
        await LoginPage.dismissBeamerNotifications();

        const greetingText = await $('[data-testid="salutation-text"]');
        await greetingText.waitForDisplayed({
            timeout: 10000,
            timeoutMsg: 'Dashboard greeting text was not displayed within 10 seconds'
        });

        const text = await greetingText.getText();
        expect(text.length).toBeGreaterThan(0);
    });

    it('should show the enrollments navigation link', async () => {
        await $('[href="/enrollments"]').waitForExist({ timeout: 10000 });
        await $('[href="/enrollments"]').waitForClickable({ timeout: 10000 });
    });
});
`;

const SIMULATED_ERROR = {
  errorMessage:
    'element ("[data-testid=\\"salutation-text\\"]") still not displayed after 10000ms — Dashboard greeting text was not displayed within 10 seconds',
  errorType: 'ELEMENT_NOT_FOUND' as const,
  errorSelector: '[data-testid="salutation-text"]',
  stackTrace: `Error: element ("[data-testid="salutation-text"]") still not displayed after 10000ms
    at Context.<anonymous> (test/specs/dashboard/dash.greeting.canary.spec.ts:22:30)`,
  logs: [
    '[0-0] RUNNING in chrome - test/specs/dashboard/dash.greeting.canary.spec.ts',
    '[0-0] "spec" reporter started',
    '[0-0]   Dashboard greeting displays after login',
    '[0-0]     ✓ should login and verify dashboard loads',
    '[0-0]     ✗ should display the user greeting on the dashboard',
    '[0-0] Error: Dashboard greeting text was not displayed within 10 seconds',
    '[0-0]   at Context.<anonymous> (dash.greeting.canary.spec.ts:22:30)',
    'Screenshot saved: data/screenshot-0-0.png',
    'Screenshot analysis: Dashboard is fully loaded. Greeting "Good evening, Phil!" is visible as an h2 element with class starting with "SalutationText".',
  ],
};

const REFERENCE_TEST = `// From dash.continue.learning.spec.ts — this test passes:
import LoginPage from '../../pageobjects/login.page';
describe('Test that user can log in and continue learning', async () => {
    it('should complete login form and land on dashboard', async () => {
        await LoginPage.openLoginPageLearn();
        await LoginPage.login('phil+test7@adept.at', 'Adept123!', false);
        await $('[class^="SalutationText"]').waitForDisplayed();
        await $('[title="Saucelabs test runner"]').waitForDisplayed();
    });
});`;

describe('Repair agent oldCode match verification', () => {
  const itOrSkip = OPENAI_API_KEY ? it : it.skip;

  itOrSkip(
    'proposed oldCode must be a verbatim substring of the source file',
    async () => {
      const openaiClient = new OpenAIClient(OPENAI_API_KEY!);

      const agent = new SimplifiedRepairAgent(openaiClient, undefined, {
        enableAgenticRepair: false,
      });

      const repairContext: RepairContext = {
        testFile: 'test/specs/dashboard/dash.greeting.canary.spec.ts',
        testName:
          'Dashboard greeting displays after login.should display the user greeting on the dashboard',
        errorType: SIMULATED_ERROR.errorType,
        errorMessage: SIMULATED_ERROR.errorMessage,
        errorSelector: SIMULATED_ERROR.errorSelector,
        errorLine: 22,
        workflowRunId: '12345',
        jobName: 'chromeTest',
        commitSha: 'abc123',
        branch: 'main',
        repository: 'adept-at/lib-wdio-8-e2e-ts',
      };

      const errorData: ErrorData = {
        testFile: repairContext.testFile,
        errorMessage: SIMULATED_ERROR.errorMessage,
        stackTrace: SIMULATED_ERROR.stackTrace,
        logs: SIMULATED_ERROR.logs,
        framework: 'webdriverio',
        screenshots: [
          {
            name: 'screenshot-0-0.png',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      // Monkey-patch the private method to inject our source file
      // instead of fetching from GitHub
      const agentAny = agent as any;
      const originalBuildPrompt = agentAny.buildPrompt.bind(agentAny);
      agentAny.buildPrompt = function (
        context: RepairContext,
        errData?: ErrorData,
        _sourceContent?: string | null,
        _cleanPath?: string | null
      ) {
        return originalBuildPrompt(
          context,
          errData,
          SYNTHETIC_TEST_FILE,
          'test/specs/dashboard/dash.greeting.canary.spec.ts'
        );
      };

      // Also inject reference test context into error data
      errorData.testArtifactLogs = REFERENCE_TEST;

      const result = await agent.generateFixRecommendation(
        repairContext,
        errorData
      );

      console.log('\n--- Fix Recommendation ---');
      console.log('Confidence:', result?.fix.confidence);
      console.log(
        'Changes:',
        result?.fix.proposedChanges?.length ?? 0
      );

      if (result?.fix.proposedChanges) {
        for (const change of result.fix.proposedChanges) {
          console.log(`\nFile: ${change.file}`);
          console.log(`oldCode:\n${change.oldCode}`);
          console.log(`newCode:\n${change.newCode}`);

          const oldCodeExists = SYNTHETIC_TEST_FILE.includes(change.oldCode);
          console.log(`\noldCode exists in source: ${oldCodeExists}`);

          expect(change.oldCode).toBeTruthy();
          expect(SYNTHETIC_TEST_FILE).toContain(change.oldCode);
        }
      }

      expect(result).not.toBeNull();
      expect(result!.fix.confidence).toBeGreaterThanOrEqual(50);
      expect(result!.fix.proposedChanges.length).toBeGreaterThan(0);
    },
    60_000
  );
});
