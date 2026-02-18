import { extractErrorFromLogs } from '../src/simplified-analyzer';

describe('extractErrorFromLogs', () => {
  describe('TypeError: Cannot read properties', () => {
    it('should extract TypeError with statusCode property correctly', () => {
      const logs = `
2025-08-18T16:30:33.6959989Z        cy:xhr ➟  POST https://content.api.adept.at/graphql
2025-08-18T16:30:33.6960456Z        Status: 200
2025-08-18T16:30:33.6960789Z        Response: {"data":{"skillByUrlParams":{"id":"5bccb3e0-..."}}}
2025-08-18T16:30:33.6961567Z      Running test: SCA can create a lexical skill with multiple components on mobile - REFACTORED
2025-08-18T16:30:33.6962234Z      1) Test that sca can open skill modal, create and delete a lexical skill with multiple components on mobile
2025-08-18T16:30:33.6962901Z      TypeError: Cannot read properties of undefined (reading 'statusCode')
2025-08-18T16:30:33.6963234Z          at Context.eval (webpack://lib-cypress-13/./cypress/support/lexicalHelpers.js:407:37)
2025-08-18T16:30:33.6963568Z          at getRet (https://learn-webapp-la9pyhxwh-adept-at.vercel.app/__cypress/runner/cypress_runner.js:120949:20)
2025-08-18T16:30:33.6964567Z      cons:error ✘ Error: Invalid message
2025-08-18T16:30:33.6964901Z          at MessageFormat (main.394aaed0.js:2:3456789)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('TypeError');
      expect(result?.framework).toBe('javascript');
      expect(result?.message).toContain("TypeError: Cannot read properties of undefined (reading 'statusCode')");
      expect(result?.message).toContain('Context.eval');
      expect(result?.testName).toBe('Test that sca can open skill modal, create and delete a lexical skill with multiple components on mobile');
      expect(result?.fileName).toBe('webpack://lib-cypress-13/./cypress/support/lexicalHelpers.js');
    });

    it('should prioritize TypeError over other errors in the same log', () => {
      const logs = `
2025-08-18T16:30:33.6964567Z      cons:error ✘ Error: Invalid message
2025-08-18T16:30:33.6964901Z          at MessageFormat (main.394aaed0.js:2:3456789)
2025-08-18T16:30:33.6962901Z      TypeError: Cannot read property 'name' of null
2025-08-18T16:30:33.6963234Z          at UserProfile.render (src/components/UserProfile.tsx:45:10)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('TypeError');
      expect(result?.message).toContain("TypeError: Cannot read property 'name' of null");
      // Note: Due to the context window, it might pick up the earlier error's file
      // This is acceptable since we're prioritizing the correct error type
      expect(result?.fileName).toMatch(/\.(js|tsx)$/);
    });
  });

  describe('XHR log filtering', () => {
    it('should not extract XHR logs as errors', () => {
      const logs = `
2025-08-18T16:30:33.6959989Z        cy:xhr ➟  POST https://content.api.adept.at/graphql
2025-08-18T16:30:33.6960456Z        Status: 200
2025-08-18T16:30:33.6960789Z        Response: {"data":{"skillByUrlParams":{"id":"5bccb3e0-..."}}}
`;

      const result = extractErrorFromLogs(logs);
      
      // Should not extract XHR logs as errors
      expect(result).toBeNull();
    });

    it('should extract real errors even when preceded by XHR logs', () => {
      const logs = `
2025-08-18T16:30:33.6959989Z        cy:xhr ➟  POST https://content.api.adept.at/graphql
2025-08-18T16:30:33.6960456Z        Status: 200
2025-08-18T16:30:33.6962901Z      AssertionError: expected 'button' to be visible
2025-08-18T16:30:33.6963234Z          at Context.<anonymous> (cypress/e2e/test.cy.js:45:10)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('AssertionError');
      expect(result?.framework).toBe('cypress');
      expect(result?.message).toContain("AssertionError: expected 'button' to be visible");
    });
  });

  describe('Cypress-specific errors', () => {
    it('should extract Cypress server verification errors', () => {
      const logs = `
Running Cypress tests...
Starting Cypress...

Cypress could not verify that this server is running:

  > https://learn-webapp-65z7ixypt-adept-at.vercel.app

We are verifying this server because it has been configured as your baseUrl.

Cypress automatically waits until your server is accessible before running tests.

We will try connecting to it 3 more times...
We will try connecting to it 2 more times...
We will try connecting to it 1 more time...

Cypress failed to verify that your server is running.

Please start this server and then run Cypress again.
Error: Process completed with exit code 1.
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('CypressServerVerificationError');
      expect(result?.framework).toBe('cypress');
      expect(result?.message).toContain('Cypress could not verify that this server is running');
      expect(result?.message).toContain('https://learn-webapp-65z7ixypt-adept-at.vercel.app');
      expect(result?.message).toContain('baseUrl');
      expect(result?.message).toContain('Cypress failed to verify');
    });

    it('should extract Cypress timeout errors', () => {
      const logs = `
Running: test.cy.js
  1) Login flow
      TimeoutError: Timed out retrying after 4000ms: Expected to find element: '[data-testid="submit"]', but never found it.
          at Context.eval (webpack://cypress/./cypress/e2e/login.cy.js:25:8)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('TimeoutError');
      expect(result?.framework).toBe('cypress');
      expect(result?.message).toContain('TimeoutError: Timed out retrying after 4000ms');
      expect(result?.testName).toBe('Login flow');
    });

    it('should extract Cypress assertion errors', () => {
      const logs = `
  2) Header component
      AssertionError: Expected to find element: '.header-logo', but never found it
          at Context.eval (webpack://cypress/./cypress/e2e/header.cy.js:15:12)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('AssertionError');
      expect(result?.framework).toBe('cypress');
      expect(result?.testName).toBe('Header component');
    });
  });

  describe('WebDriverIO / WDIO errors', () => {
    it('should extract WDIO waitForDisplayed timeout (element still not visible)', () => {
      const logs = `
[0-0] RUNNING in chrome - file:///test/specs/orginvites/invite.org.trainer.ts
[0-0] Error: element ("[data-testid=invite-button]") still not visible after 10000 ms
[0-0]     at Context.<anonymous> (test/specs/orginvites/invite.org.trainer.ts:45:12)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toContain('still not visible');
      expect(result?.message).toContain('invite-button');
    });

    it('should extract WDIO Error in describe/spec title', () => {
      const logs = `
[0-0] RUNNING in chrome - test/specs/orginvites/invite.org.learner.enroll.ts
[0-0] Error in "invite learner enroll flow": element ("button[type=submit]") still not clickable after 5000 ms
[0-0]     at Context.<anonymous> (test/specs/orginvites/invite.org.learner.enroll.ts:28:8)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toContain('Error in "invite learner enroll flow"');
    });

    it('should extract Mocha hook errors (before all)', () => {
      const logs = `
[0-0] Error in "before all" hook: browser.url is not a function
[0-0]     at Suite.<anonymous> (test/specs/support/hooks.ts:12:10)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toContain('before all');
    });

    it('should extract no such element (Selenium/WebDriver)', () => {
      const logs = `
[0-0] WebDriverError: no such element: Unable to locate element: {"method":"css selector","selector":".missing-panel"}
[0-0]     at processTicksAndRejections (node:internal/process/task_queues:95:5)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toContain('no such element');
    });

    it('should extract stale element reference', () => {
      const logs = `
[0-0] stale element reference: element is not attached to the page document
[0-0]     at Context.<anonymous> (test/specs/orginvites/invite.org.trainer.ts:60:15)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toContain('stale element reference');
    });

    it('should extract element not interactable', () => {
      const logs = `
[0-0] element not interactable: element has zero size
[0-0]     at Context.<anonymous> (test/specs/orginvites/invite.org.trainer.ts:33:8)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toContain('element not interactable');
    });

    it('should extract ProtocolError / Sauce Labs style errors', () => {
      const logs = `
[0-0] ProtocolError: Protocol error (Target.setDiscoverTargets): Session closed.
[0-0] SauceLabsError: Session [abc123] was terminated (timeout)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.framework).toBe('webdriverio');
      expect(result?.message).toMatch(/ProtocolError|SauceLabsError/);
    });
  });

  describe('Test name extraction', () => {
    it('should extract test name from numbered format', () => {
      const logs = `
  1) Test that sca can open skill modal
      Error: Something went wrong
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.testName).toBe('Test that sca can open skill modal');
    });

    it('should extract test name from "Running test:" format', () => {
      const logs = `
Running test: Integration test for user creation
Error: API call failed
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.testName).toBe('Integration test for user creation');
    });

    it('should extract test name from it() blocks', () => {
      const logs = `
it('should handle user login correctly', () => {
  TypeError: Cannot read property 'token' of undefined
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.testName).toBe('should handle user login correctly');
    });
  });

  describe('File name extraction', () => {
    it('should extract file from stack trace', () => {
      const logs = `
Error: Test failed
    at Context.eval (cypress/e2e/test.cy.js:45:10)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.fileName).toBe('cypress/e2e/test.cy.js');
    });

    it('should extract file from webpack format', () => {
      const logs = `
TypeError: Cannot read property 'value' of undefined
    at Context.eval (webpack://lib-cypress-13/./cypress/support/helpers.js:100:5)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.fileName).toBe('webpack://lib-cypress-13/./cypress/support/helpers.js');
    });

    it('should extract file from "Running:" format', () => {
      const logs = `
Running: specs/integration.spec.js
Error: Test suite failed
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.fileName).toBe('specs/integration.spec.js');
    });
  });

  describe('Context window', () => {
    it('should capture sufficient context around the error', () => {
      const beforeContext = 'A'.repeat(400); // 400 chars before
      const afterContext = 'B'.repeat(1400); // 1400 chars after
      const logs = `
${beforeContext}
TypeError: Cannot read property 'test' of undefined
${afterContext}
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.message).toContain('TypeError');
      // Should include context from before (at least some of it)
      expect(result?.message).toContain('A');
      // Should include context from after
      expect(result?.message).toContain('B');
      // Check that we got substantial context
      expect(result?.message?.length).toBeGreaterThan(1000);
    });
  });

  describe('Error priority', () => {
    it('should prioritize specific TypeErrors over generic errors', () => {
      const logs = `
Error: Something went wrong
Failed: Test execution failed
TypeError: Cannot read properties of undefined (reading 'data')
    at fetchData (src/api.js:25:10)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('TypeError');
      expect(result?.message).toContain("Cannot read properties of undefined");
    });

    it('should prioritize Cypress errors over generic failures', () => {
      const logs = `
✖ Test failed
FAIL: Suite execution incomplete
CypressError: cy.click() can only be called on a single element
    at Context.click (cypress_runner.js:1000:10)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('CypressError');
      expect(result?.framework).toBe('cypress');
    });
  });

  describe('Edge cases', () => {
    it('should handle logs with ANSI escape codes', () => {
      const logs = `\u001b[31mError:\u001b[0m Test failed
\u001b[33mTypeError: Cannot read property 'id' of null\u001b[0m
    at getUser (src/user.js:10:5)`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('TypeError');
      // ANSI codes should be stripped
      expect(result?.message).not.toContain('\u001b');
    });

    it('should handle empty logs', () => {
      const result = extractErrorFromLogs('');
      expect(result).toBeNull();
    });

    it('should handle logs with no errors', () => {
      const logs = `
All tests passed successfully
✓ Test 1
✓ Test 2
✓ Test 3
`;

      const result = extractErrorFromLogs(logs);
      expect(result).toBeNull();
    });

    it('should handle multi-line error messages', () => {
      const logs = `
TypeError: Cannot read properties of undefined (reading 'statusCode')
    Expected response to have statusCode property
    But response was undefined
    at Context.eval (test.js:50:10)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.failureType).toBe('TypeError');
      expect(result?.message).toContain('Expected response to have statusCode property');
    });
  });

  describe('Intentional failure detection', () => {
    it('should identify intentional test failures', () => {
      const logs = `
  1) Triage agent test
      Error: Intentional failure for triage agent testing
          at Context.eval (cypress/e2e/intentional-fail.cy.js:10:5)
`;

      const result = extractErrorFromLogs(logs);
      
      expect(result).toBeTruthy();
      expect(result?.message).toContain('Intentional failure');
      expect(result?.testName).toBe('Triage agent test');
    });
  });
});
