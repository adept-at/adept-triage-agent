/**
 * Healthy canary fixture — uses the current product selector.
 * The synthetic canary workflow seeds a stale selector on an ephemeral branch.
 */
describe('synthetic selector repair', () => {
  it('uses the current submit selector', () => {
    cy.get('[data-testid="submit"]').click();
  });
});
