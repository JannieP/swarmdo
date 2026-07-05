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
  type UsageBlock,
  type UsageCollection,
  type UsageDimension,
  type UsageTotals,
} from '../usage/transcript-usage.js';

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
  };
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

async function run(ctx: CommandContext): Promise<CommandResult> {
  const viewName = (ctx.args[0] || 'daily').toLowerCase();

  if (viewName === 'blocks') {
    const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : undefined;
    const until = typeof ctx.flags.until === 'string' ? ctx.flags.until : undefined;
    const dirFlag = ctx.flags.dir;
    const dirs = typeof dirFlag === 'string' ? [dirFlag] : Array.isArray(dirFlag) ? dirFlag.map(String) : undefined;
    return runBlocksView(ctx, collectUsage({ dirs, since, until }));
  }

  const view = VIEWS[viewName];
  if (!view) {
    output.writeln(output.error(`unknown view: ${viewName} (expected ${Object.keys(VIEWS).join('|')})`));
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

  if (collection.events.length === 0) {
    output.writeln(output.info(`no usage entries found in ${collection.filesScanned} transcript files`));
    return { success: true, exitCode: 0 };
  }

  output.writeln(output.bold(`Claude Code usage — ${viewName}`) + (since || until ? output.dim(`  (${since ?? '…'} → ${until ?? '…'})`) : ''));
  renderTable(view.label, rows, grand);
  output.writeln(
    output.dim(
      `${collection.filesScanned} transcript files · ${grand.entries} billed responses · sources: ${collection.dirsScanned.join(', ')}`,
    ),
  );
  if (collection.unpricedModels.length > 0) {
    output.writeln(
      output.warning(
        `no price table for: ${collection.unpricedModels.join(', ')} — tokens counted, cost reported as $0 (transcript costUSD used when present)`,
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
  ],
  examples: [
    { command: 'swarmdo usage', description: 'Daily token/cost table across all local Claude Code sessions' },
    { command: 'swarmdo usage models --since 2026-07-01', description: 'Spend per model this month' },
    { command: 'swarmdo usage projects --json', description: 'Per-project totals as JSON' },
    { command: 'swarmdo cost sessions --limit 10', description: 'Ten most expensive sessions (alias)' },
  ],
  action: run,
};

export default usageCommand;
