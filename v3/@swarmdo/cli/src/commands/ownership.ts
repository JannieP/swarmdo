/**
 * `swarmdo ownership` — per-file knowledge map + BUS FACTOR mined from git history.
 *
 *   swarmdo ownership                      # knowledge map, most fragile files first
 *   swarmdo ownership src --since 90d       # scope to a path + window
 *   swarmdo ownership --top 10 --format json
 *   swarmdo ownership --csv > ownership.csv
 *
 * "Who owns each file, and what breaks if they leave?" — the code-maat
 * main-dev / bus-factor analysis. Files where one author owns nearly all the
 * churn (bus factor 1) are key-person risks. Pairs with `hotspots` (change-risk)
 * and `coupling` (co-change). Engine (../ownership/ownership.ts) is pure +
 * tested; this captures the git log (the same `--numstat` dump those use).
 */

import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { parseGitLog } from '../hotspots/hotspots.js';
import { computeOwnership, repoBusFactor, formatOwnership, ownershipToCsv } from '../ownership/ownership.js';
import { normalizeSince } from '../util/since.js';

/** Read a numeric flag that the parser may deliver as a number OR a string. */
function numFlag(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const pathArg = ctx.args[0];
  const since = typeof ctx.flags.since === 'string' ? ctx.flags.since : '1 year ago';
  const top = numFlag(ctx.flags.top, 40);
  const minChurn = numFlag(ctx.flags['min-churn'], 1);

  const asJson = ctx.flags.format === 'json';
  const asCsv = ctx.flags.csv === true;

  // Same SOH-delimited numstat capture `hotspots` uses. `%aN` folds author
  // name/email variants through `.mailmap` so one person is one owner. A
  // positional pathspec scopes BOTH the file rows and the truck factor to that
  // subtree (unlike `coupling`, per-file ownership survives a pathspec fine).
  const args = ['log', '--no-merges', '--numstat', `--since=${normalizeSince(since)}`, '--format=format:%x01%H%x1f%aN%x1f%aI'];
  if (pathArg) args.push('--', pathArg);
  let raw: string;
  try {
    raw = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  } catch {
    output.printError('git log failed — is this a git repository?');
    return { success: false, exitCode: 1 };
  }

  const commits = parseGitLog(raw);
  const files = computeOwnership(commits, { minChurn, top: top > 0 ? top : undefined });
  const repo = repoBusFactor(commits);

  if (asCsv) {
    process.stdout.write(ownershipToCsv(files) + '\n');
  } else if (asJson) {
    process.stdout.write(
      JSON.stringify({ generated: new Date().toISOString(), since, minChurn, repoBusFactor: repo, count: files.length, ownership: files }, null, 2) + '\n',
    );
  } else if (files.length === 0) {
    output.writeln(output.dim('no ownership data found — no matching git history in the window'));
  } else {
    output.writeln(output.bold(`File ownership & bus factor (since ${since})`));
    if (repo.factor > 0) {
      const who = repo.authors.length <= 3 ? repo.authors.join(', ') : `${repo.authors.slice(0, 3).join(', ')} +${repo.authors.length - 3}`;
      const flag = repo.factor === 1 ? '  ⚠ single point of knowledge' : '';
      output.writeln(output.dim(`Repo truck factor: ${repo.factor} (${who} own >50% of churn)${flag}`));
    }
    output.writeln(formatOwnership(files));
  }
  return { success: true, exitCode: 0 };
}

export const ownershipCommand: Command = {
  name: 'ownership',
  description: 'Map per-file authorship concentration + bus factor from git history — find the key-person risks (code-maat main-dev / knowledge map)',
  options: [
    { name: 'since', description: 'history window, e.g. 90d or "3 months ago" (default 1 year)', type: 'string' },
    { name: 'top', description: 'keep only the top N files (default 40; 0 = all)', type: 'string' },
    { name: 'min-churn', description: 'drop files with total churn below N (default 1)', type: 'string' },
    { name: 'csv', description: 'export the knowledge map as CSV (for spreadsheets)', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo ownership src --since 6mo', description: 'Knowledge map under src/ in the last 6 months' },
    { command: 'swarmdo ownership --top 10 --format json', description: 'Ten most fragile files as JSON, with repo truck factor' },
    { command: 'swarmdo ownership --csv > ownership.csv', description: 'Export the ownership map to CSV' },
  ],
  action: run,
};

export default ownershipCommand;
