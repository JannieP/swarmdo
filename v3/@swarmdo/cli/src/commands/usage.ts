/**
 * V3 CLI Usage Command
 *
 * `swarmdo usage [daily|monthly|models|projects|sessions]` — token & dollar
 * analytics for every Claude Code session on this machine, read from the
 * local transcript JSONL files (`~/.claude/projects/**`). The statusline
 * already shows the LIVE session's cost; this is the historical view across
 * sessions, projects and models — the capability ccusage (MIT © ryoppippi)
 * proved demand for, implemented natively against swarmdo conventions.
 *
 * Costs prefer the transcript's own `costUSD` field, then fall back to the
 * price table in ../usage/claude-pricing.ts. Models with no published price
 * are listed as unpriced and contribute $0 — never a guessed number.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  aggregateBlocks,
  aggregateUsage,
  collectUsage,
  totalUsage,
  localDateKey,
  type UsageBlock,
  type UsageCollection,
  type UsageDimension,
  type UsageTotals,
} from '../usage/transcript-usage.js';
import { collectToolErrors, delegationFromReport, type ToolErrorReport } from '../usage/transcript-errors.js';
import { computeCacheStats, type CacheStats } from '../usage/cache-stats.js';
import { evaluateGuard, type GuardThreshold, type GuardStatus } from '../usage/spend-guard.js';
import { resolvePeriodPair, parseRange, diffPeriods, modelMovers, type DayRow, type ModelRow, type Period, type MetricDelta } from '../usage/diff.js';
import { computeReflection, monthsBefore, hourSparkline, type Reflection } from '../usage/reflect.js';
import { renderReflectionHtml } from '../usage/reflect-html.js';
import { forecastWindow, parseRateLimits, worstStatus, formatForecast, formatLimitSegment } from '../usage/limits.js';
import { readFileSync } from 'node:fs';
import { toCsv } from '../util/csv.js';
import { projectMonthEnd, daysInMonthOf } from '../usage/spend-forecast.js';

const VIEWS: Record<string, { dimension: UsageDimension; label: string }> = {
  daily: { dimension: 'day', label: 'Date' },
  monthly: { dimension: 'month', label: 'Month' },
  models: { dimension: 'model', label: 'Model' },
  projects: { dimension: 'project', label: 'Project' },
  sessions: { dimension: 'session', label: 'Session' },
};

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCost(v: number): string {
  if (v === 0) return '$0.00';
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

/** Long cwd-style keys read better as a …-shortened tail. */
function shortenKey(key: string, max = 44): string {
  if (key.length <= max) return key;
  return `…${key.slice(key.length - (max - 1))}`;
}

function toRow(key: string, t: UsageTotals): Record<string, string> {
  return {
    label: shortenKey(key),
    input: fmtInt(t.inputTokens),
    output: fmtInt(t.outputTokens),
    cacheWrite: fmtInt(t.cacheWriteTokens),
    cacheRead: fmtInt(t.cacheReadTokens),
    total: fmtInt(t.totalTokens),
    cost: fmtCost(t.costUsd),
  };
}

function renderTable(label: string, rows: Array<{ key: string; totals: UsageTotals }>, grand: UsageTotals): void {
  output.printTable({
    columns: [
      { key: 'label', header: label, align: 'left' },
      { key: 'input', header: 'Input', align: 'right' },
      { key: 'output', header: 'Output', align: 'right' },
      { key: 'cacheWrite', header: 'Cache W', align: 'right' },
      { key: 'cacheRead', header: 'Cache R', align: 'right' },
      { key: 'total', header: 'Total', align: 'right' },
      { key: 'cost', header: 'Cost', align: 'right' },
    ],
    data: [
      ...rows.map((r) => toRow(r.key, r.totals)),
      toRow('TOTAL', grand),
    ],
  });
}

function jsonPayload(
  view: string,
  collection: UsageCollection,
  rows: Array<{ key: string; totals: UsageTotals }>,
  grand: UsageTotals,
  since?: string,
  until?: string,
): Record<string, unknown> {
  return {
    view,
    since: since ?? null,
    until: until ?? null,
    rows: rows.map((r) => ({ key: r.key, ...r.totals })),
    totals: grand,
    filesScanned: collection.filesScanned,
    dirsScanned: collection.dirsScanned,
    unpricedModels: collection.unpricedModels,
    ...unpricedStats(collection.events),
  };
}

/**
 * Responses billed as $0 because their model has no price-table entry (e.g. the
 * Claude 5 tier until Anthropic publishes rates). Surfacing the count/token size
 * lets the report show how big the cost blind-spot is, not just name the models.
 */
