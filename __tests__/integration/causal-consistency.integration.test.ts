/**
 * Causal Consistency Integration Tests
 *
 * Validates that the analysis and fix generation prompts correctly
 * cross-reference their causal theories against the PR diff.
 *
 * Scenario: A login/auth failure (#password not found) occurs, but the PR diff
 * only shows LMS rendering changes — no auth code was touched. The model should
 * NOT claim the login UI was changed; it should recognize the failure is
 * unrelated to the PR.
 *
 * Run with: OPENAI_API_KEY=<key> npm run test:integration -- --testPathPattern=causal-consistency
 */

import { OpenAIClient } from '../../src/openai-client';
import { analyzeFailure } from '../../src/simplified-analyzer';
import { AnalysisAgent } from '../../src/agents/analysis-agent';
import { FixGenerationAgent } from '../../src/agents/fix-generation-agent';
import { InvestigationAgent } from '../../src/agents/investigation-agent';
import { ReviewAgent } from '../../src/agents/review-agent';
import { createAgentContext } from '../../src/agents/base-agent';
import type { ErrorData } from '../../src/types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const describeIfApiKey = OPENAI_API_KEY ? describe : describe.skip;

/**
 * PR diff that changes ONLY LMS rendering/parsing code — zero auth/login changes.
 * This is representative of the real-world failure that triggered this test.
 */
const UNRELATED_PR_DIFF = {
  totalChanges: 7,
  additions: 45,
  deletions: 20,
  files: [
    {
      filename: 'src/components/LessonContent/LessonRenderer.tsx',
      status: 'modified',
      additions: 15,
      deletions: 8,
      changes: 23,
      patch: `@@ -42,8 +42,15 @@
 export const LessonRenderer: React.FC<LessonRendererProps> = ({ lesson, mode }) => {
-  const content = parseContent(lesson.body);
-  return <div className="lesson-content">{content}</div>;
+  const content = useMemo(() => parseContent(lesson.body), [lesson.body]);
+  const sanitized = useMemo(() => sanitizeHtml(content), [content]);
+  return (
+    <div className="lesson-content">
+      <ErrorBoundary fallback={<ContentFallback />}>
+        {sanitized}
+      </ErrorBoundary>
+    </div>
+  );
 };`,
    },
    {
      filename: 'src/utils/content-parser.ts',
      status: 'modified',
      additions: 12,
      deletions: 5,
      changes: 17,
      patch: `@@ -18,5 +18,12 @@
-export function parseContent(raw: string): React.ReactNode {
-  return marked(raw);
+export function parseContent(raw: string): string {
+  if (!raw || typeof raw !== 'string') return '';
+  const parsed = marked(raw, { breaks: true, gfm: true });
+  return parsed;
 }
+
+export function sanitizeHtml(html: string): string {
+  return DOMPurify.sanitize(html, { ALLOWED_TAGS: SAFE_TAGS });
+}`,
    },
    {
      filename: 'src/components/LessonContent/ContentFallback.tsx',
      status: 'added',
      additions: 18,
      deletions: 0,
      changes: 18,
      patch: `@@ -0,0 +1,18 @@
+import React from 'react';
+
+export const ContentFallback: React.FC = () => (
+  <div className="content-fallback">
+    <p>Unable to render lesson content. Please try refreshing.</p>
+  </div>
+);`,
    },
  ],
};

/**
 * Simulates the real failure: #password not found during login in a before-all hook,
 * while the PR only changed LMS rendering code.
 */
