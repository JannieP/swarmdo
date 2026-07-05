/**
 * V3 CLI HUD Command
 *
 * `swarmdo hud [--watch] [--interval N] [--json]` — one pane of glass over
 * swarmdo's local operational state: active 5h billing block + burn, task
 * graph readiness, daemon workers, memory db + snapshots. Read-only; the
 * watch loop just re-renders. Data: ../hud/hud-data.ts.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import type { HudData } from '../hud/hud-data.js';

function fmtCost(v: number): string {
  return v < 0.01 && v > 0 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

function fmtMB(bytes: number | null): string {
  return bytes === null ? '—' : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Pure renderer — tested against fixture HudData. */
export function renderHud(d: HudData): string[] {
  const lines: string[] = [];
  const rule = '─'.repeat(62);

  lines.push(`swarmdo hud · ${d.cwd} · ${new Date(d.generatedAt).toLocaleTimeString('en-CA', { hourCycle: 'h23' })}`);
  lines.push(rule);

  // Billing block
  if (d.activeBlock) {
    const b = d.activeBlock;
    lines.push(
      `block   ACTIVE · ${fmtCost(b.block.totals.costUsd)} spent · ${b.remainingMin} min left · ` +
      `burn ${fmtCost(b.burnPerHourUsd)}/h → ${fmtCost(b.projectedUsd)} projected`,
    );
  } else {
    lines.push('block   idle — next activity starts a fresh 5-hour window');
  }
  lines.push(`today   ${fmtCost(d.todayCostUsd)} across all sessions (API-equivalent)`);
  lines.push(rule);

  // Tasks
  const t = d.tasks;
  lines.push(`tasks   ${t.total} total · ${t.ready} ready · ${t.blocked} blocked · ${t.inProgress.length} in progress`);
  for (const id of t.inProgress) lines.push(`        ▶ ${id}`);
  for (const id of t.readyIds) lines.push(`        ● ${id} (ready)`);
  lines.push(rule);

  // Daemon
  if (!d.daemon) {
    lines.push('daemon  never initialized (start: swarmdo daemon start)');
  } else if (!d.daemon.running) {
    lines.push('daemon  stopped');
  } else {
    lines.push('daemon  running');
    for (const w of d.daemon.workers.filter((w) => w.isRunning || w.runCount > 0)) {
      lines.push(`        ${w.isRunning ? '▶' : '·'} ${w.name}  runs ${w.runCount}${w.failureCount ? ` (${w.failureCount} failed)` : ''}`);
    }
  }
  lines.push(rule);

  // Memory
  const m = d.memory;
  lines.push(`memory  ${fmtMB(m.dbBytes)} · ${m.snapshots} snapshot(s)${m.newestSnapshot ? ` · newest ${m.newestSnapshot}` : ''}`);

  return lines;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const { collectHudData } = await import('../hud/hud-data.js');
  const cwd = ctx.cwd || process.cwd();

  const renderOnce = (): HudData => {
    const data = collectHudData({ cwd });
    if (ctx.flags.json !== true) {
      for (const line of renderHud(data)) output.writeln(line);
    }
    return data;
  };

  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify(collectHudData({ cwd }), null, 2));
    return { success: true, exitCode: 0 };
  }

  if (ctx.flags.watch !== true) {
    renderOnce();
    return { success: true, exitCode: 0 };
  }

  const intervalSec = typeof ctx.flags.interval === 'number' && ctx.flags.interval > 0 ? ctx.flags.interval : 5;
  // Watch loop: full-repaint each tick; SIGINT exits cleanly.
  await new Promise<void>((resolve) => {
    const paint = (): void => {
      output.writeln('\x1b[2J\x1b[H');
      renderOnce();
      output.writeln(output.dim(`refreshing every ${intervalSec}s — Ctrl-C to exit`));
    };
    paint();
    const timer = setInterval(paint, intervalSec * 1000);
    const stop = (): void => {
      clearInterval(timer);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return { success: true, exitCode: 0 };
}

export const hudCommand: Command = {
  name: 'hud',
  description: 'Live single-pane view: 5h block burn, task readiness, daemon workers, memory snapshots',
  options: [
    { name: 'watch', short: 'w', description: 'Repaint continuously', type: 'boolean', default: false },
    { name: 'interval', description: 'Watch refresh seconds (default 5)', type: 'number', default: 5 },
    { name: 'json', description: 'One-shot machine-readable snapshot', type: 'boolean', default: false },
  ],
  examples: [
    { command: 'swarmdo hud', description: 'One-shot operational snapshot' },
    { command: 'swarmdo hud --watch', description: 'Live view, 5s refresh' },
    { command: 'swarmdo hud --json', description: 'Snapshot for scripts/statuslines' },
  ],
  action: run,
};

export default hudCommand;
