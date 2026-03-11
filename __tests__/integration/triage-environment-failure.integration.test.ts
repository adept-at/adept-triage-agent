/**
 * Integration test: verify the analyzer correctly classifies environment/deployment
 * failures (e.g., wrong API endpoint causing login page to not render) as PRODUCT_ISSUE
 * rather than TEST_ISSUE.
 *
 * Run: OPENAI_API_KEY=sk-... npx jest --testPathPattern=triage-environment-failure --testPathIgnorePatterns=[]
 */

import { OpenAIClient } from '../../src/openai-client';
import { analyzeFailure } from '../../src/simplified-analyzer';
import { ErrorData } from '../../src/types';

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

// Simulates the actual scenario: developer hardwired a dev API URL,
// causing the login page to not render. The #password field is never found.
const LOGIN_FAILURE_ERROR_DATA: ErrorData = {
  message: `Timed out retrying after 15000ms: Expected to find element: #password, but never found it.

Because this error occurred during a \`before each\` hook we are skipping the remaining tests in the current suite: \`Test that user can log in and get to an orgs catalog\`

  at Context.eval (cypress/support/commands.js:232:12)`,
  framework: 'cypress',
  testName: 'Test that user can log in and get to an orgs catalog',
  fileName: 'webpack://learn-webapp/./cypress/support/commands.js',
  failureType: 'CypressError',
  logs: [
    `Running: adept.catalog.skill.load.js (1 of 1)

  Test that user can log in and get to an orgs catalog
    1) "before each" hook for "should verify the catalog loads"

  0 passing (18s)
  1 failing

  1) Test that user can log in and get to an orgs catalog
       "before each" hook for "should verify the catalog loads":
     CypressError: Timed out retrying after 15000ms: Expected to find element: #password, but never found it.

      at Context.eval (webpack://learn-webapp/./cypress/support/commands.js:232:12)

  (Results)

  ┌────────────────────────────────────────────────────────────────────────┐
  │ Tests:        1                                                        │
  │ Passing:      0                                                        │
  │ Failing:      1                                                        │
  │ Pending:      0                                                        │
  │ Skipped:      0                                                        │
  │ Screenshots:  2                                                        │
  │ Duration:     18 seconds                                               │
  │ Spec Ran:     adept.catalog.skill.load.js                             │
  └────────────────────────────────────────────────────────────────────────┘`,
  ],
  screenshots: [
    {
      name: 'login-page-blank.png',
      timestamp: new Date().toISOString(),
    },
    {
      name: 'login-page-error.png',
      timestamp: new Date().toISOString(),
    },
  ],
  prDiff: {
    totalChanges: 3,
    additions: 45,
    deletions: 12,
    files: [
      {
        filename: 'src/editor/LexicalEditor.tsx',
        additions: 30,
        deletions: 8,
        patch: `@@ -15,8 +15,12 @@
-import { OldPlugin } from './plugins/OldPlugin';
+import { NewPlugin } from './plugins/NewPlugin';
+import { LexicalConfig } from './config';`,
      },
      {
        filename: '.env.production',
        additions: 1,
        deletions: 1,
        patch: `@@ -1,1 +1,1 @@
-REACT_APP_API_URL=https://api.adept.at
+REACT_APP_API_URL=https://localhost:3001`,
      },
      {
        filename: 'src/editor/plugins/NewPlugin.tsx',
        additions: 14,
        deletions: 3,
        patch: `@@ -1,3 +1,14 @@
+export const NewPlugin = () => {
+  // new editor plugin
+};`,
      },
    ],
  },
  context:
    'Multiple tests failing on PR #3580 (branch: zach/lms-lexical). All failures occur during login — #password element not found. The login helper (commands.js) has not been modified in this PR.',
};

// Same scenario but WITHOUT the .env change in the diff — tests if the model
// can still reason that login failure across all tests = environment issue
const LOGIN_FAILURE_NO_ENV_DIFF: ErrorData = {
  ...LOGIN_FAILURE_ERROR_DATA,
  prDiff: {
    totalChanges: 2,
    additions: 44,
    deletions: 11,
    files: [
      {
        filename: 'src/editor/LexicalEditor.tsx',
        additions: 30,
        deletions: 8,
        patch: `@@ -15,8 +15,12 @@
-import { OldPlugin } from './plugins/OldPlugin';
+import { NewPlugin } from './plugins/NewPlugin';`,
      },
      {
        filename: 'src/editor/plugins/NewPlugin.tsx',
        additions: 14,
        deletions: 3,
        patch: `@@ -1,3 +1,14 @@
+export const NewPlugin = () => {
+  // new editor plugin
+};`,
      },
    ],
  },
  context:
    'Multiple unrelated tests (catalog, playlists, dashboard, batch operations, favorites) are ALL failing during login — #password element not found. The login helper (commands.js) has not been modified in this PR. The PR only modifies lexical editor code.',
};

describe('Triage: environment/deployment failure classification', () => {
  const itOrSkip = OPENAI_API_KEY ? it : it.skip;

  itOrSkip(
    'should classify login-page-not-rendering as PRODUCT_ISSUE when env diff is visible',
    async () => {
      const client = new OpenAIClient(OPENAI_API_KEY!);

      const result = await analyzeFailure(client, LOGIN_FAILURE_ERROR_DATA);

      console.log('\n--- Analysis Result (with .env diff) ---');
      console.log('Verdict:', result.verdict);
      console.log('Confidence:', result.confidence);
      console.log('Reasoning:', result.reasoning);
      console.log('Indicators:', result.indicators);

      expect(result.verdict).toBe('PRODUCT_ISSUE');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
    },
    60_000
  );

  itOrSkip(
    'should classify login-page-not-rendering as PRODUCT_ISSUE even without env diff (mass failure pattern)',
    async () => {
      const client = new OpenAIClient(OPENAI_API_KEY!);

      const result = await analyzeFailure(client, LOGIN_FAILURE_NO_ENV_DIFF);

      console.log('\n--- Analysis Result (no .env diff, mass failure context) ---');
      console.log('Verdict:', result.verdict);
      console.log('Confidence:', result.confidence);
      console.log('Reasoning:', result.reasoning);
      console.log('Indicators:', result.indicators);

      // With mass failure context and unrelated PR changes, should NOT be TEST_ISSUE
      expect(result.verdict).not.toBe('TEST_ISSUE');
    },
    60_000
  );
});
