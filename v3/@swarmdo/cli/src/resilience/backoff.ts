/**
 * backoff.ts — exponential backoff with full jitter for retryable provider
 * failures (429 / 5xx / timeouts).
 *
 * The ADR-149 fallback chain retried instantly; a provider-level 429 is
 * usually account-wide, so an immediate re-call burns the attempt. Standard
 * remedy (AWS architecture blog, anthropic SDK internals): exponential base
 * with FULL jitter, capped. Pure — the jitter source is injectable so tests
 * are deterministic.
 */

export interface BackoffOptions {
  /** first-attempt base delay (default 1000ms) */
  baseMs?: number;
  /** hard cap per delay (default 8000ms) */
  capMs?: number;
  /** jitter source mapping an upper bound to a value in [0, bound); injectable for tests */
  jitter?: (boundMs: number) => number;
}

/** Delay before retry `attempt` (0-based): full-jitter exp backoff. */
export function computeBackoffMs(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 1000;
  const cap = opts.capMs ?? 8000;
  const jitter = opts.jitter ?? ((bound: number) => Math.random() * bound);
  const bound = Math.min(cap, base * 2 ** Math.max(0, attempt));
  return Math.floor(jitter(bound));
}

/** Retryable-failure classifier shared with the fallback chain. */
// \b only guards the numeric codes ('5031' must not match); the word classes
// match as substrings because providers emit snake_case ('overloaded_error',
// 'rate_limited') where \b fails before the underscore
const RETRYABLE = /\b(429|500|502|503|504)\b|timeout|overloaded|rate.?limit|ECONNRESET|ETIMEDOUT/i;

export function isRetryableError(errText: string | null | undefined): boolean {
  return RETRYABLE.test(errText ?? '');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
