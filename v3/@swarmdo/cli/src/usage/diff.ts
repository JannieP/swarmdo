/**
 * diff.ts — compare Claude Code spend between two periods.
 *
 * The usage views show single windows; this is the compare layer: this week
 * vs last, today vs yesterday, or any two explicit date ranges — totals,
 * deltas, and the per-model movers. Pure: everything computes over the
 * existing per-day aggregation rows, so tests need no transcripts.
 */

export interface DayTotals {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface DayRow {
  /** YYYY-MM-DD (local) */
  key: string;
  totals: DayTotals;
}

export interface ModelRow {
  key: string;
  day: string;
  totals: DayTotals;
}

export interface Period {
  /** inclusive YYYY-MM-DD bounds */
  from: string;
  to: string;
  label: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return fmtLocal(dt);
}

/** Built-in period pairs. `now` is a local YYYY-MM-DD anchor (injected). */
export function resolvePeriodPair(kind: string, today: string): { a: Period; b: Period } {
  if (!DATE.test(today)) throw new Error(`bad anchor date: ${today}`);
  switch (kind) {
    case 'day':
      return {
        a: { from: today, to: today, label: 'today' },
        b: { from: shiftDays(today, -1), to: shiftDays(today, -1), label: 'yesterday' },
      };
    case 'week':
      return {
        a: { from: shiftDays(today, -6), to: today, label: 'last 7 days' },
        b: { from: shiftDays(today, -13), to: shiftDays(today, -7), label: 'prior 7 days' },
      };
    case 'month': {
      const [y, m] = today.split('-').map(Number);
      const thisFrom = `${today.slice(0, 7)}-01`;
      const prev = new Date(y, m - 2, 1);
      const prevFrom = fmtLocal(prev);
      const prevTo = fmtLocal(new Date(y, m - 1, 0)); // last day of previous month
      return {
        a: { from: thisFrom, to: today, label: today.slice(0, 7) },
        b: { from: prevFrom, to: prevTo, label: prevFrom.slice(0, 7) },
      };
    }
    default:
      throw new Error(`unknown period kind "${kind}" (expected day|week|month)`);
  }
}

/** Parse an explicit "YYYY-MM-DD:YYYY-MM-DD" range. */
export function parseRange(raw: string, label?: string): Period {
  const [from, to] = String(raw).split(':');
  if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) {
    throw new Error(`bad range "${raw}" (expected YYYY-MM-DD:YYYY-MM-DD)`);
  }
  if (from > to) throw new Error(`range "${raw}" is reversed (from > to)`);
  return { from, to, label: label ?? `${from}..${to}` };
}

const ZERO: DayTotals = { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };

function addTotals(a: DayTotals, b: DayTotals): DayTotals {
  return {
    costUsd: a.costUsd + b.costUsd,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** Sum day rows falling inside a period (inclusive bounds, string compare). */
export function sumPeriod(rows: DayRow[], p: Period): DayTotals {
  return rows.filter((r) => r.key >= p.from && r.key <= p.to).reduce((acc, r) => addTotals(acc, r.totals), { ...ZERO });
}

export interface MetricDelta {
  a: number;
  b: number;
  delta: number;
  /** delta / b; null when b === 0 (renders as "new") */
  pct: number | null;
}

export function metricDelta(a: number, b: number): MetricDelta {
  return { a, b, delta: a - b, pct: b === 0 ? (a === 0 ? 0 : null) : (a - b) / b };
}

export interface DiffReport {
  a: Period;
  b: Period;
  cost: MetricDelta;
  totalTokens: MetricDelta;
  inputTokens: MetricDelta;
  outputTokens: MetricDelta;
  cacheReadTokens: MetricDelta;
  activeDays: MetricDelta;
}

export function diffPeriods(rows: DayRow[], a: Period, b: Period): DiffReport {
  const ta = sumPeriod(rows, a);
  const tb = sumPeriod(rows, b);
  const daysIn = (p: Period): number => rows.filter((r) => r.key >= p.from && r.key <= p.to && r.totals.totalTokens > 0).length;
  return {
    a, b,
    cost: metricDelta(ta.costUsd, tb.costUsd),
    totalTokens: metricDelta(ta.totalTokens, tb.totalTokens),
    inputTokens: metricDelta(ta.inputTokens, tb.inputTokens),
    outputTokens: metricDelta(ta.outputTokens, tb.outputTokens),
    cacheReadTokens: metricDelta(ta.cacheReadTokens, tb.cacheReadTokens),
    activeDays: metricDelta(daysIn(a), daysIn(b)),
  };
}

export interface ModelMover {
  model: string;
  cost: MetricDelta;
}

/** Per-model cost deltas sorted by |delta| desc. `modelDayRows` carries one
 * row per (model, day) — the shape aggregateUsage(events,'model-day') style
 * callers flatten to. */
export function modelMovers(modelDayRows: ModelRow[], a: Period, b: Period, limit = 8): ModelMover[] {
  const per = new Map<string, { a: number; b: number }>();
  for (const r of modelDayRows) {
    const slot = per.get(r.key) ?? { a: 0, b: 0 };
    if (r.day >= a.from && r.day <= a.to) slot.a += r.totals.costUsd;
    if (r.day >= b.from && r.day <= b.to) slot.b += r.totals.costUsd;
    per.set(r.key, slot);
  }
  return [...per.entries()]
    .map(([model, v]) => ({ model, cost: metricDelta(v.a, v.b) }))
    .filter((m) => m.cost.a !== 0 || m.cost.b !== 0)
    .sort((x, y) => Math.abs(y.cost.delta) - Math.abs(x.cost.delta))
    .slice(0, limit);
}
