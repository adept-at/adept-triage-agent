#!/usr/bin/env node
/**
 * Deterministic validator for the synthetic Cypress selector canary.
 * Reads the fixture from disk and emits trusted Mocha-style evidence.
 *
 * Usage: node canary/validate-selector-fixture.cjs <spec-path>
 */
const fs = require('fs');
const path = require('path');

const specArg = process.argv[2];
if (!specArg) {
  console.error('Usage: node canary/validate-selector-fixture.cjs <spec-path>');
  process.exit(2);
}

const specPath = path.resolve(process.cwd(), specArg);
if (!fs.existsSync(specPath)) {
  console.error(`Spec not found: ${specPath}`);
  process.exit(2);
}

const content = fs.readFileSync(specPath, 'utf-8');
const allowedPath = 'canary/fixtures/cypress-selector.cy.js';
const normalized = specArg.replace(/\\/g, '/');
if (!normalized.endsWith(allowedPath)) {
  console.error(`Refusing to validate outside canary fixture: ${specArg}`);
  process.exit(2);
}

if (/browser\.\$|waitUntil|pause\(\)/.test(content)) {
  console.error('Rejecting non-Cypress or wait-based repair');
  console.log('\n  0 passing');
  console.log('  1 failing');
  process.exit(1);
}

const hasStale = /\[data-testid="submit"\]/.test(content);
const hasFixed = /\[data-testid="submit-button"\]/.test(content);

if (hasStale && !hasFixed) {
  console.log('\n  0 passing');
  console.log('  1 failing\n');
  console.log(
    '  1) synthetic selector repair uses the current submit selector:\n' +
      '     AssertionError: Expected to find element: \'[data-testid="submit"]\', but never found it.'
  );
  process.exit(1);
}

if (hasFixed && !hasStale) {
  console.log('\n  1 passing');
  console.log('  0 failing');
  process.exit(0);
}

console.error('Ambiguous fixture state — expected stale OR fixed selector, not both/neither');
console.log('\n  0 passing');
console.log('  1 failing');
process.exit(1);
