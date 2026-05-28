"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WDIO_PATTERNS = exports.CYPRESS_PATTERNS = void 0;
exports.getFrameworkProfile = getFrameworkProfile;
const CYPRESS_COMMAND_INVOCATION = /cy\.[a-zA-Z]\w*/g;
const WDIO_COMMAND_INVOCATION = /(?:browser|driver)\.[a-zA-Z]\w*|\$\$?\(/g;
const CYPRESS_CUSTOM_COMMAND = /Cypress\.Commands\.add\(\s*['"`]([\w-]+)['"`]/g;
const WDIO_CUSTOM_COMMAND = /(?:browser|driver)\.addCommand\(\s*['"`]([\w-]+)['"`]/g;
const CYPRESS_SELECTOR = /cy\.get\s*\(\s*['"`]([^'"`]+)['"`]|(\[data-testid=["'][^"']+["']\])/g;
const WDIO_SELECTOR = /\$\$?\(\s*['"`]([^'"`]+)['"`]\s*\)|(\[data-testid=["'][^"']+["']\])|(aria\/[\w-]+)/g;
const union = (a, b) => new RegExp(`${a.source}|${b.source}`, 'g');
const CYPRESS_SUPPORT_FILE_CANDIDATES = [
    'cypress/support/commands.js',
    'cypress/support/commands.ts',
    'cypress/support/e2e.js',
    'cypress/support/e2e.ts',
    'cypress/support/index.js',
    'cypress/support/index.ts',
    'test/helpers/index.ts',
    'test/helpers/index.js',
    'test/support/index.ts',
    'test/support/index.js',
    'wdio.conf.ts',
    'wdio.conf.js',
];
const WDIO_SUPPORT_FILE_CANDIDATES = [
    'test/specs',
    'test/pageobjects',
    'pageobjects',
    'test/support',
    'commands',
    'test/support/index.ts',
    'test/support/index.js',
    'test/helpers/index.ts',
    'test/helpers/index.js',
    'commands.ts',
    'commands.js',
    'wdio.conf.ts',
    'wdio.conf.js',
];
const UNKNOWN_SUPPORT_FILE_CANDIDATES = [
    ...new Set([
        ...CYPRESS_SUPPORT_FILE_CANDIDATES,
        ...WDIO_SUPPORT_FILE_CANDIDATES,
    ]),
];
exports.CYPRESS_PATTERNS = `## Cypress Fix Patterns

### Chaining & Retry-ability
Cypress commands auto-retry, but \`.then()\` callbacks do not. Prefer assertion-based waits over arbitrary waits.

### Selector Updates
\`\`\`javascript
// OLD: Fragile class selector
cy.get('.old-button-class')

// NEW: Prefer data-testid, aria-label, or cy.contains
cy.get('[data-testid="submit-button"]')
cy.get('button').contains('Submit')
cy.findByRole('button', { name: 'Submit' })
\`\`\`

### Visibility/Existence Checks
\`\`\`javascript
// OLD: Click without checking visibility
cy.get('#element').click()

// NEW: Assert visible, then act
cy.get('#element').should('be.visible').click()
// For conditional elements:
cy.get('#element').should('exist').and('be.visible').click()
\`\`\`

### Timing/Wait Issues
\`\`\`javascript
// OLD: No wait for async operation
cy.get('#result')

// BEST: Intercept the API call
cy.intercept('GET', '/api/data').as('getData')
cy.wait('@getData')
cy.get('#result')

// ALT: Increase assertion timeout for slow renders
cy.get('#result', { timeout: 15000 }).should('contain', 'Expected')
\`\`\`

### Overflow/Responsive Menu
\`\`\`javascript
// OLD: Direct click on element that might be in overflow menu
cy.get('[aria-label="Action"]').click()

// NEW: Conditional interaction
cy.get('body').then($body => {
  if ($body.find('[aria-label="Action"]:visible').length > 0) {
    cy.get('[aria-label="Action"]').click()
  } else {
    cy.get('[aria-label="More"]').click()
    cy.get('[aria-label="Action"]').click()
  }
})
\`\`\`

### cy.session for Login
\`\`\`javascript
// Cache login across tests
cy.session('user', () => {
  cy.visit('/login')
  cy.get('#email').type(user.email)
  cy.get('#password').type(user.password)
  cy.get('button[type="submit"]').click()
  cy.url().should('not.include', '/login')
})
\`\`\`

### Iframe & Shadow DOM
\`\`\`javascript
// Access shadow DOM
cy.get('my-component').shadow().find('.inner-element')

// Switch into iframe
cy.get('iframe#editor').its('0.contentDocument.body').then(cy.wrap)
\`\`\`

### No-op Patterns to Avoid
\`\`\`javascript
// AVOID: wrapping Cypress chains in conditionals that re-check what
// Cypress already asserts. \`.should('not.exist')\` already waits until
// the element is gone (or times out).
// ❌ cy.get('body').then($body => {
//      if ($body.find('#snackbar').length > 0) {
//        cy.get('#snackbar').should('not.exist')  // already waits
//      }
//    })

// PREFER: just call the assertion — Cypress handles the absent case.
// ✅ cy.get('#snackbar').should('not.exist')

// Similarly, avoid adding \`cy.wait(1000)\` as a "safety buffer" before an
// assertion that already retries. Use an assertion-based wait or intercept.
\`\`\`

### Selector Form: Avoid Ambiguous Text Matches
\`\`\`javascript
// AVOID: mixing scope implicitly — \`cy.contains()\` returns the deepest
// matching element, which may not be the one you want when multiple
// elements contain the same text.
// ❌ cy.contains('Success')

// PREFER: scope contains() to a specific container, or use selector + text
// ✅ cy.get('[role="dialog"]').contains('Success')
// ✅ cy.findByRole('dialog').findByText('Success')  // @testing-library
\`\`\`

`;
exports.WDIO_PATTERNS = `## WebDriverIO Fix Patterns

### Selector Strategy
\`\`\`javascript
// OLD: Fragile class selector
await $('.old-button-class').click()

// NEW: Prefer data-testid or aria selectors
await $('[data-testid="submit-button"]').click()
await $('aria/Submit')  // WDIO aria selector strategy
\`\`\`

### waitForDisplayed / waitForClickable / waitForExist
\`\`\`javascript
// OLD: Click without waiting
await $('button').click()

// NEW: Wait for clickable state
await $('button').waitForClickable({ timeout: 15000 })
await $('button').click()

// For elements that load asynchronously
await $('[data-testid="result"]').waitForDisplayed({ timeout: 10000 })
const text = await $('[data-testid="result"]').getText()

// For elements that may not be in DOM yet
await $('[data-testid="modal"]').waitForExist({ timeout: 10000 })
\`\`\`

### browser.waitUntil for Complex Conditions
\`\`\`javascript
// OLD: Simple wait
await browser.pause(3000)

// NEW: Condition-based wait
await browser.waitUntil(
  async () => (await $('[data-testid="status"]').getText()) === 'Ready',
  { timeout: 15000, timeoutMsg: 'Status never became Ready' }
)
\`\`\`

### Multi-remote / Browser Scope
\`\`\`javascript
// OLD: Ambiguous browser reference in multi-remote
await $('button').click()

// NEW: Explicit browser instance
const elem = await browserA.$('[data-testid="start"]')
await elem.waitForClickable()
await elem.click()
\`\`\`

### Shadow DOM & Custom Elements
\`\`\`javascript
// Access shadow root
const host = await $('mux-player')
const shadowBtn = await host.shadow$('button.play')
await shadowBtn.waitForClickable({ timeout: 15000 })
await shadowBtn.click()
\`\`\`

### browser.execute for DOM Interaction
\`\`\`javascript
// Scroll element into view
await browser.execute((el) => el.scrollIntoView({ block: 'center' }), await $('button'))
await $('button').waitForClickable()
await $('button').click()
\`\`\`

### Stale Element Recovery
\`\`\`javascript
// OLD: Direct action on potentially stale element
const el = await $('button')
await el.click()

// NEW: Re-query before action
await $('button').waitForClickable({ timeout: 10000 })
await $('button').click()
\`\`\`

### Selector Form: Avoid Mixed Strategies
\`\`\`javascript
// AVOID: combining an attribute selector with partial-text matching on the
// SAME element. WDIO's docs call this "mixed strategies" and behavior
// depends on version; the \`*=\` text match may or may not scan descendant
// text of the attribute-matched element.
// ❌ await $("[role='dialog']*=Your success text")
// ❌ await $("header h1*=Welcome")   // explicitly forbidden in WDIO docs

// PREFER: chained element queries (guaranteed to scope correctly)
// ✅ const dialog = await $("[role='dialog']")
//    const success = await dialog.$("*=Your success text")
//    if (await success.isDisplayed()) { ... }

// OR: XPath with explicit descendant semantics (always unambiguous)
// ✅ await $("//*[@role='dialog']//*[contains(normalize-space(), 'Your success text')]")
\`\`\`

### No-op Patterns to Avoid
\`\`\`javascript
// AVOID: wrapping already-idempotent operations in existence guards.
// Most WDIO waits already handle the absent case cleanly — adding a guard
// creates a race window without adding safety.
// ❌ if (await el.isExisting()) {
//      await el.waitForExist({ reverse: true })   // already no-ops when absent
//    }
// The guarded form converts a real "appeared then didn't dismiss" signal
// into silence (if the element appears between the isExisting check and
// the wait, the wait is skipped).

// PREFER: call the wait directly — reverse: true returns immediately when
// the element doesn't exist, so no guard is needed.
// ✅ await el.waitForExist({ timeout: 120000, reverse: true })

// Similarly, don't wrap isDisplayed / isExisting in defensive try/catch
// that just returns false — these methods already return false on missing
// elements. Only catch when you need to distinguish stale-element errors.
\`\`\`

`;
const NEUTRAL_FIX_PATTERN_BLOCK = `## Framework-Neutral Fix Guidance

Framework is undetermined — do NOT assume \`cy.*\` or \`browser.*\`; match the exact idioms visible in the provided test file. Mirror the commands, selector strategies, and assertion style already present in the test rather than introducing framework-specific APIs.

`;
const NEUTRAL_PROFILE = {
    label: 'unknown',
    commandPrefix: '',
    fixPatternBlock: NEUTRAL_FIX_PATTERN_BLOCK,
    commandInvocationPattern: union(CYPRESS_COMMAND_INVOCATION, WDIO_COMMAND_INVOCATION),
    customCommandPattern: union(CYPRESS_CUSTOM_COMMAND, WDIO_CUSTOM_COMMAND),
    selectorPattern: union(CYPRESS_SELECTOR, WDIO_SELECTOR),
    supportFileCandidates: UNKNOWN_SUPPORT_FILE_CANDIDATES,
};
const FRAMEWORK_PROFILES = {
    cypress: {
        label: 'Cypress',
        commandPrefix: 'cy',
        fixPatternBlock: exports.CYPRESS_PATTERNS,
        commandInvocationPattern: CYPRESS_COMMAND_INVOCATION,
        customCommandPattern: CYPRESS_CUSTOM_COMMAND,
        selectorPattern: CYPRESS_SELECTOR,
        supportFileCandidates: CYPRESS_SUPPORT_FILE_CANDIDATES,
    },
    webdriverio: {
        label: 'WebDriverIO',
        commandPrefix: 'browser',
        fixPatternBlock: exports.WDIO_PATTERNS,
        commandInvocationPattern: WDIO_COMMAND_INVOCATION,
        customCommandPattern: WDIO_CUSTOM_COMMAND,
        selectorPattern: WDIO_SELECTOR,
        supportFileCandidates: WDIO_SUPPORT_FILE_CANDIDATES,
    },
};
function getFrameworkProfile(f) {
    if (f === 'cypress' || f === 'webdriverio') {
        return FRAMEWORK_PROFILES[f];
    }
    return NEUTRAL_PROFILE;
}
//# sourceMappingURL=framework-profiles.js.map