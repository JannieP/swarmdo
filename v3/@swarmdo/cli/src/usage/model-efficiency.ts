/**
 * model-efficiency.ts — rank models by their EFFECTIVE cost per unit of useful
 * output in your actual usage.
 *
 * A model's list output price is fixed, but what you really pay per output token
 * also carries the input + cache cost of every request amortized over the output
 * it produced. A model driven with huge contexts can effectively cost far more
 * per output token than its sticker price — this surfaces that, per model, from
 * the same aggregation the `usage models` view already computes.
 *
 * Pure: it folds already-summed per-model totals, no transcripts, no clock.
 */

import type { UsageTotals } from './transcript-usage.js';

export interface ModelEfficiency {
  model: string;
  costUsd: number;
  outputTokens: number;
  /** effective $ per 1,000,000 output tokens (cost / output × 1e6) */
  costPerMOutput: number;
}

/**
 * Effective cost per 1M output tokens per model, cheapest first. Models with no
 * cost or no output are dropped (no meaningful ratio). Pure.
 */
export function computeModelEfficiency(models: Array<{ key: string; totals: UsageTotals }>): ModelEfficiency[] {
  return models
    .filter((m) => m.totals.costUsd > 0 && m.totals.outputTokens > 0)
    .map((m) => ({
      model: m.key,
      costUsd: m.totals.costUsd,
      outputTokens: m.totals.outputTokens,
      costPerMOutput: (m.totals.costUsd / m.totals.outputTokens) * 1_000_000,
    }))
    .sort((a, b) => a.costPerMOutput - b.costPerMOutput || (a.model < b.model ? -1 : 1));
}
