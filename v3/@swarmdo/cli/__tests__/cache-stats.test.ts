import { describe, it, expect } from 'vitest';
import { computeCacheStats, modelCacheSavings } from '../src/usage/cache-stats.ts';
import type { UsageTotals } from '../src/usage/transcript-usage.ts';

const totals = (o: Partial<UsageTotals>): UsageTotals => ({
  inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
  totalTokens: 0, costUsd: 0, entries: 0, ...o,
});
// sonnet-like rates: in 3, write 3.75 (1.25×), read 0.3 (0.1×)
const price = { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 };
const resolver = (m: string) => (m === 'priced' ? price : undefined);

describe('cache-stats: modelCacheSavings', () => {
  it('computes net savings vs a no-cache baseline', () => {
    // noCache=(1+1+8)M*3=30; actual=1*3+1*3.75+8*0.3=9.15; saved=(30-9.15)=20.85
    const s = modelCacheSavings({ inputTokens: 1e6, cacheWriteTokens: 1e6, cacheReadTokens: 8e6 }, price);
    expect(s).toBeCloseTo(20.85, 5);
  });
  it('is null for unpriced models (never guessed)', () => {
    expect(modelCacheSavings({ inputTokens: 1e6, cacheWriteTokens: 0, cacheReadTokens: 0 }, undefined)).toBeNull();
  });
  it('is ~0 when nothing is cached', () => {
    expect(modelCacheSavings({ inputTokens: 5e6, cacheWriteTokens: 0, cacheReadTokens: 0 }, price)).toBeCloseTo(0, 9);
  });
  it('can be negative when writes dominate reads (cache never paid off)', () => {
    // lots of writes, no reads → net cost, negative savings
    const s = modelCacheSavings({ inputTokens: 0, cacheWriteTokens: 1e6, cacheReadTokens: 0 }, price)!;
    expect(s).toBeLessThan(0);
  });
});

describe('cache-stats: computeCacheStats', () => {
  it('computes per-model rows, cacheReadPct and totals', () => {
    const stats = computeCacheStats([
      { key: 'priced', totals: totals({ inputTokens: 1e6, cacheWriteTokens: 1e6, cacheReadTokens: 8e6 }) },
    ], resolver);
    expect(stats.rows).toHaveLength(1);
    const r = stats.rows[0];
    expect(r.inputSide).toBe(10e6);
    expect(r.cacheReadPct).toBeCloseTo(0.8, 5);
    expect(r.savingsUsd).toBeCloseTo(20.85, 5);
    expect(stats.overallCacheReadPct).toBeCloseTo(0.8, 5);
    expect(stats.totalSavingsUsd).toBeCloseTo(20.85, 5);
    expect(stats.hasPricedSavings).toBe(true);
  });

  it('tracks unpriced models and excludes them from savings', () => {
    const stats = computeCacheStats([
      { key: 'priced', totals: totals({ inputTokens: 1e6, cacheReadTokens: 1e6 }) },
      { key: 'mystery', totals: totals({ inputTokens: 2e6, cacheReadTokens: 2e6 }) },
    ], resolver);
    expect(stats.unpricedModels).toEqual(['mystery']);
    expect(stats.rows.find((r) => r.model === 'mystery')!.savingsUsd).toBeNull();
    // savings only counts the priced model
    expect(stats.totalSavingsUsd).toBeGreaterThan(0);
  });

  it('skips models with no input-side tokens', () => {
    const stats = computeCacheStats([
      { key: 'empty', totals: totals({ outputTokens: 5e6 }) },
      { key: 'priced', totals: totals({ inputTokens: 1e6 }) },
    ], resolver);
    expect(stats.rows.map((r) => r.model)).toEqual(['priced']);
  });

  it('sorts rows by input volume descending', () => {
    const stats = computeCacheStats([
      { key: 'small', totals: totals({ inputTokens: 1e6 }) },
      { key: 'big', totals: totals({ inputTokens: 9e6 }) },
    ], resolver);
    expect(stats.rows.map((r) => r.model)).toEqual(['big', 'small']);
  });

  it('handles an empty input set', () => {
    const stats = computeCacheStats([], resolver);
    expect(stats.totalInputSide).toBe(0);
    expect(stats.overallCacheReadPct).toBe(0);
    expect(stats.rows).toEqual([]);
  });
});
