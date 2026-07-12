/**
 * `swarmdo hidden-coupling` — files that CHANGE TOGETHER but have no import edge.
 *
 *   swarmdo hidden-coupling                       # co-change pairs the code doesn't explain
 *   swarmdo hidden-coupling --since 6mo --min-shared 3
 *   swarmdo hidden-coupling --format json | --csv
 *
 * "Logical coupling minus structural coupling": pairs with a high co-change
 * `degree` (from `coupling`) yet NO import edge connecting them (from
 * `codegraph`). A dependency real enough to move two files in lockstep but
 * invisible in the code — the co-edit an agent following imports would miss, or
 * a missing abstraction a reviewer should question. Composes the two capture
 * paths verbatim: git-log + `computeCoupling`, and the codegraph index load.
 * Engine (../coupling/hidden.ts) is pure + tested.
 */

import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { parseGitLog } from '../hotspots/hotspots.js';
import { computeCoupling } from '../coupling/coupling.js';
import { computeHiddenCoupling, formatHiddenCoupling, hiddenCouplingToCsv } from '../coupling/hidden.js';
import { loadIndex, scanRepo, saveIndex } from '../codegraph/store.js';
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

  const asJson = ctx.flags.format === 'json';
  const asCsv = ctx.flags.csv === true;

  // Capture 1: the full co-change history (same `--numstat` dump `coupling` uses;
  // NO pathspec filter — that would strip co-changed files from each commit).
  const args = ['log', '--no-merges', '--numstat', `--since=${normalizeSince(since)}`, '--format=format:%x01%H%x1f%aN%x1f%aI'];
  let raw: string;
  try {
    raw = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch {
    output.printError('git log failed — is this a git repository?');
    return { success: false, exitCode: 1 };
  }
  // Rank ALL coupling pairs (no top yet — we cap the HIDDEN set after filtering).
  const pairs = computeCoupling(parseGitLog(raw), { minShared, maxFiles });

  // Capture 2: the static import graph (prefer a saved index; build one if absent).
  let index = loadIndex(root);
  if (!index) {
    index = scanRepo(root);
    try { saveIndex(root, index); } catch { /* read-only fs — in-memory is fine */ }
  }

  const hidden = computeHiddenCoupling(pairs, index.imports, { top: top > 0 ? top : undefined });

  if (asCsv) {
    process.stdout.write(hiddenCouplingToCsv(hidden) + '\n');
  } else if (asJson) {
    process.stdout.write(
      JSON.stringify({ generated: new Date().toISOString(), since, minShared, coupled: pairs.length, count: hidden.length, hidden }, null, 2) + '\n',
    );
  } else if (hidden.length === 0) {
    output.writeln(output.dim(`no hidden coupling found — every co-change pair has an import edge (or none met --min-shared ${minShared} / --since ${since})`));
  } else {
    output.writeln(output.bold(`Hidden coupling (co-change with NO import edge, since ${since}, min-shared ${minShared})`));
    output.writeln(formatHiddenCoupling(hidden));
    output.writeln(output.dim(`${hidden.length} hidden of ${pairs.length} coupled pair(s) — these move together but nothing in the code links them`));
  }
  return { success: true, exitCode: 0 };
}

export const hiddenCouplingCommand: Command = {
  name: 'hidden-coupling',
  description: 'Rank file pairs that change together in git history but have NO import edge (logical minus structural coupling) — the co-edit `affected` can\'t see',
  options: [
    { name: 'since', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)', type: 'string' },
    { name: 'min-shared', description: 'drop pairs sharing fewer than N commits (default 2)', type: 'string' },
    { name: 'max-files', description: 'skip commits touching more than N files (default 30; 0 = no cap)', type: 'string' },
    { name: 'top', description: 'keep only the top N hidden pairs (default 30; 0 = all)', type: 'string' },
    { name: 'csv', description: 'export the ranking as CSV (for spreadsheets)', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo hidden-coupling --since 6mo --min-shared 3', description: 'Strong co-change pairs with no code link, last 6 months' },
    { command: 'swarmdo hidden-coupling --format json', description: 'Machine-readable hidden-coupling report' },
  ],
  action: run,
};

export default hiddenCouplingCommand;
