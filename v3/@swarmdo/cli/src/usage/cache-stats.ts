/**
 * cache-stats.ts — prompt-cache efficiency analytics over the usage transcripts.
 *
 * Prompt caching is the #1 Claude Code cost lever: a cache read costs 0.1× a
 * fresh input token, a cache write 1.25×. The existing usage views show raw
 * cache token columns but never answer "is caching actually working, and what
 * is it saving me?". This computes, per model + overall: how much of the input
 * side was served cheaply from cache, and the net $ caching saved. Pure — the
 * price resolver is injected — so it is unit-tested without the pricing table.
 */

import { resolveTranscriptPrice, type TranscriptModelPrice } from './claude-pricing.js';
import type { UsageTotals } from './transcript-usage.js';

export interface CacheRow {
  model: string;
  freshInput: number;
  cacheWrite: number;
  cacheRead: number;
  /** freshInput + cacheWrite + cacheRead */
  inputSide: number;
  /** cacheRead / inputSide (0..1) — fraction of input tokens served from cache */
  cacheReadPct: number;
  /** net $ caching saved for this model, or null if the model is unpriced */
  savingsUsd: number | null;
}

export interface CacheStats {
  rows: CacheRow[];
  totalFreshInput: number;
  totalCacheWrite: number;
  totalCacheRead: number;
  totalInputSide: number;
  overallCacheReadPct: number;
  /** sum of priced per-model savings */
  totalSavingsUsd: number;
  hasPricedSavings: boolean;
  unpricedModels: string[];
}

type PriceResolver = (model: string) => TranscriptModelPrice | undefined;
type Tokenish = { inputTokens: number; cacheWriteTokens: number; cacheReadTokens: number };

/** Net $ caching saved for one model: what the input-side tokens would cost with
 * NO caching (all at the input rate) minus what they actually cost (fresh at
 * input, writes at 1.25×, reads at 0.1×). Null when the model is unpriced —
 * never guessed (matches the pricing module's discipline). */
export function modelCacheSavings(t: Tokenish, price?: TranscriptModelPrice): number | null {
  if (!price) return null;
  const noCache = (t.inputTokens + t.cacheWriteTokens + t.cacheReadTokens) * price.in;
  const actual = t.inputTokens * price.in + t.cacheWriteTokens * price.cacheWrite + t.cacheReadTokens * price.cacheRead;
  return (noCache - actual) / 1_000_000;
}

/** Fold per-model usage totals into cache-efficiency stats. Models with no
 * input-side tokens are skipped. Rows sorted by input volume, descending. */
export function computeCacheStats(
  models: Array<{ key: string; totals: UsageTotals }>,
  resolvePrice: PriceResolver = resolveTranscriptPrice,
): CacheStats {
  const rows: CacheRow[] = [];
  const unpriced = new Set<string>();
  let tFresh = 0, tWrite = 0, tRead = 0, tSavings = 0;
  let priced = false;

  for (const { key, totals } of models) {
    const freshInput = totals.inputTokens;
    const cacheWrite = totals.cacheWriteTokens;
    const cacheRead = totals.cacheReadTokens;
    const inputSide = freshInput + cacheWrite + cacheRead;
    if (inputSide === 0) continue;
    const savings = modelCacheSavings(totals, resolvePrice(key));
    if (savings === null) unpriced.add(key);
    else { priced = true; tSavings += savings; }
    rows.push({ model: key, freshInput, cacheWrite, cacheRead, inputSide, cacheReadPct: cacheRead / inputSide, savingsUsd: savings });
    tFresh += freshInput; tWrite += cacheWrite; tRead += cacheRead;
  }

  rows.sort((a, b) => b.inputSide - a.inputSide);
  const totalInputSide = tFresh + tWrite + tRead;
  return {
    rows,
    totalFreshInput: tFresh,
    totalCacheWrite: tWrite,
    totalCacheRead: tRead,
    totalInputSide,
    overallCacheReadPct: totalInputSide ? tRead / totalInputSide : 0,
    totalSavingsUsd: tSavings,
    hasPricedSavings: priced,
    unpricedModels: [...unpriced],
  };
}