function unpricedStats(events: UsageCollection['events']): { unpricedResponses: number; unpricedTokens: number } {
  let unpricedResponses = 0;
  let unpricedTokens = 0;
  for (const e of events) {
    if (e.costSource === 'unpriced') {
      unpricedResponses++;
      unpricedTokens += e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens;
    }
  }
  return { unpricedResponses, unpricedTokens };
}

function fmtClock(ms: number): string {
  // hourCycle h23: hour12:false alone renders midnight as "24:00:00" on some ICU builds
  return new Date(ms).toLocaleString('en-CA', { hourCycle: 'h23' }).replace(',', '');
}

/** Blocks view — 5-hour subscription rate-limit windows with live burn. */
function runBlocksView(ctx: CommandContext, collection: UsageCollection): CommandResult {
  const nowMs = Date.now();
  const blocks = aggregateBlocks(collection.events, { nowMs });
  const shown = blocks.slice(-12); // recent windows; --json carries all

  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify({
      view: 'blocks',
      blockHours: 5,
      rows: blocks.map((b: UsageBlock) => ({
        start: new Date(b.startMs).toISOString(),
        end: new Date(b.endMs).toISOString(),
        active: b.active,
        ...b.totals,
      })),
      unpricedModels: collection.unpricedModels,
      ...unpricedStats(collection.events),
    }, null, 2));
    return { success: true, exitCode: 0 };
  }

  output.writeln(output.bold('Claude Code usage — 5-hour billing blocks'));
  output.printTable({
    columns: [
      { key: 'window', header: 'Block (local)', align: 'left' },
      { key: 'input', header: 'Input', align: 'right' },
      { key: 'output', header: 'Output', align: 'right' },
      { key: 'total', header: 'Total', align: 'right' },
      { key: 'cost', header: 'Cost', align: 'right' },
      { key: 'state', header: '', align: 'left' },
    ],
    data: shown.map((b) => ({
      window: `${fmtClock(b.startMs)} → ${fmtClock(b.endMs).slice(-8)}`,
      input: fmtInt(b.totals.inputTokens),
      output: fmtInt(b.totals.outputTokens),
      total: fmtInt(b.totals.totalTokens),
      cost: fmtCost(b.totals.costUsd),
      state: b.active ? 'ACTIVE' : '',
    })),
  });

  const active = blocks.find((b) => b.active);
  if (active) {
    const elapsedH = (nowMs - active.startMs) / 3_600_000;
    const remainingMin = Math.max(0, Math.round((active.endMs - nowMs) / 60_000));
    const burnPerHour = elapsedH > 0 ? active.totals.costUsd / elapsedH : 0;
    const projected = active.totals.costUsd + burnPerHour * (remainingMin / 60);
    output.writeln(
      output.dim(
        `active block: ${remainingMin} min remaining · burn ${fmtCost(burnPerHour)}/h · projected block total ${fmtCost(projected)}`,
      ),
    );
  } else {
    output.writeln(output.dim('no active block — next activity starts a fresh 5-hour window'));
  }
  if (blocks.length > shown.length) {
    output.writeln(output.dim(`showing last ${shown.length} of ${blocks.length} blocks (use --json for all)`));
  }
  return { success: true, exitCode: 0 };
}

/** Errors view — per-tool failure rates + the most common failure messages,
 * from the same transcripts (sniffly-style). Complements cost analytics. */
function runErrorsView(ctx: CommandContext, report: ToolErrorReport): CommandResult {
  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify(report, null, 2));
    return { success: true, exitCode: 0 };
  }
  output.writeln(output.bold('Claude Code usage — tool errors'));
  if (report.totalCalls === 0) {
    output.writeln(output.info(`no tool calls found in ${report.filesScanned} transcript files`));
    return { success: true, exitCode: 0 };
  }
  output.printTable({
    columns: [
      { key: 'tool', header: 'Tool', width: 22 },
      { key: 'calls', header: 'Calls', width: 12 },
      { key: 'errors', header: 'Errors', width: 12 },
      { key: 'rate', header: 'Err %', width: 8 },
    ],
    data: report.tools.slice(0, 20).map((t) => ({
      tool: t.tool,
      calls: fmtInt(t.calls),
      errors: t.errors ? fmtInt(t.errors) : '—',
      rate: t.errors ? `${(t.errorRate * 100).toFixed(1)}%` : '—',
    })),
  });
  const rate = report.totalCalls > 0 ? (report.totalErrors / report.totalCalls) * 100 : 0;
  output.writeln(
    output.dim(
      `${report.filesScanned} files · ${fmtInt(report.totalCalls)} tool calls · ${fmtInt(report.totalErrors)} errors (${rate.toFixed(1)}%) · ${report.sessionsWithErrors} session(s) with errors`,
    ),
  );
  if (report.topErrors.length > 0) {
    output.writeln();
    output.writeln(output.bold('Most common failures'));
    for (const e of report.topErrors) {
      output.writeln(`  ${output.dim(`×${e.count}`)} ${output.dim(`[${e.tool}]`)} ${e.signature}`);
    }
  }
  return { success: true, exitCode: 0 };
}

