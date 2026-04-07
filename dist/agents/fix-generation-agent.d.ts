import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
import { AnalysisOutput } from './analysis-agent';
import { InvestigationOutput } from './investigation-agent';
export declare const COMMON_PREAMBLE = "You are an expert test engineer who specializes in fixing failing E2E tests.\n\n## Your Task\n\nGenerate precise, working code changes to fix the failing test based on the analysis and investigation provided.\n\n## Code Change Requirements\n\n1. **Exact Matching**: The \"oldCode\" MUST match the original code EXACTLY, character for character, including:\n   - All whitespace (spaces, tabs, newlines)\n   - All punctuation and quotes\n   - All indentation\n\n2. **Minimal Changes**: Only change what's necessary to fix the issue. Don't refactor unrelated code.\n\n3. **Working Code**: The \"newCode\" must be syntactically valid and work correctly.\n\n4. **Preserve Style**: Match the existing code style (quotes, semicolons, indentation).\n\n";
export declare const CYPRESS_PATTERNS = "## Cypress Fix Patterns\n\n### Chaining & Retry-ability\nCypress commands auto-retry, but `.then()` callbacks do not. Prefer assertion-based waits over arbitrary waits.\n\n### Selector Updates\n```javascript\n// OLD: Fragile class selector\ncy.get('.old-button-class')\n\n// NEW: Prefer data-testid, aria-label, or cy.contains\ncy.get('[data-testid=\"submit-button\"]')\ncy.get('button').contains('Submit')\ncy.findByRole('button', { name: 'Submit' })\n```\n\n### Visibility/Existence Checks\n```javascript\n// OLD: Click without checking visibility\ncy.get('#element').click()\n\n// NEW: Assert visible, then act\ncy.get('#element').should('be.visible').click()\n// For conditional elements:\ncy.get('#element').should('exist').and('be.visible').click()\n```\n\n### Timing/Wait Issues\n```javascript\n// OLD: No wait for async operation\ncy.get('#result')\n\n// BEST: Intercept the API call\ncy.intercept('GET', '/api/data').as('getData')\ncy.wait('@getData')\ncy.get('#result')\n\n// ALT: Increase assertion timeout for slow renders\ncy.get('#result', { timeout: 15000 }).should('contain', 'Expected')\n```\n\n### Overflow/Responsive Menu\n```javascript\n// OLD: Direct click on element that might be in overflow menu\ncy.get('[aria-label=\"Action\"]').click()\n\n// NEW: Conditional interaction\ncy.get('body').then($body => {\n  if ($body.find('[aria-label=\"Action\"]:visible').length > 0) {\n    cy.get('[aria-label=\"Action\"]').click()\n  } else {\n    cy.get('[aria-label=\"More\"]').click()\n    cy.get('[aria-label=\"Action\"]').click()\n  }\n})\n```\n\n### cy.session for Login\n```javascript\n// Cache login across tests\ncy.session('user', () => {\n  cy.visit('/login')\n  cy.get('#email').type(user.email)\n  cy.get('#password').type(user.password)\n  cy.get('button[type=\"submit\"]').click()\n  cy.url().should('not.include', '/login')\n})\n```\n\n### Iframe & Shadow DOM\n```javascript\n// Access shadow DOM\ncy.get('my-component').shadow().find('.inner-element')\n\n// Switch into iframe\ncy.get('iframe#editor').its('0.contentDocument.body').then(cy.wrap)\n```\n\n";
export declare const WDIO_PATTERNS = "## WebDriverIO Fix Patterns\n\n### Selector Strategy\n```javascript\n// OLD: Fragile class selector\nawait $('.old-button-class').click()\n\n// NEW: Prefer data-testid or aria selectors\nawait $('[data-testid=\"submit-button\"]').click()\nawait $('aria/Submit')  // WDIO aria selector strategy\n```\n\n### waitForDisplayed / waitForClickable / waitForExist\n```javascript\n// OLD: Click without waiting\nawait $('button').click()\n\n// NEW: Wait for clickable state\nawait $('button').waitForClickable({ timeout: 15000 })\nawait $('button').click()\n\n// For elements that load asynchronously\nawait $('[data-testid=\"result\"]').waitForDisplayed({ timeout: 10000 })\nconst text = await $('[data-testid=\"result\"]').getText()\n\n// For elements that may not be in DOM yet\nawait $('[data-testid=\"modal\"]').waitForExist({ timeout: 10000 })\n```\n\n### browser.waitUntil for Complex Conditions\n```javascript\n// OLD: Simple wait\nawait browser.pause(3000)\n\n// NEW: Condition-based wait\nawait browser.waitUntil(\n  async () => (await $('[data-testid=\"status\"]').getText()) === 'Ready',\n  { timeout: 15000, timeoutMsg: 'Status never became Ready' }\n)\n```\n\n### Multi-remote / Browser Scope\n```javascript\n// OLD: Ambiguous browser reference in multi-remote\nawait $('button').click()\n\n// NEW: Explicit browser instance\nconst elem = await browserA.$('[data-testid=\"start\"]')\nawait elem.waitForClickable()\nawait elem.click()\n```\n\n### Shadow DOM & Custom Elements\n```javascript\n// Access shadow root\nconst host = await $('mux-player')\nconst shadowBtn = await host.shadow$('button.play')\nawait shadowBtn.waitForClickable({ timeout: 15000 })\nawait shadowBtn.click()\n```\n\n### browser.execute for DOM Interaction\n```javascript\n// Scroll element into view\nawait browser.execute((el) => el.scrollIntoView({ block: 'center' }), await $('button'))\nawait $('button').waitForClickable()\nawait $('button').click()\n```\n\n### Stale Element Recovery\n```javascript\n// OLD: Direct action on potentially stale element\nconst el = await $('button')\nawait el.click()\n\n// NEW: Re-query before action\nawait $('button').waitForClickable({ timeout: 10000 })\nawait $('button').click()\n```\n\n";
export interface CodeChange {
    file: string;
    line: number;
    oldCode: string;
    newCode: string;
    justification: string;
    changeType: 'SELECTOR_UPDATE' | 'WAIT_ADDITION' | 'LOGIC_CHANGE' | 'ASSERTION_UPDATE' | 'OTHER';
}
export interface FixGenerationOutput {
    changes: CodeChange[];
    confidence: number;
    summary: string;
    reasoning: string;
    evidence: string[];
    risks: string[];
    alternatives?: string[];
}
export interface FixGenerationInput {
    analysis: AnalysisOutput;
    investigation: InvestigationOutput;
    previousFeedback?: string | null;
}
export declare class FixGenerationAgent extends BaseAgent<FixGenerationInput, FixGenerationOutput> {
    constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>);
    execute(input: FixGenerationInput, context: AgentContext, previousResponseId?: string): Promise<AgentResult<FixGenerationOutput>>;
    protected getSystemPrompt(framework?: string): string;
    protected buildUserPrompt(input: FixGenerationInput, context: AgentContext): string;
    private findErrorLineInFile;
    private findEnclosingFunction;
    protected parseResponse(response: string): FixGenerationOutput | null;
}
//# sourceMappingURL=fix-generation-agent.d.ts.map