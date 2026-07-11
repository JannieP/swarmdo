/**
 * spend-forecast.ts — project month-end Claude Code spend from month-to-date
 * burn, for budgeting ("on pace for ~$420 this month").
 *
 * The quota forecaster (limits.ts) answers "will I hit the rolling cap"; this
 * answers "what will the calendar month cost at the current daily average".
 * Pure + deterministic: month-to-date total, the day-of-month, and the days in
 * the month are passed in, so it's unit-tested without a clock.
 */

export interface SpendProjection {
  monthToDateUsd: number;
  dayOfMonth: number;
  daysInMonth: number;
  /** month-to-date / day-of-month */
  dailyAverageUsd: number;
  /** dailyAverage × daysInMonth — projected month-end total */
  projectedUsd: number;
  /** projectedUsd − monthToDateUsd — the remaining projected spend */
  remainingUsd: number;
}

/** Days in the calendar month of an ISO `YYYY-MM` (or `YYYY-MM-DD`). Pure. */
export function daysInMonthOf(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return NaN;
  return new Date(y, m, 0).getDate(); // day 0 of the next month = last day of this one
}

/**
 * Project month-end spend at the current daily average. `dayOfMonth` is how many
 * days (inclusive of today) have accrued the month-to-date total. Pure.
 */
export function projectMonthEnd(monthToDateUsd: number, dayOfMonth: number, daysInMonth: number): SpendProjection {
  const dailyAverageUsd = dayOfMonth > 0 ? monthToDateUsd / dayOfMonth : 0;
  const projectedUsd = dailyAverageUsd * daysInMonth;
  return {
    monthToDateUsd,
    dayOfMonth,
    daysInMonth,
    dailyAverageUsd,
    projectedUsd,
    remainingUsd: Math.max(0, projectedUsd - monthToDateUsd),
  };
}