/** Cache view — prompt-cache efficiency + $ saved by caching (the #1 cost lever). */
function runCacheView(ctx: CommandContext, collection: UsageCollection): CommandResult {
  const stats: CacheStats = computeCacheStats(aggregateUsage(collection.events, 'model'));
  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify(stats, null, 2));
    return { success: true, exitCode: 0 };
  }
  output.writeln(output.bold('Claude Code usage — prompt cache efficiency'));
  if (stats.totalInputSide === 0) {
    output.writeln(output.info('no input tokens found in transcripts'));
    return { success: true, exitCode: 0 };
  }
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  output.printTable({
    columns: [
      { key: 'model', header: 'Model', width: 22 },
      { key: 'fresh', header: 'Fresh In', width: 12, align: 'right' },
      { key: 'write', header: 'Cache W', width: 12, align: 'right' },
      { key: 'read', header: 'Cache R', width: 12, align: 'right' },
      { key: 'hit', header: 'From cache', width: 11, align: 'right' },
      { key: 'saved', header: 'Saved', width: 10, align: 'right' },
    ],
    data: stats.rows.map((r) => ({
      model: shortenKey(r.model, 22),
      fresh: fmtInt(r.freshInput),
      write: fmtInt(r.cacheWrite),
      read: fmtInt(r.cacheRead),
      hit: pct(r.cacheReadPct),
      saved: r.savingsUsd === null ? '—' : fmtCost(r.savingsUsd),
    })),
  });
  const bits = [`${fmtInt(stats.totalInputSide)} input tokens`, `${pct(stats.overallCacheReadPct)} served from cache`];
  if (stats.hasPricedSavings) bits.push(`~${fmtCost(stats.totalSavingsUsd)} saved by caching`);
  output.writeln(output.dim(bits.join(' · ')));
  if (stats.unpricedModels.length > 0) {
    output.writeln(output.dim(`savings omitted for unpriced models: ${stats.unpricedModels.join(', ')}`));
  }
  output.writeln(output.dim('"From cache" = share of input tokens served as cache reads (0.1x cost); higher is cheaper.'));
  return { success: true, exitCode: 0 };
}

/** Diff view — compare two periods (day|week|month presets or explicit
 * --a/--b YYYY-MM-DD:YYYY-MM-DD ranges): totals, deltas, per-model movers. */
