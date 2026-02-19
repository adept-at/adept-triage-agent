/**
 * Shared mock OpenAI responses for pipeline integration tests.
 * Shapes match production: OpenAIResponse (analyze), and AIRecommendation (single-shot repair).
 * See src/types.ts and src/repair/simplified-repair-agent.ts (AIRecommendation / AIChange).
 */

import type { OpenAIResponse } from '../../src/types';

/** Response from OpenAIClient.analyze() for TEST_ISSUE verdict (used by analyzeFailure) */
export const ANALYSIS_TEST_ISSUE: OpenAIResponse = {
  verdict: 'TEST_ISSUE',
  reasoning: 'Element not found or timeout indicates test sync or selector issue.',
  indicators: ['Timeout', 'Element not found'],
  suggestedSourceLocations: [],
};

/** Response from OpenAIClient.analyze() for PRODUCT_ISSUE (optional, for negative tests) */
export const ANALYSIS_PRODUCT_ISSUE: OpenAIResponse = {
  verdict: 'PRODUCT_ISSUE',
  reasoning: 'Application bug.',
  indicators: [],
};

/**
 * Parsed shape from generateWithCustomPrompt (single-shot repair) for Cypress.
 * Must produce proposedChanges with cy.get / cy.contains style.
 */
export const FIX_RECOMMENDATION_CYPRESS_JSON = {
  confidence: 85,
  reasoning: 'Selector was renamed; update to match data-testid.',
  rootCause: 'Selector mismatch',
  evidence: ['Button uses data-testid="submit-button" in app'],
  changes: [
    {
      file: 'cypress/e2e/login.cy.ts',
      line: 25,
      oldCode: "cy.get('[data-testid=\"submit\"]')",
      newCode: "cy.get('[data-testid=\"submit-button\"]')",
      justification: 'Update selector to match renamed data-testid',
    },
  ],
};

/** Same as above as string for mock return */
export const FIX_RECOMMENDATION_CYPRESS_STRING = JSON.stringify(
  FIX_RECOMMENDATION_CYPRESS_JSON
);

/**
 * Parsed shape from generateWithCustomPrompt (single-shot repair) for WDIO.
 * Must produce proposedChanges with browser.$ / browser.waitForDisplayed style.
 */
export const FIX_RECOMMENDATION_WDIO_JSON = {
  confidence: 85,
  reasoning: 'Element may not be visible yet; add explicit wait.',
  rootCause: 'Element visibility timing',
  evidence: ['Element found but not interactable'],
  changes: [
    {
      file: 'test/specs/skills/multi.skill.lock.editor.ts',
      line: 42,
      oldCode: 'const el = browser.$(".skill-panel");',
      newCode:
        'const el = browser.$(".skill-panel");\n  await el.waitForDisplayed({ timeout: 10000 });',
      justification: 'Wait for element to be displayed before interacting',
    },
  ],
};

/** Same as above as string for mock return */
export const FIX_RECOMMENDATION_WDIO_STRING = JSON.stringify(
  FIX_RECOMMENDATION_WDIO_JSON
);

// --- Agentic path (Analysis -> Investigation -> FixGen -> Review) ---

/** Analysis agent output (framework-agnostic) */
export const AGENTIC_ANALYSIS = {
  rootCauseCategory: 'SELECTOR_MISMATCH',
  contributingFactors: [] as string[],
  confidence: 85,
  explanation: 'Selector no longer matches; update to match data-testid.',
  selectors: ['[data-testid="submit"]'],
  elements: ['submit button'],
  issueLocation: 'TEST_CODE' as const,
  patterns: {
    hasTimeout: false,
    hasVisibilityIssue: false,
    hasNetworkCall: false,
    hasStateAssertion: false,
    hasDynamicContent: false,
    hasResponsiveIssue: false,
  },
  suggestedApproach: 'Update selector to match renamed data-testid',
};

/** Investigation agent output */
export const AGENTIC_INVESTIGATION = {
  findings: [
    {
      type: 'SELECTOR_CHANGE',
      severity: 'HIGH' as const,
      description: 'data-testid was renamed to submit-button',
      evidence: ['PR diff shows change'],
      location: { file: 'src/App.tsx', line: 10, code: 'data-testid="submit-button"' },
      relationToError: 'Direct cause',
    },
  ],
  primaryFinding: {
    type: 'SELECTOR_CHANGE',
    severity: 'HIGH',
    description: 'data-testid was renamed',
    evidence: [],
    relationToError: 'Direct cause',
  },
  isTestCodeFixable: true,
  recommendedApproach: 'Update test to use data-testid="submit-button"',
  selectorsToUpdate: [
    {
      current: '[data-testid="submit"]',
      reason: 'Renamed in app',
      suggestedReplacement: '[data-testid="submit-button"]',
    },
  ],
  confidence: 90,
};

/** Fix generation agent output – Cypress syntax */
export const AGENTIC_FIX_CYPRESS = {
  changes: [
    {
      file: 'cypress/e2e/login.cy.ts',
      line: 25,
      oldCode: "cy.get('[data-testid=\"submit\"]')",
      newCode: "cy.get('[data-testid=\"submit-button\"]')",
      justification: 'Match renamed data-testid',
      changeType: 'SELECTOR_UPDATE',
    },
  ],
  confidence: 88,
  summary: 'Update selector to submit-button',
  reasoning: 'Selector was renamed in app.',
  evidence: ['PR diff'],
  risks: [] as string[],
  alternatives: [] as string[],
};

/** Fix generation agent output – WDIO syntax */
export const AGENTIC_FIX_WDIO = {
  changes: [
    {
      file: 'test/specs/skills/multi.skill.lock.editor.ts',
      line: 42,
      oldCode: 'const el = browser.$(".skill-panel");',
      newCode:
        'const el = browser.$(".skill-panel");\n  await el.waitForDisplayed({ timeout: 10000 });',
      justification: 'Wait for element before interacting',
      changeType: 'SELECTOR_UPDATE',
    },
  ],
  confidence: 88,
  summary: 'Add waitForDisplayed for skill panel',
  reasoning: 'Element may not be visible yet.',
  evidence: ['Logs show timing'],
  risks: [] as string[],
  alternatives: [] as string[],
};

/** Review agent output (approved) */
export const AGENTIC_REVIEW_APPROVED = {
  approved: true,
  issues: [] as unknown[],
  assessment: 'Fix correctly addresses the root cause.',
  fixConfidence: 90,
  improvements: [] as string[],
};

export const AGENTIC_ANALYSIS_STRING = JSON.stringify(AGENTIC_ANALYSIS);
export const AGENTIC_INVESTIGATION_STRING = JSON.stringify(AGENTIC_INVESTIGATION);
export const AGENTIC_FIX_CYPRESS_STRING = JSON.stringify(AGENTIC_FIX_CYPRESS);
export const AGENTIC_FIX_WDIO_STRING = JSON.stringify(AGENTIC_FIX_WDIO);
export const AGENTIC_REVIEW_APPROVED_STRING = JSON.stringify(AGENTIC_REVIEW_APPROVED);
