/**
 * `swarmdo hotspots` — rank files by change-risk mined from git history.
 *
 *   swarmdo hotspots                     # top risk files in the repo
 *   swarmdo hotspots src --since 90d     # scope to a path + window
 *   swarmdo hotspots --by churn --top 10 # sort/limit
 *   swarmdo hotspots --format json       # machine-readable
 *
 * "Where is the technical debt?" answered from data: files that change often,
 * churn heavily, are touched by many hands, and were edited recently. Pairs
 * with `codegraph`. Engine (../hotspots/hotspots.ts) is pure + tested; this
 * captures the git log.
 */

import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { parseGitLog, computeHotspots, formatHotspots, hotspotsToCsv, type SortKey } from '../hotspots/hotspots.js';

const SORT_KEYS: SortKey[] = ['risk', 'churn', 'commits', 'authors'];

/** Read a numeric flag that the parser may deliver as a number OR a string. */
function numFlag(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const pathArg = ctx.args[0];
  const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : '1 year ago';
  const top = numFlag(ctx.flags.top, 20);
  const minCommits = numFlag(ctx.flags['min-commits'], 1);
  const by = (typeof ctx.flags.by === 'string' ? ctx.flags.by : 'risk') as SortKey;
  if (!SORT_KEYS.includes(by)) {
    output.printError(`unknown --by '${by}' (use ${SORT_KEYS.join('|')})`);
    return { success: false, exitCode: 1 };
  }
  // Global --format (text|json|table); text and table both render the table.
  const asJson = ctx.flags.format === 'json';
  const asCsv = ctx.flags.csv === true; // dedicated flag (global --format has no csv choice)

  // Capture history: SOH-delimited header + numstat, no merges. `%aN` (not
  // `%an`) resolves author names through `.mailmap`, so name/email variants of
  // the same person fold into one identity — otherwise the author-spread factor
  // in the risk score is silently inflated. Identical to `%an` when no .mailmap.
  const args = ['log', '--no-merges', '--numstat', `--since=${since}`, '--format=format:%x01%H%x1f%aN%x1f%aI'];
  if (pathArg) args.push('--', pathArg);
  let raw: string;
  try {
    raw = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch {
    output.printError('git log failed — is this a git repository?');
    return { success: false, exitCode: 1 };
  }

  const now = Date.now();
  const spots = computeHotspots(parseGitLog(raw), now, { by, top: top > 0 ? top : undefined, minCommits });

  if (asCsv) {
    process.stdout.write(hotspotsToCsv(spots) + '\n');
  } else if (asJson) {
    process.stdout.write(JSON.stringify({ generated: new Date(now).toISOString(), by, count: spots.length, hotspots: spots }, null, 2) + '\n');
  } else {
    if (spots.length === 0) {
      output.writeln(output.dim('no hotspots found — no matching git history in the window'));
    } else {
      output.writeln(output.bold(`Change-risk hotspots (by ${by}, since ${since})`));
      output.writeln(formatHotspots(spots, now));
    }
  }
  return { success: true, exitCode: 0 };
}

export const hotspotsCommand: Command = {
  name: 'hotspots',
  description: 'Rank files by change-risk mined from git history (churn × recency × author-spread) — find the technical debt worth refactoring or testing',
  options: [
    { name: 'since', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)', type: 'string' },
    { name: 'top', description: 'keep only the top N files (default 20; 0 = all)', type: 'string' },
    { name: 'min-commits', description: 'drop files with fewer than N commits (default 1)', type: 'string' },
    { name: 'by', description: `sort key: ${SORT_KEYS.join('|')} (default risk)`, type: 'string' },
    { name: 'csv', description: 'export the ranking as CSV (for spreadsheets)', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo hotspots src --since 90d', description: 'Risk hotspots under src/ in the last 90 days' },
    { command: 'swarmdo hotspots --by churn --top 10 --format json', description: 'Top-10 by churn as JSON' },
    { command: 'swarmdo hotspots --csv > hotspots.csv', description: 'Export the risk ranking to CSV' },
  ],
  action: run,
};

export default hotspotsCommand;