function runDiffView(ctx: CommandContext, collection: UsageCollection): CommandResult {
  const kind = (ctx.args[1] || 'week').toLowerCase();
  let a: Period; let b: Period;
  try {
    if (typeof ctx.flags.a === 'string' || typeof ctx.flags.b === 'string') {
      if (typeof ctx.flags.a !== 'string' || typeof ctx.flags.b !== 'string') {
        output.printError('explicit ranges need BOTH --a and --b (YYYY-MM-DD:YYYY-MM-DD)');
        return { success: false, exitCode: 1 };
      }
      a = parseRange(ctx.flags.a, 'A');
      b = parseRange(ctx.flags.b, 'B');
    } else {
      ({ a, b } = resolvePeriodPair(kind, localDateKey(new Date())));
    }
  } catch (e) {
    output.printError((e as Error).message);
    return { success: false, exitCode: 1 };
  }

  const dayRows: DayRow[] = aggregateUsage(collection.events, 'day').map((r) => ({ key: r.key, totals: r.totals }));
  const report = diffPeriods(dayRows, a, b);

  // per-(model, day) fold for the movers table
  const md = new Map<string, ModelRow>();
  for (const e of collection.events) {
    const k = `${e.model}\u0000${e.dateKey}`;
    const row = md.get(k) ?? { key: e.model, day: e.dateKey, totals: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 } };
    row.totals.costUsd += e.costUsd;
    row.totals.totalTokens += e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens;
    md.set(k, row);
  }
  const movers = modelMovers([...md.values()], a, b);

  if (ctx.flags.json === true) {
    output.printJson({ ...report, movers });
    return { success: true, data: { ...report, movers } };
  }

  const pct = (m: MetricDelta): string => (m.pct === null ? 'new' : `${m.pct >= 0 ? '+' : ''}${Math.round(m.pct * 100)}%`);
  const sign = (n: number, f: (x: number) => string): string => `${n >= 0 ? '+' : '−'}${f(Math.abs(n))}`;
  output.writeln(output.bold(`Usage diff  ${a.label}  vs  ${b.label}`) + output.dim(`   (${a.from}..${a.to} vs ${b.from}..${b.to})`));
  output.printTable({
    columns: [
      { key: 'metric', header: 'Metric', width: 14 },
      { key: 'a', header: a.label.slice(0, 14), width: 14, align: 'right' },
      { key: 'b', header: b.label.slice(0, 14), width: 14, align: 'right' },
      { key: 'delta', header: 'Δ', width: 14, align: 'right' },
      { key: 'pct', header: '%', width: 7, align: 'right' },
    ],
    data: [
      { metric: 'Cost', a: fmtCost(report.cost.a), b: fmtCost(report.cost.b), delta: sign(report.cost.delta, fmtCost), pct: pct(report.cost) },
      { metric: 'Tokens', a: fmtInt(report.totalTokens.a), b: fmtInt(report.totalTokens.b), delta: sign(report.totalTokens.delta, fmtInt), pct: pct(report.totalTokens) },
      { metric: 'Output tok', a: fmtInt(report.outputTokens.a), b: fmtInt(report.outputTokens.b), delta: sign(report.outputTokens.delta, fmtInt), pct: pct(report.outputTokens) },
      { metric: 'Cache reads', a: fmtInt(report.cacheReadTokens.a), b: fmtInt(report.cacheReadTokens.b), delta: sign(report.cacheReadTokens.delta, fmtInt), pct: pct(report.cacheReadTokens) },
      { metric: 'Active days', a: String(report.activeDays.a), b: String(report.activeDays.b), delta: sign(report.activeDays.delta, String), pct: pct(report.activeDays) },
    ],
  });
  if (movers.length > 0) {
    output.writeln(output.bold('Model movers') + output.dim('  (by |Δ cost|)'));
    output.printTable({
      columns: [
        { key: 'model', header: 'Model', width: 34 },
        { key: 'a', header: 'A', width: 12, align: 'right' },
        { key: 'b', header: 'B', width: 12, align: 'right' },
        { key: 'delta', header: 'Δ', width: 12, align: 'right' },
        { key: 'pct', header: '%', width: 7, align: 'right' },
      ],
      data: movers.map((m) => ({ model: m.model, a: fmtCost(m.cost.a), b: fmtCost(m.cost.b), delta: sign(m.cost.delta, fmtCost), pct: pct(m.cost) })),
    });
  }
  return { success: true, data: { ...report, movers } };
}

/** Build a threshold from a --flag or its SWARMDO_GUARD_* env fallback. */
function guardThreshold(ctx: CommandContext, flagKey: string, envKey: string, current: number, label: string, unit: 'usd' | 'tokens'): GuardThreshold | null {
  const raw = ctx.flags[flagKey] ?? process.env[envKey];
  const limit = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return { key: flagKey, label, current, limit, unit };
}

/** Guard view — compare current spend/burn against budget limits (--strict to
 * exit non-zero when over). A policy layer on the usage analytics. */
