import { describe, it, expect } from 'vitest';
import { computeModelEfficiency } from '../src/usage/model-efficiency.ts';
import type { UsageTotals } from '../src/usage/transcript-usage.ts';

const t = (p: Partial<UsageTotals>): UsageTotals => ({
  inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalTokens: 0, costUsd: 0, entries: 0, ...p,
});
const m = (key: string, costUsd: number, outputTokens: number) => ({ key, totals: t({ costUsd, outputTokens }) });

describe('model-efficiency: computeModelEfficiency', () => {
  it('computes effective $ per 1M output tokens and ranks cheapest first', () => {
    // A: $10 / 1M out = $10/M ; B: $30 / 1M out = $30/M ; C: $5 / 500k out = $10/M
    const out = computeModelEfficiency([m('B', 30, 1_000_000), m('A', 10, 1_000_000), m('C', 5, 500_000)]);
    expect(out.map((e) => e.model)).toEqual(['A', 'C', 'B']); // 10, 10, 30 — A before C on tie (name asc)
    expect(out[0].costPerMOutput).toBeCloseTo(10, 6);
    expect(out[2].costPerMOutput).toBeCloseTo(30, 6);
  });

  it('drops models with no cost or no output (no meaningful ratio)', () => {
    const out = computeModelEfficiency([
      m('priced', 12, 400_000),
      m('free', 0, 1000),        // no cost
      m('noout', 5, 0),          // no output
    ]);
    expect(out.map((e) => e.model)).toEqual(['priced']);
  });

  it('reflects input/cache overhead — same output, more spend = worse efficiency', () => {
    // both produced 1M output; heavy carries extra input/cache cost → higher $/M
    const out = computeModelEfficiency([m('heavy', 40, 1_000_000), m('lean', 20, 1_000_000)]);
    expect(out.map((e) => e.model)).toEqual(['lean', 'heavy']);
    expect(out[1].costPerMOutput).toBeCloseTo(40, 6);
  });

  it('returns empty for no priced models', () => {
    expect(computeModelEfficiency([])).toEqual([]);
    expect(computeModelEfficiency([m('x', 0, 0)])).toEqual([]);
  });
});
