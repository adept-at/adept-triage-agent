import { supportsReasoningEffort } from '../../src/config/constants';

describe('supportsReasoningEffort', () => {
  it('keeps reasoning enabled for GPT-5.5 aliases, snapshots, and pro variants', () => {
    expect(supportsReasoningEffort('gpt-5.5')).toBe(true);
    expect(supportsReasoningEffort('gpt-5.5-pro')).toBe(true);
    expect(supportsReasoningEffort('gpt-5.5-2026-04-23')).toBe(true);
  });

  it('disables reasoning for non-5.5 rollback models', () => {
    expect(supportsReasoningEffort('gpt-4.1')).toBe(false);
    expect(supportsReasoningEffort('custom-model')).toBe(false);
  });
});