function runGuardView(ctx: CommandContext, collection: UsageCollection): CommandResult {
  const nowMs = Date.now();
  const active = aggregateBlocks(collection.events, { nowMs }).find((b) => b.active);
  const blockCost = active ? active.totals.costUsd : 0;
  const blockTokens = active ? active.totals.totalTokens : 0;
  const todayKey = localDateKey(new Date(nowMs));
  const monthKey = todayKey.slice(0, 7);
  const todayCost = aggregateUsage(collection.events, 'day').find((r) => r.key === todayKey)?.totals.costUsd ?? 0;
  const monthCost = aggregateUsage(collection.events, 'month').find((r) => r.key === monthKey)?.totals.costUsd ?? 0;

  const thresholds: GuardThreshold[] = [];
  const add = (t: GuardThreshold | null) => { if (t) thresholds.push(t); };
  add(guardThreshold(ctx, 'block-usd', 'SWARMDO_GUARD_BLOCK_USD', blockCost, 'Active 5h block ($)', 'usd'));
  add(guardThreshold(ctx, 'block-tokens', 'SWARMDO_GUARD_BLOCK_TOKENS', blockTokens, 'Active 5h block (tokens)', 'tokens'));
  add(guardThreshold(ctx, 'daily-usd', 'SWARMDO_GUARD_DAILY_USD', todayCost, 'Today ($)', 'usd'));
  add(guardThreshold(ctx, 'monthly-usd', 'SWARMDO_GUARD_MONTHLY_USD', monthCost, 'This month ($)', 'usd'));

  const warnPct = typeof ctx.flags['warn-pct'] === 'number' ? (ctx.flags['warn-pct'] as number) / 100 : 0.8;
  const report = evaluateGuard(thresholds, warnPct);
  const strict = ctx.flags.strict === true;
  const exitCode = strict && report.status === 'over' ? 1 : 0;

  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify({ status: report.status, checks: report.checks, snapshot: { blockCost, blockTokens, todayCost, monthCost } }, null, 2));
    return { success: exitCode === 0, exitCode };
  }

  if (!report.configured) {
    output.writeln(output.bold('Spend guard') + output.dim(' — no limits set'));
    output.printList([
      `Active 5h block: ${fmtCost(blockCost)} · ${fmtInt(blockTokens)} tokens`,
      `Today:           ${fmtCost(todayCost)}`,
      `This month:      ${fmtCost(monthCost)}`,
    ]);
    output.writeln(output.dim('set a limit, e.g.:  swarmdo usage guard --block-usd 5 --daily-usd 20 --strict'));
    output.writeln(output.dim('or via env: SWARMDO_GUARD_BLOCK_USD / _BLOCK_TOKENS / _DAILY_USD / _MONTHLY_USD'));
    return { success: true, exitCode: 0 };
  }

  const icon = (s: GuardStatus) => (s === 'over' ? '⛔' : s === 'warn' ? '⚠' : '✅');
  const fmtVal = (v: number, unit: 'usd' | 'tokens') => (unit === 'usd' ? fmtCost(v) : fmtInt(v));
  output.writeln(output.bold('Spend guard'));
  output.printTable({
    columns: [
      { key: 'status', header: '', width: 3 },
      { key: 'label', header: 'Metric', width: 24 },
      { key: 'current', header: 'Current', width: 14, align: 'right' },
      { key: 'max', header: 'Limit', width: 14, align: 'right' },
      { key: 'pct', header: 'Used', width: 7, align: 'right' },
    ],
    data: report.checks.map((c) => ({
      status: icon(c.status),
      label: c.label,
      current: fmtVal(c.current, c.unit),
      max: fmtVal(c.limit, c.unit),
      pct: `${Math.round(c.pct * 100)}%`,
    })),
  });
  const summary = report.status === 'over' ? output.error('OVER BUDGET') : report.status === 'warn' ? output.warning('approaching limit') : output.info('within budget');
  output.writeln(`status: ${summary}`);
  if (strict && report.status === 'over') output.writeln(output.dim('exit 1 (--strict + over budget)'));
  return { success: exitCode === 0, exitCode };
}

const PERIOD_MONTHS: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 };

