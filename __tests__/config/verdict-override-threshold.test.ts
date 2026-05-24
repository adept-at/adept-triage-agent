/**
 * Lock the agreed value of `VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD` —
 * changes to this constant alter when the orchestrator aborts repair
 * on a confident product-side override (see `agent-orchestrator.ts`).
 * Bumping the threshold should be a deliberate decision, not an
 * accidental refactor — this test forces a consciously-updated test
 * if the constant is changed.
 *
 * Background: pre-v1.52.16 the override gate compared
 * `verdictOverride.confidence` to `analysis.confidence` directly,
 * which produced an apples-to-oranges comparison (see
 * `code_review_may_2026.md` finding #4). The fix replaced the
 * comparison with this absolute threshold; 70 was chosen to match the
 * `AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE` floor used elsewhere as
 * "non-trivial signal."
 */
import { VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD, AGENT_CONFIG } from '../../src/config/constants';

describe('VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD (v1.52.16)', () => {
  it('is set to 70', () => {
    expect(VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD).toBe(70);
  });

  it('matches AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE (non-trivial signal floor)', () => {
    // The intent is "the override agent must be at least as confident
    // as the floor we use elsewhere for shipping a fix." If these
    // drift, surfacing the inconsistency is the right call — bump
    // both intentionally or document the divergence.
    expect(VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD).toBe(
      AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE
    );
  });

  it('is between 50 and 90 (sanity bounds)', () => {
    expect(VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD).toBeGreaterThanOrEqual(50);
    expect(VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(90);
  });
});
