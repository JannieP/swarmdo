import { describe, it, expect } from 'vitest';
import { computeBackoffMs, isRetryableError } from '../src/resilience/backoff.ts';

const noJitter = (bound: number): number => bound; // deterministic: take the bound

describe('resilience: computeBackoffMs', () => {
  it('doubles per attempt from the base', () => {
    expect(computeBackoffMs(0, { jitter: noJitter })).toBe(1000);
    expect(computeBackoffMs(1, { jitter: noJitter })).toBe(2000);
    expect(computeBackoffMs(2, { jitter: noJitter })).toBe(4000);
  });
  it('caps the bound', () => {
    expect(computeBackoffMs(5, { jitter: noJitter })).toBe(8000);
    expect(computeBackoffMs(50, { jitter: noJitter, capMs: 3000 })).toBe(3000);
  });
  it('full jitter stays within [0, bound); negative attempts clamp to base', () => {
    for (let i = 0; i < 50; i++) {
      const v = computeBackoffMs(3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8000);
    }
    expect(computeBackoffMs(-4, { jitter: noJitter })).toBe(1000);
  });
  it('honors custom base', () => {
    expect(computeBackoffMs(1, { baseMs: 250, jitter: noJitter })).toBe(500);
  });
});

describe('resilience: isRetryableError', () => {
  it('matches the transient classes', () => {
    for (const e of ['HTTP 429', 'status 503', 'Request timeout', 'overloaded_error', 'rate limit exceeded', 'rate_limited', 'socket ECONNRESET', 'ETIMEDOUT']) {
      expect(isRetryableError(e)).toBe(true);
    }
  });
  it('rejects permanent failures and empties', () => {
    for (const e of ['401 unauthorized', 'invalid_request_error', 'model not found', '', null, undefined]) {
      expect(isRetryableError(e as string | null | undefined)).toBe(false);
    }
  });
});