/** `usage reflect` — a wrapped-style retrospective over the local transcripts (#47). */
function runReflectView(ctx: CommandContext, collection: ReturnType<typeof collectUsage>): CommandResult {
  const periodFlag = (typeof ctx.flags.period === 'string' ? ctx.flags.period : '3m').toLowerCase();
  const months = PERIOD_MONTHS[periodFlag];
  if (!months) {
    output.printError(`unknown --period "${periodFlag}" (expected ${Object.keys(PERIOD_MONTHS).join('|')})`);
    return { success: false, exitCode: 1 };
  }
  const to = localDateKey(new Date());
  const from = monthsBefore(to, months);

  const dayRows: DayRow[] = aggregateUsage(collection.events, 'day').map((r) => ({ key: r.key, totals: r.totals }));
  const md = new Map<string, ModelRow>();
  const pd = new Map<string, ModelRow>();       // per-(project, day) for top projects
  const hourHistogram = new Array(24).fill(0);  // local-hour cost, windowed to [from,to]
  for (const e of collection.events) {
    const k = `${e.model}\u0000${e.dateKey}`;
    const row = md.get(k) ?? { key: e.model, day: e.dateKey, totals: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 } };
    row.totals.costUsd += e.costUsd;
    row.totals.totalTokens += e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens;
    md.set(k, row);
    // per-(project, day) fold (space separator is safe — dateKey is fixed-width)
    const pk = `${e.project} ${e.dateKey}`;
    const prow = pd.get(pk) ?? { key: e.project, day: e.dateKey, totals: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 } };
    prow.totals.costUsd += e.costUsd;
    prow.totals.totalTokens += e.inputTokens + e.outputTokens + e.cacheWriteTokens + e.cacheReadTokens;
    pd.set(pk, prow);
    if (e.dateKey >= from && e.dateKey <= to) hourHistogram[new Date(e.timestampMs).getHours()] += e.costUsd;
  }

  const reflection = computeReflection(dayRows, [...md.values()], from, to, {}, [...pd.values()], hourHistogram);

  // Delegation ratio (#47): reuse the (windowed) tool-error scan to count Task
  // (subagent) calls vs all tool calls — the parsing is already tested there.
  const delDirFlag = ctx.flags.dir;
  const delDirs = typeof delDirFlag === 'string' ? [delDirFlag] : Array.isArray(delDirFlag) ? delDirFlag.map(String) : undefined;
  const delegation = delegationFromReport(collectToolErrors({ dirs: delDirs, since: from, until: to }));

  if (ctx.flags.json === true) {
    output.printJson({ ...reflection, delegation });
    return { success: true, data: reflection };
  }

  if (ctx.flags.html === true) {
    output.writeln(renderReflectionHtml(reflection, { generatedAt: to, delegation }));
    return { success: true, exitCode: 0 };
  }

  const r: Reflection = reflection;
  const pctStr = (x: number): string => `${Math.round(x * 100)}%`;
  const arrow = r.trend.direction === 'up' ? '↑' : r.trend.direction === 'down' ? '↓' : '→';
  output.writeln(output.bold(`Usage reflect  ${r.period.from}..${r.period.to}`) + output.dim(`  (${periodFlag}, ${r.period.spanDays} days)`));
  if (r.totals.activeDays === 0) {
    output.writeln(output.info('no Claude Code activity in this window'));
    return { success: true, exitCode: 0 };
  }
  output.writeln('');
  output.writeln(`  Total spend        ${output.bold(fmtCost(r.totals.costUsd))}  ${output.dim(`across ${r.totals.activeDays} active day${r.totals.activeDays === 1 ? '' : 's'} of ${r.period.spanDays}`)}`);
  output.writeln(`  Total tokens       ${r.totals.totalTokens.toLocaleString()}`);
  if (r.busiestDay) output.writeln(`  Busiest day        ${r.busiestDay.day}  ${output.dim(`(${fmtCost(r.busiestDay.costUsd)}, ${r.busiestDay.totalTokens.toLocaleString()} tok)`)}`);
  if (r.spikeDays.length) {
    const top = r.spikeDays.slice(0, 3).map((s) => `${s.day} ${fmtCost(s.costUsd)} (${s.ratioToMedian.toFixed(1)}×)`).join(', ');
    output.writeln(`  Spike days         ${top}  ${output.dim('vs median')}`);
  }
  output.writeln(`  Longest streak     ${r.longestStreak} day${r.longestStreak === 1 ? '' : 's'}`);
  output.writeln(`  Avg / active day   ${fmtCost(r.avgCostPerActiveDay)}`);
  output.writeln(`  Cache read share   ${pctStr(r.cacheReadPct)}`);
  if (delegation.toolCalls > 0) {
    output.writeln(`  Delegation         ${pctStr(delegation.ratio)}  ${output.dim(`(${delegation.taskCalls} of ${delegation.toolCalls} tool calls to subagents)`)}`);
  }
  output.writeln(`  Cost trend         ${arrow} ${fmtCost(r.trend.firstHalfCost)} → ${fmtCost(r.trend.secondHalfCost)} ${output.dim(`(${r.trend.direction})`)}`);
  if (r.peakHour) output.writeln(`  Peak hour          ${String(r.peakHour.hour).padStart(2, '0')}:00  ${output.dim(`(${fmtCost(r.peakHour.value)})`)}`);
  if (r.hourHistogram.some((v) => v > 0)) {
    output.writeln(`  By hour            ${hourSparkline(r.hourHistogram)}  ${output.dim('0…23')}`);
  }
  if (r.topModels.length) {
    output.writeln('');
    output.writeln(output.bold('  Top models'));
    r.topModels.forEach((m, i) => {
      output.writeln(`    ${i + 1}. ${m.model.padEnd(22)} ${fmtCost(m.costUsd).padStart(9)}  ${output.dim(pctStr(m.pct))}`);
    });
  }
  if (r.topProjects.length) {
    output.writeln('');
    output.writeln(output.bold('  Top projects'));
    r.topProjects.forEach((p, i) => {
      const name = p.model.length > 34 ? '…' + p.model.slice(-33) : p.model;
      output.writeln(`    ${i + 1}. ${name.padEnd(34)} ${fmtCost(p.costUsd).padStart(9)}  ${output.dim(pctStr(p.pct))}`);
    });
  }
  return { success: true, exitCode: 0 };
}

