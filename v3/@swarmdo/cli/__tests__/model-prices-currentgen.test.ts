/**
 * #40 part 2 — the cost-optimal router's price table must reflect the
 * current-gen Claude lineup. The "opus" tier fallback was stuck at the retired
 * Opus 4.0 price ($15/$75), which made the selector avoid opus ~3x too eagerly
 * now that opus-tier == Opus 4.8 ($5/$25). Guard against regression.
 */
import { describe, it, expect } from 'vitest';
import { MODEL_PRICES, blendedPrice, costUsd } from '../src/swarmvector/model-prices.ts';

describe('model-prices — current-gen Claude (#40)', () => {
  it('prices the opus TIER at $5/$25, not the retired $15/$75', () => {
    expect(MODEL_PRICES.opus).toEqual({ in: 5, out: 25 });
    // blended = in + 3*out → 80, not the old 240
    expect(blendedPrice('opus')).toBe(80);
  });

  it('prices current-gen concrete slugs correctly', () => {
    expect(MODEL_PRICES['anthropic/claude-opus-4-8']).toEqual({ in: 5, out: 25 });
    expect(MODEL_PRICES['anthropic/claude-opus-4-5']).toEqual({ in: 5, out: 25 });
    expect(MODEL_PRICES['anthropic/claude-sonnet-5']).toEqual({ in: 3, out: 15 });
    expect(MODEL_PRICES['anthropic/claude-fable-5']).toEqual({ in: 10, out: 50 });
    expect(MODEL_PRICES['anthropic/claude-haiku-4.5']).toEqual({ in: 1, out: 5 });
  });

  it('keeps legacy Opus 4.0 at its correct $15/$75 (still a valid slug)', () => {
    expect(MODEL_PRICES['anthropic/claude-opus-4']).toEqual({ in: 15, out: 75 });
  });

  it('sonnet/haiku tier fallbacks track the current line', () => {
    expect(MODEL_PRICES.sonnet).toEqual({ in: 3, out: 15 });
    expect(MODEL_PRICES.haiku).toEqual({ in: 1, out: 5 });
  });

  it('still falls back to a $1 blended estimate for unknown models', () => {
    expect(blendedPrice('some/unknown-model')).toBe(1 + 3 * 1);
    expect(costUsd('some/unknown-model', 1_000_000, 1_000_000)).toBe(2);
  });

  it('costUsd computes opus-4-8 spend at the new rate', () => {
    // 1M in + 1M out at $5/$25 = $30
    expect(costUsd('anthropic/claude-opus-4-8', 1_000_000, 1_000_000)).toBe(30);
  });
});