const LOGIN_FAILURE_ERROR_DATA: ErrorData = {
  message: `Timed out retrying after 15000ms: Expected to find element: \`#password\`, but never found it.

Because this error occurred during a \`before all\` hook we are skipping the remaining tests in the current suite: \`Test that a user can add a collection to favorites\`

  1) Test that a user can add a collection to favorites
       Can open a collection and add to favorites and then remove from favorites:
     AssertionError: Timed out retrying after 15000ms: Expected to find element: \`#password\`, but never found it.
      at runnable.fn (cypress/support/commands.js:225:44)`,
  framework: 'cypress',
  testName: 'Test that a user can add a collection to favorites',
  fileName: 'cypress/support/commands.js',
  failureType: 'AssertionError',
  stackTrace: `AssertionError: Timed out retrying after 15000ms: Expected to find element: \`#password\`, but never found it.
    at Context.eval (webpack://learn-webapp/./cypress/support/commands.js:225:44)`,
  logs: [
    `0 passing (54s)
1 failing

1) Test that a user can add a collection to favorites
     Can open a collection and add to favorites and then remove from favorites:
   AssertionError: Timed out retrying after 15000ms: Expected to find element: \`#password\`, but never found it.

    at runnable.fn (cypress/support/commands.js:225:44)

Wrote txt logs to /home/runner/work/learn-webapp/learn-webapp/cypress/logs/out.txt.`,
  ],
  prDiff: UNRELATED_PR_DIFF,
  structuredSummary: {
    primaryError: {
      type: 'AssertionError',
      message: 'Timed out retrying after 15000ms: Expected to find element: `#password`, but never found it.',
      location: {
        file: 'webpack://learn-webapp/./cypress/support/commands.js',
        line: 225,
        isTestCode: true,
        isAppCode: false,
      },
    },
    testContext: {
      testName: 'Test that a user can add a collection to favorites',
      testFile: 'webpack://learn-webapp/./cypress/support/commands.js',
      framework: 'cypress',
    },
    failureIndicators: {
      hasNetworkErrors: false,
      hasNullPointerErrors: false,
      hasTimeoutErrors: true,
      hasDOMErrors: false,
      hasAssertionErrors: true,
      isMobileTest: false,
      hasLongTimeout: true,
      hasAltTextSelector: false,
      hasElementExistenceCheck: true,
      hasVisibilityIssue: false,
      hasViewportContext: false,
    },
    prRelevance: {
      testFileModified: false,
      relatedSourceFilesModified: [],
      riskScore: 'none',
    },
    keyMetrics: {
      hasScreenshots: false,
      logSize: 800,
    },
  },
};

/**
 * Same scenario expressed as AgentContext for the agent pipeline tests.
 */
const LOGIN_FAILURE_AGENT_CONTEXT = createAgentContext({
  errorMessage: LOGIN_FAILURE_ERROR_DATA.message,
  testFile: 'cypress/support/commands.js',
  testName: 'Test that a user can add a collection to favorites',
  errorType: 'ELEMENT_NOT_FOUND',
  errorSelector: '#password',
  stackTrace: LOGIN_FAILURE_ERROR_DATA.stackTrace,
  logs: LOGIN_FAILURE_ERROR_DATA.logs,
  framework: 'cypress',
  prDiff: {
    files: UNRELATED_PR_DIFF.files.map((f) => ({
      filename: f.filename,
      status: f.status,
      patch: f.patch,
    })),
  },
});

const LOGIN_COMMAND_SOURCE = `
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login');
  cy.get('#email').type(email);
  cy.get('#password').type(password);
  cy.get('button[type="submit"]').click();
  cy.url().should('not.include', '/login');
});

describe('Test that a user can add a collection to favorites', () => {
  before(() => {
    cy.login(Cypress.env('TEST_EMAIL'), Cypress.env('TEST_PASSWORD'));
  });

  it('Can open a collection and add to favorites and then remove from favorites', () => {
    cy.visit('/collections');
    cy.get('[data-testid="collection-card"]').first().click();
    cy.get('[data-testid="favorite-button"]').click();
    cy.get('[data-testid="favorite-button"]').should('have.class', 'favorited');
    cy.get('[data-testid="favorite-button"]').click();
    cy.get('[data-testid="favorite-button"]').should('not.have.class', 'favorited');
  });
});
`;

/** Case-insensitive patterns that indicate the model made the old mistake. */
const BAD_REASONING_PATTERNS = [
  /login (?:ui|interface|page|flow) (?:was |has been |got )?(?:changed|updated|modified|redesigned|migrated)/i,
  /(?:changed|updated|modified|switched|migrated) to (?:a )?(?:passwordless|email[- ]only|email[- ]first)/i,
  /(?:the )?(?:app|application|product|site) (?:now |has )?(?:uses?|serves?|renders?) (?:a )?(?:passwordless|email[- ]only)/i,
  /PR (?:changed|modified|updated) (?:the )?(?:login|auth|password)/i,
];

