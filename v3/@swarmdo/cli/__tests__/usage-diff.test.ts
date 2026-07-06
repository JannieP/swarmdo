import { describe, it, expect } from 'vitest';
import {
  resolvePeriodPair,
  parseRange,
  sumPeriod,
  metricDelta,
  diffPeriods,
  modelMovers,
  type DayRow,
  type ModelRow,
} from '../src/usage/diff.ts';

const day = (key: string, costUsd: number, tokens = 100): DayRow => ({
  key,
  totals: { costUsd, inputTokens: tokens, outputTokens: tokens, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: tokens * 2 },
});

describe('usage-diff: resolvePeriodPair', () => {
  it('day → today vs yesterday', () => {
    const { a, b } = resolvePeriodPair('day', '2026-07-07');
    expect([a.from, a.to]).toEqual(['2026-07-07', '2026-07-07']);
    expect([b.from, b.to]).toEqual(['2026-07-06', '2026-07-06']);
  });
  it('week → rolling 7 vs prior 7 (no gap, no overlap)', () => {
    const { a, b } = resolvePeriodPair('week', '2026-07-07');
    expect([a.from, a.to]).toEqual(['2026-07-01', '2026-07-07']);
    expect([b.from, b.to]).toEqual(['2026-06-24', '2026-06-30']);
  });
  it('month → month-to-date vs full previous month (incl. year wrap)', () => {
    const jul = resolvePeriodPair('month', '2026-07-07');
    expect([jul.a.from, jul.a.to]).toEqual(['2026-07-01', '2026-07-07']);
    expect([jul.b.from, jul.b.to]).toEqual(['2026-06-01', '2026-06-30']);
    const jan = resolvePeriodPair('month', '2026-01-15');
    expect([jan.b.from, jan.b.to]).toEqual(['2025-12-01', '2025-12-31']);
  });
  it('rejects junk', () => {
    expect(() => resolvePeriodPair('year', '2026-07-07')).toThrow(/unknown period/);
    expect(() => resolvePeriodPair('day', '07/07/2026')).toThrow(/anchor/);
  });
});

describe('usage-diff: parseRange', () => {
  it('parses and labels explicit ranges', () => {
    const p = parseRange('2026-06-01:2026-06-30');
    expect(p).toMatchObject({ from: '2026-06-01', to: '2026-06-30' });
  });
  it('rejects malformed and reversed ranges', () => {
    expect(() => parseRange('2026-06-01')).toThrow(/expected/);
    expect(() => parseRange('2026-06-30:2026-06-01')).toThrow(/reversed/);
  });
});

describe('usage-diff: math', () => {
  const rows = [day('2026-07-01', 10), day('2026-07-05', 20), day('2026-06-25', 40), day('2026-06-01', 5)];

  it('sums inclusively within bounds only', () => {
    const t = sumPeriod(rows, { from: '2026-07-01', to: '2026-07-07', label: 'a' });
    expect(t.costUsd).toBe(30);
    expect(t.totalTokens).toBe(400);
  });

  it('metricDelta: pct against B, null when B=0 and A>0, 0 when both 0', () => {
    expect(metricDelta(15, 10)).toMatchObject({ delta: 5, pct: 0.5 });
    expect(metricDelta(5, 0).pct).toBeNull();
    expect(metricDelta(0, 0).pct).toBe(0);
  });

  it('diffPeriods composes totals + active days', () => {
    const r = diffPeriods(rows, { from: '2026-07-01', to: '2026-07-07', label: 'a' }, { from: '2026-06-24', to: '2026-06-30', label: 'b' });
    expect(r.cost).toMatchObject({ a: 30, b: 40, delta: -10 });
    expect(r.activeDays).toMatchObject({ a: 2, b: 1 });
  });
});

describe('usage-diff: modelMovers', () => {
  const md: ModelRow[] = [
    { key: 'opus', day: '2026-07-02', totals: day('x', 30).totals },
    { key: 'opus', day: '2026-06-25', totals: day('x', 10).totals },
    { key: 'haiku', day: '2026-06-26', totals: day('x', 8).totals },
    { key: 'sonnet', day: '2026-05-01', totals: day('x', 99).totals }, // outside both
  ];
  const a = { from: '2026-07-01', to: '2026-07-07', label: 'a' };
  const b = { from: '2026-06-24', to: '2026-06-30', label: 'b' };

  it('ranks by |Δ|, drops models absent from both periods', () => {
    const m = modelMovers(md, a, b);
    expect(m.map((x) => x.model)).toEqual(['opus', 'haiku']);
    expect(m[0].cost).toMatchObject({ a: 30, b: 10, delta: 20 });
    expect(m[1].cost.pct).toBe(-1); // haiku disappeared → -100%
  });
});
