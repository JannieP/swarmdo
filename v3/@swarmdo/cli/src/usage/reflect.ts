/**
 * reflect.ts — a "wrapped"-style retrospective over Claude Code usage.
 *
 * Anthropic's Reflect (2026-07-09) summarizes claude.ai *chats*; it doesn't
 * touch Claude Code terminal work. swarmdo already parses the local transcripts
 * for `usage daily/monthly/blocks/errors/cache`, so this is the retrospective
 * layer on top: fold the existing per-day and per-(model,day) aggregation rows
 * into headline stats — totals, the busiest day, the top models, the longest
 * active-day streak, the cost trend, and cache efficiency.
 *
 * Pure + deterministic: it takes already-aggregated rows (no transcripts, no
 * clock — the period bounds are passed in), so the whole thing is unit-tested
 * without touching disk. The command layer in ../commands/usage.ts feeds it the
 * rows the parser already produces. See #47.
 */

import type { DayRow, ModelRow } from './diff.js';

export interface ModelShare {
  model: string;
  costUsd: number;
  totalTokens: number;
  /** share of total cost, 0..1 (0 when the period cost is 0) */
  pct: number;
}

export interface ReflectionTotals {
  costUsd: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  entries: number;
  /** days in [from,to] with any token activity */
  activeDays: number;
}

export interface Reflection {
  period: { from: string; to: string; /** inclusive calendar span in days */ spanDays: number };
  totals: ReflectionTotals;
  /** highest-cost active day in the period, or null if the period is empty */
  busiestDay: { day: string; costUsd: number; totalTokens: number } | null;
  /** models ranked by cost desc (capped to opts.topModels) */
  topModels: ModelShare[];
  /** projects ranked by cost desc (ModelShare.model holds the project path) */
  topProjects: ModelShare[];
  /** busiest local hour-of-day by cost (0..23), or null if no activity */
  peakHour: { hour: number; value: number } | null;
  /** cost per local hour-of-day, as supplied by the caller (length 24 when set) */
  hourHistogram: number[];
  /** longest run of consecutive active calendar days */
  longestStreak: number;
  /** cacheRead / (input + cacheWrite + cacheRead), 0..1 */
  cacheReadPct: number;
  /** total cost / active days (0 when no active days) */
  avgCostPerActiveDay: number;
  /** first-half vs second-half spend across the period */
  trend: { firstHalfCost: number; secondHalfCost: number; direction: 'up' | 'down' | 'flat' };
}