describeIfApiKey('Causal Consistency — PR Diff Cross-Reference', () => {
  let openaiClient: OpenAIClient;

  beforeAll(() => {
    openaiClient = new OpenAIClient(OPENAI_API_KEY!);
  });

  describe('Main Analysis (analyzeFailure)', () => {
    it('should NOT claim the login UI was changed when the diff shows no auth changes', async () => {
      const result = await analyzeFailure(openaiClient, LOGIN_FAILURE_ERROR_DATA);

      console.log('\n📊 analyzeFailure result:');
      console.log(`  Verdict: ${result.verdict}`);
      console.log(`  Confidence: ${result.confidence}%`);
      console.log(`  Reasoning: ${result.reasoning}`);
      console.log(`  Indicators: ${JSON.stringify(result.indicators)}`);

      // The key contract here is causal consistency:
      // the model must not fabricate a login/auth UI change from this PR diff.
      // Depending on the evidence it may still classify the broken login page as
      // TEST_ISSUE, INCONCLUSIVE, or PRODUCT_ISSUE, as long as it does not claim
      // the PR changed the login flow when the diff does not support that.
      expect(['TEST_ISSUE', 'INCONCLUSIVE', 'PRODUCT_ISSUE']).toContain(
        result.verdict
      );

      // The reasoning must NOT fabricate a login UI change
      for (const pattern of BAD_REASONING_PATTERNS) {
        expect(result.reasoning).not.toMatch(pattern);
      }

      // The reasoning SHOULD acknowledge the PR diff is unrelated
      const reasoning = result.reasoning.toLowerCase();
      const acknowledgesDiffUnrelated =
        reasoning.includes('unrelated') ||
        reasoning.includes('not related') ||
        reasoning.includes('not touched') ||
        reasoning.includes('not modified') ||
        reasoning.includes('no auth') ||
        reasoning.includes('no login') ||
        reasoning.includes('not changed') ||
        reasoning.includes('not in the') ||
        reasoning.includes('does not touch') ||
        reasoning.includes('did not change') ||
        reasoning.includes('didn\'t change') ||
        reasoning.includes('pre-existing') ||
        reasoning.includes('environment') ||
        reasoning.includes('outside') ||
        reasoning.includes('unaffected') ||
        reasoning.includes('no changes to') ||
        reasoning.includes('diff does not') ||
        reasoning.includes('diff doesn\'t') ||
        reasoning.includes('not part of');
      expect(acknowledgesDiffUnrelated).toBe(true);
    }, 60000);
  });

  describe('Agent Pipeline (AnalysisAgent → FixGenerationAgent)', () => {
    it('AnalysisAgent should identify failure as unrelated to PR changes', async () => {
      const agent = new AnalysisAgent(openaiClient);
      const result = await agent.execute({}, LOGIN_FAILURE_AGENT_CONTEXT);

      console.log('\n📊 AnalysisAgent result:');
      console.log(JSON.stringify(result.data, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Root cause should be selector mismatch or environment, not something
      // that implies the PR changed auth code
      expect([
        'SELECTOR_MISMATCH',
        'ENVIRONMENT_ISSUE',
        'STATE_DEPENDENCY',
        'TIMING_ISSUE',
      ]).toContain(result.data!.rootCauseCategory);

      // Explanation must not fabricate a login UI change
      for (const pattern of BAD_REASONING_PATTERNS) {
        expect(result.data!.explanation).not.toMatch(pattern);
      }
    }, 60000);

    it('FixGenerationAgent should not claim login code was changed by the PR', async () => {
      const analysisAgent = new AnalysisAgent(openaiClient);
      const analysisResult = await analysisAgent.execute(
        {},
        LOGIN_FAILURE_AGENT_CONTEXT
      );
      expect(analysisResult.success).toBe(true);

      const investigationAgent = new InvestigationAgent(openaiClient);
      const investigationResult = await investigationAgent.execute(
        { analysis: analysisResult.data! },
        LOGIN_FAILURE_AGENT_CONTEXT
      );
      expect(investigationResult.success).toBe(true);

      const contextWithSource = {
        ...LOGIN_FAILURE_AGENT_CONTEXT,
        sourceFileContent: LOGIN_COMMAND_SOURCE,
      };

      const fixAgent = new FixGenerationAgent(openaiClient);
      const fixResult = await fixAgent.execute(
        {
          analysis: analysisResult.data!,
          investigation: investigationResult.data!,
        },
        contextWithSource
      );

      console.log('\n📊 FixGenerationAgent result:');
      console.log(JSON.stringify(fixResult.data, null, 2));

      expect(fixResult.success).toBe(true);
      expect(fixResult.data).toBeDefined();

      // The fix reasoning must NOT claim the login UI was changed
      for (const pattern of BAD_REASONING_PATTERNS) {
        expect(fixResult.data!.reasoning).not.toMatch(pattern);
      }

      // The fix summary must NOT claim the login UI was changed
      for (const pattern of BAD_REASONING_PATTERNS) {
        expect(fixResult.data!.summary).not.toMatch(pattern);
      }
    }, 120000);

    it('ReviewAgent should reject a fix whose reasoning contradicts the diff', async () => {
      const contextWithSource = {
        ...LOGIN_FAILURE_AGENT_CONTEXT,
        sourceFileContent: LOGIN_COMMAND_SOURCE,
      };

      const badFix = {
        changes: [
          {
            file: 'cypress/support/commands.js',
            line: 225,
            oldCode: `  cy.get('#password').type(password);`,
            newCode: `  cy.get('body').then(($body) => {
    if ($body.find('#password').length > 0) {
      cy.get('#password').type(password);
    } else {
      cy.contains('button', 'Go').click();
    }
  });`,
            justification:
              'Makes login command compatible with new passwordless login UI that was deployed',
            changeType: 'LOGIC_CHANGE' as const,
          },
        ],
        confidence: 92,
        summary:
          'Update login command to support new passwordless login flow that was introduced',
        reasoning:
          'The login UI was changed to a passwordless email-only flow. The #password selector no longer exists because the app now uses email-only authentication.',
        evidence: [
          'Screenshot shows email-only login page',
          'Network calls include loginWithEmail endpoint',
        ],
        risks: [],
      };

      const badAnalysis = {
        rootCauseCategory: 'SELECTOR_MISMATCH' as const,
        contributingFactors: [],
        confidence: 90,
        explanation:
          'The login UI was updated to a passwordless flow, removing the #password field.',
        selectors: ['#password'],
        elements: [],
        issueLocation: 'TEST_CODE' as const,
        patterns: {
          hasTimeout: true,
          hasVisibilityIssue: false,
          hasNetworkCall: false,
          hasStateAssertion: false,
          hasDynamicContent: false,
          hasResponsiveIssue: false,
        },
        suggestedApproach:
          'Update login command to handle passwordless login UI',
      };

      const reviewAgent = new ReviewAgent(openaiClient);
      const reviewResult = await reviewAgent.execute(
        { proposedFix: badFix, analysis: badAnalysis },
        contextWithSource
      );

      console.log('\n📊 ReviewAgent result on contradictory fix:');
      console.log(JSON.stringify(reviewResult.data, null, 2));

      expect(reviewResult.success).toBe(true);
      expect(reviewResult.data).toBeDefined();

      // The reviewer should catch that the fix reasoning contradicts the diff
      // (claims login UI changed, but diff only shows LMS rendering changes)
      const hasDiffContradictionIssue = reviewResult.data!.issues.some(
        (issue) =>
          issue.severity === 'CRITICAL' &&
          (issue.description.toLowerCase().includes('diff') ||
            issue.description.toLowerCase().includes('pr') ||
            issue.description.toLowerCase().includes('contradict') ||
            issue.description.toLowerCase().includes('not changed') ||
            issue.description.toLowerCase().includes('not modified') ||
            issue.description.toLowerCase().includes('no evidence') ||
            issue.description.toLowerCase().includes('no auth') ||
            issue.description.toLowerCase().includes('login'))
      );

      // Should either reject outright or flag the contradiction as critical
      const rejected = !reviewResult.data!.approved;
      expect(rejected || hasDiffContradictionIssue).toBe(true);
    }, 60000);
  });
});
