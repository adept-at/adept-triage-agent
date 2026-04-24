/**
 * Normalize model-produced confidence scores before they reach gates.
 * LLM JSON occasionally returns out-of-range numbers; thresholds assume 0-100.
 */
export function clampConfidence(value: unknown, fallback = 50): number {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
  return Math.max(0, Math.min(100, numeric));
}