export interface ReflectOptions {
  /** how many models to keep in topModels (default 5) */
  topModels?: number;
  /** relative change below which the trend reads 'flat' (default 0.05 = 5%) */
  flatThreshold?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day after an ISO date (handles month/year rollover). Pure. */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * The ISO date `n` whole months before `iso`, clamping the day to the target
 * month's length so "Mar 31 − 1 month" is Feb 28/29 (not a rolled-over Mar 3).
 * Pure. Used to derive a `--period 1m|3m|…` window start from today.
 */
export function monthsBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const monthIndex = m - 1 - n; // may be negative — Date normalizes the year
  const lastDay = new Date(y, monthIndex + 1, 0).getDate();
  const dt = new Date(y, monthIndex, Math.min(d, lastDay));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive whole-day span between two ISO dates (from <= to). Pure. */
export function spanDays(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Longest run of consecutive calendar days present in the set. Pure. */
export function longestStreakOf(days: string[]): number {
  const uniq = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of uniq) {
    run = prev !== null && nextDay(prev) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

const within = (key: string, from: string, to: string): boolean => key >= from && key <= to;

/** Window + aggregate `{key, day, totals}` rows into cost-ranked shares. Pure.
 * Reused for both models and projects (ModelShare.model carries whichever key). */
export function rankShares(rows: ModelRow[], from: string, to: string, totalCost: number, topN: number): ModelShare[] {
  const per = new Map<string, { costUsd: number; totalTokens: number }>();
  for (const r of rows) {
    if (!within(r.day, from, to)) continue;
    const slot = per.get(r.key) ?? { costUsd: 0, totalTokens: 0 };
    slot.costUsd += r.totals.costUsd;
    slot.totalTokens += r.totals.totalTokens;
    per.set(r.key, slot);
  }
  return [...per.entries()]
    .map(([key, v]) => ({ model: key, costUsd: v.costUsd, totalTokens: v.totalTokens, pct: totalCost > 0 ? v.costUsd / totalCost : 0 }))
    .filter((m) => m.costUsd > 0 || m.totalTokens > 0)
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || (a.model < b.model ? -1 : 1))
    .slice(0, topN);
}

/** Busiest bucket in a per-hour cost histogram (argmax; earliest hour wins ties),
 * or null when every bucket is empty. Pure. */
export function peakHourOf(hourHistogram: number[]): { hour: number; value: number } | null {
  let best = -1;
  let bestVal = 0;
  for (let h = 0; h < hourHistogram.length; h++) {
    if (hourHistogram[h] > bestVal) { bestVal = hourHistogram[h]; best = h; }
  }
  return best < 0 ? null : { hour: best, value: bestVal };
}

/** Fold pre-aggregated usage rows into a retrospective. Pure. */
export function computeReflection(
  dayRows: DayRow[],
  modelRows: ModelRow[],
  from: string,
  to: string,
  opts: ReflectOptions = {},
  projectRows: ModelRow[] = [],
  hourHistogram: number[] = [],
): Reflection {
  if (!DATE.test(from) || !DATE.test(to)) throw new Error(`bad period bounds: ${from}..${to}`);
  if (from > to) throw new Error(`period "${from}..${to}" is reversed (from > to)`);
  const topN = opts.topModels ?? 5;
  const flat = opts.flatThreshold ?? 0.05;

  const days = dayRows.filter((r) => within(r.key, from, to));
  const totals: ReflectionTotals = {
    costUsd: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, entries: 0, activeDays: 0,
  };
  let busiestDay: Reflection['busiestDay'] = null;
  const activeDayKeys: string[] = [];
  const mid = spanDays(from, to) / 2;
  let firstHalfCost = 0;
  let secondHalfCost = 0;

  for (const r of days) {
    const t = r.totals;
    totals.costUsd += t.costUsd;
    totals.totalTokens += t.totalTokens;
    totals.inputTokens += t.inputTokens;
    totals.outputTokens += t.outputTokens;
    totals.cacheReadTokens += t.cacheReadTokens;
    totals.cacheWriteTokens += t.cacheWriteTokens;
    if (t.totalTokens > 0) {
      totals.activeDays += 1;
      activeDayKeys.push(r.key);
    }
    if (!busiestDay || t.costUsd > busiestDay.costUsd) {
      busiestDay = { day: r.key, costUsd: t.costUsd, totalTokens: t.totalTokens };
    }
    // Trend: which half of the period does this day fall in?
    if (spanDays(from, r.key) <= mid) firstHalfCost += t.costUsd;
    else secondHalfCost += t.costUsd;
  }
  // A period with zero active days has no meaningful busiest day.
  if (totals.activeDays === 0) busiestDay = null;

  // Cost-ranked shares over the same window, for both models and projects.
  const topModels = rankShares(modelRows, from, to, totals.costUsd, topN);
  const topProjects = rankShares(projectRows, from, to, totals.costUsd, topN);

  const inputSide = totals.inputTokens + totals.cacheWriteTokens + totals.cacheReadTokens;
  const relChange = firstHalfCost > 0 ? (secondHalfCost - firstHalfCost) / firstHalfCost : (secondHalfCost > 0 ? 1 : 0);
  const direction: 'up' | 'down' | 'flat' = Math.abs(relChange) < flat ? 'flat' : relChange > 0 ? 'up' : 'down';

  return {
    period: { from, to, spanDays: spanDays(from, to) },
    totals,
    busiestDay,
    topModels,
    topProjects,
    peakHour: peakHourOf(hourHistogram),
    hourHistogram,
    longestStreak: longestStreakOf(activeDayKeys),
    cacheReadPct: inputSide > 0 ? totals.cacheReadTokens / inputSide : 0,
    avgCostPerActiveDay: totals.activeDays > 0 ? totals.costUsd / totals.activeDays : 0,
    trend: { firstHalfCost, secondHalfCost, direction },
  };
}