/** `usage limits` — forecast the official 5h/7d quota windows from the
 * statusline rate_limits payload (stdin or --payload). #46. */
function runLimitsView(ctx: CommandContext): CommandResult {
  const nowMs = Date.now();
  let raw = typeof ctx.flags.payload === 'string' ? ctx.flags.payload : '';
  if (!raw && !process.stdin.isTTY) {
    try { raw = readFileSync(0, 'utf8'); } catch { /* no piped input */ }
  }
  if (!raw.trim()) {
    output.writeln(output.info("no rate_limits payload — pipe Claude Code's statusline JSON in, or pass --payload '<json>'"));
    output.writeln(output.dim('  e.g. in a statusline command:  … | swarmdo usage limits'));
    return { success: true, exitCode: 0 };
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { output.printError('payload is not valid JSON'); return { success: false, exitCode: 1 }; }

  const windows = parseRateLimits(payload);
  if (windows.length === 0) {
    output.writeln(output.info('no five_hour / seven_day rate_limits found in the payload'));
    return { success: true, exitCode: 0 };
  }
  const forecasts = windows.map((w) => ({ label: w.label, f: forecastWindow(w.state, nowMs) }));

  if (ctx.flags.json === true) {
    output.printJson(forecasts.map((x) => ({ label: x.label, ...x.f })));
    return { success: true, data: forecasts };
  }

  if (ctx.flags.oneline === true) {
    // Compact statusline-ready indicator, e.g. "5h 72%⚠ · 7d 12%".
    output.writeln(formatLimitSegment(forecasts));
    const worstOne = worstStatus(forecasts.map((x) => x.f));
    return { success: true, exitCode: ctx.flags.strict === true && worstOne === 'over' ? 1 : 0 };
  }

  const worst = worstStatus(forecasts.map((x) => x.f));
  output.writeln(output.bold('Usage limits') + output.dim(`  (${worst})`));
  for (const { label, f } of forecasts) {
    const line = formatForecast(label, f, nowMs);
    output.writeln('  ' + (f.status === 'over' ? output.error(line) : f.status === 'warn' ? line : output.dim(line)));
  }
  const exitCode = ctx.flags.strict === true && worst === 'over' ? 1 : 0;
  if (exitCode === 1) output.writeln(output.dim('exit 1 (--strict + cap reached)'));
  return { success: exitCode === 0, exitCode };
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const viewName = (ctx.args[0] || 'daily').toLowerCase();

  if (viewName === 'blocks') {
    const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;
    const until = typeof ctx.flags.until === 'string' ? ctx.flags.until : undefined;
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runBlocksView(ctx, collectUsage({ dirs, since, until }));
  }

  if (viewName === 'errors') {
    const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;
    const until = typeof ctx.flags.until === 'string' ? ctx.flags.until : undefined;
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runErrorsView(ctx, collectToolErrors({ dirs, since, until }));
  }

  if (viewName === 'cache') {
    const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;
    const until = typeof ctx.flags.until === 'string' ? ctx.flags.until : undefined;
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runCacheView(ctx, collectUsage({ dirs, since, until }));
  }

  if (viewName === 'guard') {
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runGuardView(ctx, collectUsage({ dirs }));
  }

  if (viewName === 'diff') {
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runDiffView(ctx, collectUsage({ dirs }));
  }

  if (viewName === 'reflect') {
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runReflectView(ctx, collectUsage({ dirs }));
  }

  if (viewName === 'limits') {
    return runLimitsView(ctx); // reads the rate_limits payload from stdin/--payload, not transcripts
  }

  const view = VIEWS[viewName];
  if (!view) {
    output.writeln(output.error(`unknown view: ${viewName} (expected ${Object.keys(VIEWS).join('|')}|blocks|errors|cache|guard|diff|reflect|limits)`));
    return { success: false, exitCode: 1 };
  }

  const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;
  const until = typeof ctx.flags.until === 'string' ? ctx.flags.until : undefined;
  const dirFlag = ctx.flags.dir;
  const dirs =
    typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
  const limit = typeof ctx.flags.limit === 'number' ? ctx.flags.limit : undefined;

  const collection = collectUsage({ dirs, since, until });

  if (collection.dirsScanned.length === 0) {
    output.writeln(output.info('no Claude Code data directories found (~/.claude/projects, ~/.config/claude/projects, $CLAUDE_CONFIG_DIR/projects)'));
    return { success: true, exitCode: 0 };
  }

  let rows = aggregateUsage(collection.events, view.dimension);
  const grand = totalUsage(collection.events);
  if (limit && limit > 0 && (view.dimension === 'model' || view.dimension === 'project' || view.dimension === 'session')) {
    rows = rows.slice(0, limit);
  }

  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify(jsonPayload(viewName, collection, rows, grand, since, until), null, 2));
    return { success: true, exitCode: 0, data: grand };
  }

  if (ctx.flags.csv === true) {
    // Portable export for spreadsheets / expense reports.
    const headers = ['key', 'costUsd', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens', 'entries'];
    const csvRows = rows.map((r) => [r.key, r.totals.costUsd, r.totals.inputTokens, r.totals.outputTokens, r.totals.cacheReadTokens, r.totals.cacheWriteTokens, r.totals.totalTokens, r.totals.entries]);
    output.writeln(toCsv(headers, csvRows));
    return { success: true, exitCode: 0, data: grand };
  }

  if (collection.events.length === 0) {
    output.writeln(output.info(`no usage entries found in ${collection.filesScanned} transcript files`));
    return { success: true, exitCode: 0 };
  }

  output.writeln(output.bold(`Claude Code usage — ${viewName}`) + (since || until ? output.dim(`  (${since ?? '…'} → ${until ?? '…'})`) : ''));
  renderTable(view.label, rows, grand);
  if (viewName === 'monthly') {
    // Month-end pace projection for the current calendar month.
    const today = localDateKey(new Date());
    const curMonth = today.slice(0, 7);
    const dom = Number(today.slice(8, 10));
    const curRow = rows.find((r) => r.key === curMonth);
    const dim = daysInMonthOf(curMonth);
    if (curRow && dom > 0 && Number.isFinite(dim)) {
      const p = projectMonthEnd(curRow.totals.costUsd, dom, dim);
      output.writeln(
        output.dim(`${curMonth} on pace for ~${fmtCost(p.projectedUsd)}  (${fmtCost(p.monthToDateUsd)} over ${dom}/${p.daysInMonth} days · ~${fmtCost(p.remainingUsd)} to go)`),
      );
    }
  }
  output.writeln(
    output.dim(
      `${collection.filesScanned} transcript files · ${grand.entries} billed responses · sources: ${collection.dirsScanned.join(', ')}`,
    ),
  );
  if (collection.unpricedModels.length > 0) {
    const { unpricedResponses, unpricedTokens } = unpricedStats(collection.events);
    output.writeln(
      output.warning(
        `no price table for: ${collection.unpricedModels.join(', ')} — ${unpricedResponses.toLocaleString()} responses / ${unpricedTokens.toLocaleString()} tokens counted but billed as $0, so real spend is higher (transcript costUSD is used when present)`,
      ),
    );
  }
  return { success: true, exitCode: 0, data: grand };
}

