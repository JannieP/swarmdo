/**
 * `swarmdo coupling` — temporal (co-change) coupling mined from git history.
 *
 *   swarmdo coupling                          # top co-changing file pairs
 *   swarmdo coupling --since 90d --min-shared 3
 *   swarmdo coupling --file src/auth.ts       # what changes WITH auth.ts?
 *   swarmdo coupling --format json | --csv
 *
 * The EMPIRICAL complement to `affected` (which walks the static import graph):
 * files that keep landing in the same commit are coupled in practice even with
 * no import edge. Engine (../coupling/coupling.ts) is pure + tested; this
 * captures the git log (the same `--numstat` dump `hotspots` uses).
 */

import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { parseGitLog } from '../hotspots/hotspots.js';
import { computeCoupling, formatCoupling, couplingToCsv } from '../coupling/coupling.js';
import { normalizeSince } from '../util/since.js';

/** Read a numeric flag that the parser may deliver as a number OR a string. */
function numFlag(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : '1 year ago';
  const top = numFlag(ctx.flags.top, 30);
  const minShared = numFlag(ctx.flags['min-shared'], 2);
  const maxFiles = numFlag(ctx.flags['max-files'], 30);
  const focus = typeof ctx.flags.file === 'string' ? ctx.flags.file : (ctx.args[0] || undefined);

  const asJson = ctx.flags.format === 'json';
  const asCsv = ctx.flags.csv === true;

  // NOTE: unlike `hotspots`, we do NOT pathspec-filter the log to `focus` — that
  // would strip the co-changed files out of each commit's numstat. We capture
  // the full history and filter PAIRS in the engine (opts.focus) instead.
  const args = ['log', '--no-merges', '--numstat', `--since=${normalizeSince(since)}`, '--format=format:%x01%H%x1f%aN%x1f%aI'];
  let raw: string;
  try {
    raw = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch {
    output.printError('git log failed — is this a git repository?');
    return { success: false, exitCode: 1 };
  }

  const pairs = computeCoupling(parseGitLog(raw), {
    minShared,
    maxFiles,
    top: top > 0 ? top : undefined,
    focus,
  });

  if (asCsv) {
    process.stdout.write(couplingToCsv(pairs) + '\n');
  } else if (asJson) {
    process.stdout.write(JSON.stringify({ generated: new Date().toISOString(), since, minShared, count: pairs.length, coupling: pairs }, null, 2) + '\n');
  } else if (pairs.length === 0) {
    output.writeln(output.dim(`no co-change coupling found${focus ? ` for ${focus}` : ''} — raise --since or lower --min-shared`));
  } else {
    output.writeln(output.bold(`Co-change coupling${focus ? ` for ${focus}` : ''} (since ${since}, min-shared ${minShared})`));
    output.writeln(formatCoupling(pairs));
  }
  return { success: true, exitCode: 0 };
}

export const couplingCommand: Command = {
  name: 'coupling',
  description: 'Rank file pairs that change together in git history (temporal/co-change coupling) — the empirical complement to `affected`',
  options: [
    { name: 'since', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)', type: 'string' },
    { name: 'min-shared', description: 'drop pairs sharing fewer than N commits (default 2)', type: 'string' },
    { name: 'max-files', description: 'skip commits touching more than N files (default 30; 0 = no cap)', type: 'string' },
    { name: 'file', description: 'show only pairs involving this path ("what changes with X?")', type: 'string' },
    { name: 'top', description: 'keep only the top N pairs (default 30; 0 = all)', type: 'string' },
    { name: 'csv', description: 'export the ranking as CSV (for spreadsheets)', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo coupling --since 6mo --min-shared 3', description: 'Strongly co-changing pairs in the last 6 months' },
    { command: 'swarmdo coupling --file src/auth.ts', description: 'What tends to change together with auth.ts?' },
    { command: 'swarmdo coupling --csv > coupling.csv', description: 'Export the coupling ranking to CSV' },
  ],
  action: run,
};

export default couplingCommand;
