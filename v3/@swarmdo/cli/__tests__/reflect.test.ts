import { describe, it, expect } from 'vitest';
import {
  nextDay,
  spanDays,
  longestStreakOf,
  monthsBefore,
  peakHourOf,
  hourSparkline,
  detectSpikeDays,
  computeReflection,
} from '../src/usage/reflect.ts';
import type { DayRow, ModelRow, DayTotals } from '../src/usage/diff.ts';

const dt = (p: Partial<DayTotals>): DayTotals => ({
  costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, ...p,
});
const day = (key: string, p: Partial<DayTotals>): DayRow => ({ key, totals: dt(p) });
const mr = (model: string, d: string, p: Partial<DayTotals>): ModelRow => ({ key: model, day: d, totals: dt(p) });

describe('reflect: nextDay', () => {
  it('advances within a month, across months, and across a year', () => {
    expect(nextDay('2026-03-04')).toBe('2026-03-05');
    expect(nextDay('2026-03-31')).toBe('2026-04-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
  it('handles the leap-day boundary (2028 is a leap year)', () => {
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(nextDay('2028-02-29')).toBe('2028-03-01');
    expect(nextDay('2027-02-28')).toBe('2027-03-01'); // 2027 not a leap year
  });
});

describe('reflect: spanDays', () => {
  it('is inclusive: same day is 1, consecutive is 2, across a month boundary counts calendar days', () => {
    expect(spanDays('2026-03-05', '2026-03-05')).toBe(1);
    expect(spanDays('2026-03-05', '2026-03-06')).toBe(2);
    expect(spanDays('2026-01-30', '2026-02-02')).toBe(4); // 30,31,1,2
  });
});

describe('reflect: monthsBefore', () => {
  it('subtracts whole months, rolling the year back', () => {
    expect(monthsBefore('2026-03-15', 3)).toBe('2025-12-15');
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15');
    expect(monthsBefore('2026-07-10', 12)).toBe('2025-07-10');
  });
  it('clamps the day to the target month length (Mar 31 − 1mo → Feb 28)', () => {
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsBefore('2028-03-31', 1)).toBe('2028-02-29'); // leap year
    expect(monthsBefore('2026-05-31', 1)).toBe('2026-04-30');
  });
});

describe('reflect: longestStreakOf', () => {
  it('returns 0 for empty, 1 for a lone day', () => {
    expect(longestStreakOf([])).toBe(0);
    expect(longestStreakOf(['2026-03-05'])).toBe(1);
  });
  it('finds the longest consecutive run, ignoring gaps, order, and duplicates', () => {
    // runs: [01,02,03] len 3, then gap, [06,07] len 2
    expect(longestStreakOf(['2026-03-07', '2026-03-02', '2026-03-01', '2026-03-03', '2026-03-06', '2026-03-02'])).toBe(3);
  });
  it('counts a run that crosses a month boundary', () => {
    expect(longestStreakOf(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])).toBe(4);
  });
});

describe('reflect: computeReflection — aggregation', () => {
  const dayRows: DayRow[] = [
    day('2026-02-28', { costUsd: 5, totalTokens: 500 }),   // before window — excluded
    day('2026-03-01', { costUsd: 1, totalTokens: 100, inputTokens: 100 }),
    day('2026-03-02', { costUsd: 3, totalTokens: 300, cacheReadTokens: 300 }), // busiest
    day('2026-03-03', { costUsd: 0, totalTokens: 0 }),     // inactive gap
    day('2026-03-04', { costUsd: 2, totalTokens: 200, inputTokens: 100 }),
    day('2026-03-06', { costUsd: 9, totalTokens: 900 }),   // after window — excluded
  ];
  const modelRows: ModelRow[] = [
    mr('claude-opus-4-8', '2026-03-01', { costUsd: 4, totalTokens: 100 }),
    mr('claude-opus-4-8', '2026-03-02', { costUsd: 1, totalTokens: 200 }),
    mr('claude-haiku-4-5', '2026-03-02', { costUsd: 1, totalTokens: 300 }),
    mr('claude-sonnet-5', '2026-03-04', { costUsd: 0, totalTokens: 0 }),   // zero — filtered
    mr('claude-opus-4-8', '2026-03-06', { costUsd: 9, totalTokens: 900 }), // after window — excluded
  ];
  const r = computeReflection(dayRows, modelRows, '2026-03-01', '2026-03-05');

  it('sums only rows inside the window', () => {
    expect(r.totals.costUsd).toBe(6);       // 1+3+0+2, not 02-28 or 03-06
    expect(r.totals.totalTokens).toBe(600);
    expect(r.totals.activeDays).toBe(3);     // 01,02,04 (03 has 0 tokens)
    expect(r.period.spanDays).toBe(5);
  });
  it('picks the highest-cost active day as busiest', () => {
    expect(r.busiestDay).toEqual({ day: '2026-03-02', costUsd: 3, totalTokens: 300 });
  });
  it('ranks models by cost with correct shares, dropping zero-usage models', () => {
    expect(r.topModels.map((m) => m.model)).toEqual(['claude-opus-4-8', 'claude-haiku-4-5']);
    expect(r.topModels[0].costUsd).toBe(5);              // 4+1
    expect(r.topModels[0].pct).toBeCloseTo(5 / 6, 6);    // share of total cost
    expect(r.topModels.find((m) => m.model === 'claude-sonnet-5')).toBeUndefined();
  });
  it('computes the longest active-day streak (01→02 consecutive, 04 isolated → 2)', () => {
    expect(r.longestStreak).toBe(2);
  });
  it('computes cache read share over the input side', () => {
    // inputSide = input(200) + cacheWrite(0) + cacheRead(300) = 500; read/side = 0.6
    expect(r.cacheReadPct).toBeCloseTo(0.6, 6);
  });
  it('computes average cost per active day', () => {
    expect(r.avgCostPerActiveDay).toBeCloseTo(6 / 3, 6);
  });
});

describe('reflect: computeReflection — trend', () => {
  const rows = (firstHalf: number, secondHalf: number): DayRow[] => [
    day('2026-01-02', { costUsd: firstHalf, totalTokens: 10 }), // spanDays 2 <= 5 → first half
    day('2026-01-09', { costUsd: secondHalf, totalTokens: 10 }), // spanDays 9 > 5 → second half
  ];
  it('reads rising spend as up, falling as down', () => {
    expect(computeReflection(rows(1, 4), [], '2026-01-01', '2026-01-10').trend.direction).toBe('up');
    expect(computeReflection(rows(4, 1), [], '2026-01-01', '2026-01-10').trend.direction).toBe('down');
  });
  it('reads a small change (<5%) as flat', () => {
    expect(computeReflection(rows(100, 103), [], '2026-01-01', '2026-01-10').trend.direction).toBe('flat');
  });
});

describe('reflect: peakHourOf', () => {
  it('returns null for an empty or all-zero histogram', () => {
    expect(peakHourOf([])).toBeNull();
    expect(peakHourOf(new Array(24).fill(0))).toBeNull();
  });
  it('returns the argmax, choosing the earliest hour on a tie', () => {
    const h = new Array(24).fill(0);
    h[3] = 2; h[7] = 2; // tie → earliest
    expect(peakHourOf(h)).toEqual({ hour: 3, value: 2 });
  });
});

describe('reflect: detectSpikeDays', () => {
  const d = (day: string, costUsd: number) => ({ day, costUsd });
  it('flags a day well above the median and reports its ratio', () => {
    // median of [10,10,10,10,50] active costs is 10; 50 is 5× → spike
    const out = detectSpikeDays([d('d1', 10), d('d2', 10), d('d3', 10), d('d4', 10), d('d5', 50)]);
    expect(out).toEqual([{ day: 'd5', costUsd: 50, ratioToMedian: 5 }]);
  });
  it('flags nothing when spend is uniform', () => {
    expect(detectSpikeDays([d('a', 12), d('b', 11), d('c', 13), d('d', 12)])).toEqual([]);
  });
  it('uses the median so a spike does not inflate the baseline (two spikes both caught)', () => {
    // costs sorted [5,5,5,50,60] → median 5; 50 and 60 are 10×/12× → both spikes, cost desc
    const out = detectSpikeDays([d('a', 5), d('b', 5), d('c', 5), d('big', 50), d('huge', 60)]);
    expect(out.map((s) => s.day)).toEqual(['huge', 'big']);
  });
  it('respects the absolute floor (trivially cheap days never spike)', () => {
    // 0.10 is 5× the 0.02 median but below the $0.50 floor → not a spike
    expect(detectSpikeDays([d('a', 0.02), d('b', 0.02), d('c', 0.02), d('d', 0.10)])).toEqual([]);
  });
  it('needs at least 3 active days for a meaningful median', () => {
    expect(detectSpikeDays([d('a', 1), d('b', 100)])).toEqual([]);
  });
  it('ignores zero-cost days when computing the median', () => {
    // only [10,10,10,40] are active; median 10; 40 is 4× → spike
    const out = detectSpikeDays([d('z', 0), d('a', 10), d('b', 10), d('c', 10), d('d', 40)]);
    expect(out.map((s) => s.day)).toEqual(['d']);
  });
  it('honours a custom minRatio', () => {
    expect(detectSpikeDays([d('a', 10), d('b', 10), d('c', 10), d('d', 25)], { minRatio: 3 })).toEqual([]);
    expect(detectSpikeDays([d('a', 10), d('b', 10), d('c', 10), d('d', 25)], { minRatio: 2 }).map((s) => s.day)).toEqual(['d']);
  });
});

describe('reflect: hourSparkline', () => {
  const BLOCKS = ' ▁▂▃▄▅▆▇█';
  it('renders all-blank for an all-zero series, preserving length', () => {
    expect(hourSparkline([0, 0, 0])).toBe('   ');
    expect(hourSparkline(new Array(24).fill(0))).toBe(' '.repeat(24));
  });
  it('maps the max to █ and leaves a lone peak surrounded by blanks', () => {
    const h = new Array(24).fill(0);
    h[5] = 10;
    const s = hourSparkline(h);
    expect(s.length).toBe(24);
    expect(s[5]).toBe('█');
    expect(s[4]).toBe(' ');
  });
  it('scales the smallest non-zero to ▁ and is monotonic with value', () => {
    const s = hourSparkline([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s[0]).toBe(' ');
    expect(s[1]).toBe('▁');
    expect(s[8]).toBe('█');
    for (let i = 2; i < s.length; i++) {
      expect(BLOCKS.indexOf(s[i])).toBeGreaterThanOrEqual(BLOCKS.indexOf(s[i - 1]));
    }
  });
});

describe('reflect: computeReflection — projects + hours (phase 2)', () => {
  it('ranks projects by windowed cost (ModelShare.model carries the project path)', () => {
    const dayRows: DayRow[] = [day('2026-03-01', { costUsd: 6, totalTokens: 600 })];
    const projectRows: ModelRow[] = [
      mr('/repo/alpha', '2026-03-01', { costUsd: 4, totalTokens: 100 }),
      mr('/repo/beta', '2026-03-01', { costUsd: 2, totalTokens: 100 }),
      mr('/repo/alpha', '2026-02-01', { costUsd: 9, totalTokens: 100 }), // out of window — excluded
      mr('/repo/gamma', '2026-03-01', { costUsd: 0, totalTokens: 0 }),   // zero — filtered
    ];
    const r = computeReflection(dayRows, [], '2026-03-01', '2026-03-05', {}, projectRows);
    expect(r.topProjects.map((p) => p.model)).toEqual(['/repo/alpha', '/repo/beta']);
    expect(r.topProjects[0].costUsd).toBe(4); // 02-01 not counted
    expect(r.topProjects[0].pct).toBeCloseTo(4 / 6, 6);
  });
  it('passes the hour histogram through and finds the peak (earliest on tie)', () => {
    const hist = new Array(24).fill(0);
    hist[9] = 3; hist[14] = 5; hist[22] = 5; // 14 & 22 tie → 14 wins
    const r = computeReflection([day('2026-03-01', { costUsd: 1, totalTokens: 1 })], [], '2026-03-01', '2026-03-05', {}, [], hist);
    expect(r.peakHour).toEqual({ hour: 14, value: 5 });
    expect(r.hourHistogram).toBe(hist);
  });
});

describe('reflect: computeReflection — edges', () => {
  it('an empty / all-out-of-window period yields zeros, null busiest, streak 0', () => {
    const r = computeReflection([day('2020-01-01', { costUsd: 9, totalTokens: 9 })], [], '2026-03-01', '2026-03-05');
    expect(r.totals.costUsd).toBe(0);
    expect(r.totals.activeDays).toBe(0);
    expect(r.busiestDay).toBeNull();
    expect(r.spikeDays).toEqual([]);
    expect(r.longestStreak).toBe(0);
    expect(r.topModels).toEqual([]);
    expect(r.topProjects).toEqual([]);
    expect(r.peakHour).toBeNull();
    expect(r.avgCostPerActiveDay).toBe(0);
    expect(r.cacheReadPct).toBe(0);
  });
  it('respects the topModels cap', () => {
    const models: ModelRow[] = ['a', 'b', 'c', 'd'].map((m, i) => mr(m, '2026-03-01', { costUsd: 4 - i, totalTokens: 1 }));
    const r = computeReflection([day('2026-03-01', { costUsd: 10, totalTokens: 1 })], models, '2026-03-01', '2026-03-05', { topModels: 2 });
    expect(r.topModels.map((m) => m.model)).toEqual(['a', 'b']);
  });
  it('rejects malformed or reversed bounds', () => {
    expect(() => computeReflection([], [], 'nope', '2026-03-05')).toThrow(/bad period/);
    expect(() => computeReflection([], [], '2026-03-05', '2026-03-01')).toThrow(/reversed/);
  });
});