export const usageCommand: Command = {
  name: 'usage',
  aliases: ['cost'],
  description: 'Claude Code token & cost analytics from local transcripts (daily|monthly|models|projects|sessions)',
  options: [
    { name: 'since', description: 'inclusive start date (YYYY-MM-DD or YYYYMMDD)', type: 'string' },
    { name: 'until', description: 'inclusive end date (YYYY-MM-DD or YYYYMMDD)', type: 'string' },
    { name: 'dir', description: 'explicit Claude projects dir (replaces auto-discovery)', type: 'string' },
    { name: 'limit', description: 'max rows for models/projects/sessions views', type: 'number' },
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
    { name: 'csv', description: 'CSV export (daily|monthly|models|projects|sessions views)', type: 'boolean', default: false },
  ],
  examples: [
    { command: 'swarmdo usage', description: 'Daily token/cost table across all local Claude Code sessions' },
    { command: 'swarmdo usage models --since 2026-07-01', description: 'Spend per model this month' },
    { command: 'swarmdo usage projects --json', description: 'Per-project totals as JSON' },
    { command: 'swarmdo usage monthly --csv > usage.csv', description: 'Export monthly spend to CSV' },
    { command: 'swarmdo cost sessions --limit 10', description: 'Ten most expensive sessions (alias)' },
  ],
  action: run,
};

export default usageCommand;
