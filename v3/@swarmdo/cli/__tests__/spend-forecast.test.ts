import { describe, it, expect } from 'vitest';
import { daysInMonthOf, projectMonthEnd } from '../src/usage/spend-forecast.ts';

describe('spend-forecast: daysInMonthOf', () => {
  it('returns the calendar length of the month', () => {
    expect(daysInMonthOf('2026-01')).toBe(31);
    expect(daysInMonthOf('2026-04')).toBe(30);
    expect(daysInMonthOf('2026-02')).toBe(28);      // 2026 not a leap year
    expect(daysInMonthOf('2028-02')).toBe(29);      // 2028 is a leap year
    expect(daysInMonthOf('2026-07-11')).toBe(31);   // tolerates YYYY-MM-DD
  });
  it('returns NaN for a malformed month', () => {
    expect(daysInMonthOf('nope')).toBeNaN();
    expect(daysInMonthOf('2026-13')).toBeNaN();
  });
});

describe('spend-forecast: projectMonthEnd', () => {
  it('projects at the running daily average', () => {
    const p = projectMonthEnd(150, 15, 30);
    expect(p.dailyAverageUsd).toBe(10);
    expect(p.projectedUsd).toBe(300);
    expect(p.remainingUsd).toBe(150);
  });
  it('on day 1 projects the whole month at the first day rate', () => {
    const p = projectMonthEnd(12, 1, 31);
    expect(p.dailyAverageUsd).toBe(12);
    expect(p.projectedUsd).toBe(372);
  });
  it('on the last day the projection equals month-to-date (nothing remaining)', () => {
    const p = projectMonthEnd(400, 30, 30);
    expect(p.projectedUsd).toBeCloseTo(400, 6);
    expect(p.remainingUsd).toBe(0);
  });
  it('never returns negative remaining (spend already above the linear projection)', () => {
    // front-loaded month: heavy early spend, later days cheaper — projection can
    // dip below month-to-date, but remaining is clamped to 0.
    const p = projectMonthEnd(500, 28, 30);
    expect(p.projectedUsd).toBeCloseTo((500 / 28) * 30, 6);
    expect(p.remainingUsd).toBeGreaterThanOrEqual(0);
  });
  it('guards day-of-month 0 (no div-by-zero)', () => {
    expect(projectMonthEnd(0, 0, 31)).toMatchObject({ dailyAverageUsd: 0, projectedUsd: 0, remainingUsd: 0 });
  });
});
