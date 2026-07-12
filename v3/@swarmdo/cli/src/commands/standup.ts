/**
 * `swarmdo standup` — recall what you committed since your last working day.
 *
 *   swarmdo standup                   # your commits since the last working day
 *   swarmdo standup --all             # everyone's commits
 *   swarmdo standup --author "Ada"    # a specific author (or: swarmdo standup Ada)
 *   swarmdo standup --days 7          # explicit N-day window
 *   swarmdo standup --since 2w        # explicit window (git approxidate)
 *   swarmdo standup --format json     # machine-readable
 *
 * Weekend-aware (git-standup parity): on Monday it reaches back to Friday, on
 * Sunday to Friday, otherwise to yesterday. Engine (../standup/standup.ts) is
 * pure + tested; this thin layer captures the git log and renders.
 */

import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { parseStandupLog, groupByDay, sinceLastWorkingDay, formatStandup } from '../standup/standup.js';
import { normalizeSince } from '../util/since.js';

/** Read a non-negative numeric flag the parser may deliver as number OR string. */
function numFlag(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Resolve the default author (git config user.name); '' if unset/unavailable. */
function gitUserName(root: string): string {
  try {
    return execFileSync('git', ['config', 'user.name'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const asJson = ctx.flags.format === 'json';
  const all = ctx.flags.all === true;

  // Author: explicit --author, else positional arg, else current git user
  // (unless --all, which clears the filter to show everyone).
  const authorFlag = typeof ctx.flags.author === 'string' ? ctx.flags.author : ctx.args[0];
  let author = '';
  if (!all) author = ((authorFlag && authorFlag.trim()) || gitUserName(root)).trim();

  // Window resolution (priority): --since (approxidate passthrough) >
  // --days N > the weekend-aware default.
  const now = new Date();
  const sinceExpr = typeof ctx.flags.since === 'string' ? ctx.flags.since.trim() : '';
  const daysFlag = numFlag(ctx.flags.days);
  let sinceArg: string;
  let windowLabel: string;
  if (sinceExpr) {
    sinceArg = normalizeSince(sinceExpr);
    windowLabel = sinceExpr;
  } else {
    const days = daysFlag ?? sinceLastWorkingDay(now).sinceDays;
    // Cutoff = LOCAL midnight `days` ago, so the WHOLE last working day is
    // included (a plain "3 days ago" would start mid-morning and miss commits).
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    sinceArg = cutoff.toISOString();
    windowLabel = days === 1 ? 'since yesterday' : `since ${days} days ago`;
  }

  const args = ['log', '--numstat', `--since=${sinceArg}`, '--format=format:%x01%H%x1f%aN%x1f%aI%x1f%s'];
  if (author) args.push(`--author=${author}`);
  let raw: string;
  try {
    raw = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch {
    output.printError('git log failed — is this a git repository?');
    return { success: false, exitCode: 1 };
  }

  const buckets = groupByDay(parseStandupLog(raw));

  if (asJson) {
    const count = buckets.reduce((n, b) => n + b.commits.length, 0);
    process.stdout.write(
      JSON.stringify(
        { generated: now.toISOString(), author: all ? null : author || null, since: sinceArg, count, buckets },
        null,
        2,
      ) + '\n',
    );
  } else {
    const who = all ? 'everyone' : author || 'you';
    if (buckets.length === 0) {
      output.writeln(output.dim(`no commits for ${who} ${windowLabel} — nothing to report`));
    } else {
      output.writeln(output.bold(`Standup for ${who} (${windowLabel})`));
      output.writeln(formatStandup(buckets));
    }
  }
  return { success: true, exitCode: 0 };
}

export const standupCommand: Command = {
  name: 'standup',
  description:
    'Recall what you committed since your last working day (weekend-aware: Monday reaches back to Friday) — git-standup parity',
  options: [
    { name: 'all', description: 'show commits from all authors (not just you)', type: 'boolean' },
    { name: 'author', description: 'filter to a specific author (default: git config user.name)', type: 'string' },
    { name: 'days', description: 'explicit N-day window (overrides the weekend-aware default)', type: 'string' },
    { name: 'since', description: 'explicit window, e.g. 2w or "last monday" (git approxidate)', type: 'string' },
  ],
  examples: [
    { command: 'swarmdo standup', description: 'Your commits since the last working day' },
    { command: 'swarmdo standup --all --since 1w', description: "Everyone's commits in the last week" },
    { command: 'swarmdo standup --format json', description: 'Machine-readable per-day buckets' },
  ],
  action: run,
};

export default standupCommand;
