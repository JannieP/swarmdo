/**
 * claude-pricing.ts — $/Mtok price table for RAW Anthropic model ids as they
 * appear in Claude Code transcript JSONL (`message.model`), including prompt-
 * cache write/read rates — cache tokens dominate real Claude Code spend.
 *
 * Deliberately separate from swarmvector/model-prices.ts: that table keys on
 * OpenRouter routing slugs and falls back to a $1/Mtok estimate so the router
 * always gets a number. Usage REPORTING needs the opposite semantics — an
 * unknown model must surface as "unpriced" (undefined) rather than silently
 * inventing dollars.
 *
 * Rates: Anthropic list prices. Cache write = 1.25× input (5-min TTL),
 * cache read = 0.1× input.
 */

/** $ per million tokens for one model family. */
export interface TranscriptModelPrice {
  in: number;
  out: number;
  /** 5-minute-TTL cache write (1.25× base input) */
  cacheWrite: number;
  /** 1-hour-TTL cache write (2× base input) */
  cacheWrite1h: number;
  cacheRead: number;
}

/**
 * Price families, matched by LONGEST normalized-id prefix so dated ids like
 * `claude-sonnet-4-6-20260115` resolve without per-snapshot entries.
 *
 * The Claude 5 tier (fable/mythos) is intentionally absent until Anthropic
 * publishes rates — absent means "unpriced", never "guessed".
 */
const PRICE_FAMILIES: Record<string, TranscriptModelPrice> = {
  'claude-opus-4': { in: 15, out: 75, cacheWrite: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  'claude-sonnet-4': { in: 3, out: 15, cacheWrite: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  'claude-haiku-4': { in: 1, out: 5, cacheWrite: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
  'claude-3-7-sonnet': { in: 3, out: 15, cacheWrite: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  'claude-3-5-sonnet': { in: 3, out: 15, cacheWrite: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  'claude-3-5-haiku': { in: 0.8, out: 4, cacheWrite: 1, cacheWrite1h: 1.6, cacheRead: 0.08 },
  'claude-3-opus': { in: 15, out: 75, cacheWrite: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  'claude-3-haiku': { in: 0.25, out: 1.25, cacheWrite: 0.3, cacheWrite1h: 0.5, cacheRead: 0.03 },
};

/**
 * Reduce a transcript/gateway model id to the bare Anthropic id:
 *   'anthropic/claude-opus-4-8'            → 'claude-opus-4-8'
 *   'us.anthropic.claude-sonnet-4-6-v2:0'  → 'claude-sonnet-4-6'  (Bedrock)
 *   'claude-sonnet-4-6@20260115'           → 'claude-sonnet-4-6'  (Vertex)
 */
export function normalizeTranscriptModelId(raw: string): string {
  let id = raw.trim().toLowerCase();
  const slash = id.lastIndexOf('/');
  if (slash !== -1) id = id.slice(slash + 1);
  const claudeAt = id.indexOf('claude-');
  if (claudeAt > 0) id = id.slice(claudeAt); // strips 'us.anthropic.' etc.
  id = id.replace(/[@:]\S*$/, ''); // Vertex '@date', Bedrock ':0'
  id = id.replace(/-v\d+$/, ''); // Bedrock '-v2'
  return id;
}

/** Longest-prefix price lookup; undefined = unpriced (report it, don't guess). */
export function resolveTranscriptPrice(rawModelId: string): TranscriptModelPrice | undefined {
  const id = normalizeTranscriptModelId(rawModelId);
  let best: TranscriptModelPrice | undefined;
  let bestLen = 0;
  for (const [prefix, price] of Object.entries(PRICE_FAMILIES)) {
    if (id.startsWith(prefix) && prefix.length > bestLen) {
      best = price;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** Token counts for one billed API response. */
export interface TokenBundle {
  inputTokens: number;
  outputTokens: number;
  /** TOTAL cache-write tokens (5-min + 1-hour). */
  cacheWriteTokens: number;
  /** The 1-hour-TTL SUBSET of cacheWriteTokens (≤ cacheWriteTokens). Default 0 → all writes priced at the 5-min rate. */
  cacheWrite1hTokens?: number;
  cacheReadTokens: number;
}

/** USD for one response at the given rates. */
export function transcriptCostUsd(price: TranscriptModelPrice, t: TokenBundle): number {
  const cacheWrite1h = t.cacheWrite1hTokens ?? 0;
  const cacheWrite5m = Math.max(0, t.cacheWriteTokens - cacheWrite1h);
  return (
    (t.inputTokens * price.in +
      t.outputTokens * price.out +
      cacheWrite5m * price.cacheWrite +
      cacheWrite1h * price.cacheWrite1h +
      t.cacheReadTokens * price.cacheRead) / 1_000_000
  );
}
