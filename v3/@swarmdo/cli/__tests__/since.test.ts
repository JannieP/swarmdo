import { describe, it, expect } from 'vitest';
import { normalizeSince } from '../src/util/since.ts';

describe('normalizeSince', () => {
  it('maps compact forms git approxidate cannot parse to spelled-out ones', () => {
    expect(normalizeSince('90d')).toBe('90 days ago');
    expect(normalizeSince('2w')).toBe('2 weeks ago');
    expect(normalizeSince('6mo')).toBe('6 months ago');
    expect(normalizeSince('1y')).toBe('1 years ago');
    expect(normalizeSince('3h')).toBe('3 hours ago');
  });

  it('accepts longer unit spellings and surrounding space', () => {
    expect(normalizeSince(' 30 days ')).toBe('30 days ago');
    expect(normalizeSince('6 months')).toBe('6 months ago');
    expect(normalizeSince('1 week')).toBe('1 weeks ago');
  });

  it('passes through anything already git-friendly or unrecognized', () => {
    expect(normalizeSince('3 months ago')).toBe('3 months ago'); // already spelled out (has "ago")
    expect(normalizeSince('2026-01-01')).toBe('2026-01-01');     // ISO date
    expect(normalizeSince('yesterday')).toBe('yesterday');
    expect(normalizeSince('')).toBe('');
    expect(normalizeSince('90x')).toBe('90x'); // unknown unit → untouched
  });
});
