/**
 * Cypress job log fixture for full-pipeline integration tests.
 * Format: Cypress 13 / SauceLabs-style runner output (representative of run 21640226152, lib-cypress-canary).
 * When extractErrorFromLogs() processes this, it should yield framework=cypress and the expected fields below.
 */

export const CYPRESS_RAW_LOG = `
2025-08-18T16:30:33.6959989Z        cy:xhr ➟  POST https://content.api.adept.at/graphql
2025-08-18T16:30:33.6960456Z        Status: 200
2025-08-18T16:30:33.6960789Z        Response: {"data":{"skillByUrlParams":{"id":"5bccb3e0-..."}}}
2025-08-18T16:30:33.6961567Z      Running test: Login flow
2025-08-18T16:30:33.6962234Z      1) Login flow
2025-08-18T16:30:33.6962901Z      TimeoutError: Timed out retrying after 4000ms: Expected to find element: '[data-testid="submit"]', but never found it.
2025-08-18T16:30:33.6963234Z          at Context.eval (webpack://cypress/./cypress/e2e/login.cy.js:25:8)
2025-08-18T16:30:33.6963568Z          at getRet (https://learn-webapp-la9pyhxwh-adept-at.vercel.app/__cypress/runner/cypress_runner.js:120949:20)
2025-08-18T16:30:33.7416816Z
2025-08-18T16:30:33.7417753Z   0 passing (4m)
2025-08-18T16:30:33.7418397Z   1 failing
`;

/** Expected ErrorData fields after extractErrorFromLogs(CYPRESS_RAW_LOG) */
export const CYPRESS_EXPECTED = {
  framework: 'cypress',
  failureType: 'TimeoutError',
  testName: 'Login flow',
  fileName: 'webpack://cypress/./cypress/e2e/login.cy.js',
  messageSubstring: 'Timed out retrying after 4000ms',
};
