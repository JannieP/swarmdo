import { describe, it, expect } from 'vitest';
import { evaluateGuard, type GuardThreshold } from '../src/usage/spend-guard.ts';

const t = (current: number, limit: number, key = 'k'): GuardThreshold => ({ key, label: key, current, limit, unit: 'usd' });

describe('spend-guard: evaluateGuard', () => {
  it('is ok below the warn threshold', () => {
    const r = evaluateGuard([t(5, 10)], 0.8); // 50%
    expect(r.checks[0].status).toBe('ok');
    expect(r.status).toBe('ok');
    expect(r.configured).toBe(true);
  });

  it('warns at/above warnPct but below the limit', () => {
    expect(evaluateGuard([t(8, 10)], 0.8).status).toBe('warn');   // exactly 80%
    expect(evaluateGuard([t(9.9, 10)], 0.8).status).toBe('warn'); // 99%
  });

  it('is over at/above 100%', () => {
    expect(evaluateGuard([t(10, 10)]).status).toBe('over');
    expect(evaluateGuard([t(12, 10)]).status).toBe('over');
  });

  it('reports the worst status across checks', () => {
    const r = evaluateGuard([t(1, 10, 'a'), t(9, 10, 'b'), t(11, 10, 'c')]);
    expect(r.status).toBe('over'); // c is over, dominates
    expect(r.checks.map((c) => c.status)).toEqual(['ok', 'warn', 'over']);
  });

  it('ignores thresholds with no positive limit', () => {
    const r = evaluateGuard([t(5, 0, 'unset'), t(9, 10, 'set')]);
    expect(r.checks.map((c) => c.key)).toEqual(['set']);
    expect(r.configured).toBe(true);
  });

  it('is unconfigured (ok) when nothing has a limit', () => {
    const r = evaluateGuard([t(100, 0)]);
    expect(r.configured).toBe(false);
    expect(r.status).toBe('ok');
    expect(r.checks).toEqual([]);
  });

  it('computes pct and honors a custom warnPct', () => {
    const r = evaluateGuard([t(6, 10)], 0.5); // 60% vs warn 50%
    expect(r.checks[0].pct).toBeCloseTo(0.6, 5);
    expect(r.checks[0].status).toBe('warn');
  });

  it('falls back to 0.8 warnPct for out-of-range values', () => {
    expect(evaluateGuard([t(7, 10)], 0).status).toBe('ok');   // 70% < 80%
    expect(evaluateGuard([t(8.5, 10)], 5).status).toBe('warn'); // 85% >= 80%
  });
});
