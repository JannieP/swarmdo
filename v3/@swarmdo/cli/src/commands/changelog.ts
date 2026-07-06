/**
 * changelog.ts — `swarmdo changelog` — release notes from conventional commits.
 *
 *   swarmdo changelog                          notes since the last tag → stdout
 *   swarmdo changelog --version v1.4.0 --out NOTES.md
 *   swarmdo changelog --from v1.2.0 --to v1.3.0 --all
 *
 * Feeds swarmdo's release flow:  gh release create v1.4.0 --notes-file NOTES.md
 * Engine (parse/group/render) lives in ../changelog/changelog.ts and is pure.
 */

import * as fs from 'node:fs';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  makeGitRunner,
  lastTag,
  repoUrlFromGit,
  collectCommits,
  renderChangelog,
  type GitRunner,
} from '../changelog/changelog.js';

function isRepo(git: GitRunner): boolean {
  try { git(['rev-parse', '--git-dir']); return true; } catch { return false; }
}

export const changelogCommand: Command = {
  name: 'changelog',
  aliases: ['notes', 'release-notes'],
  description: 'Generate release notes from conventional commits (since the last tag by default)',
  options: [
    { name: 'from', short: 'f', type: 'string', description: 'start ref (default: most recent tag)' },
    { name: 'to', short: 't', type: 'string', description: 'end ref (default: HEAD)' },
    { name: 'range', type: 'string', description: 'explicit range a..b (overrides --from/--to)' },
    { name: 'version', short: 'v', type: 'string', description: 'release title (e.g. v1.4.0)' },
    { name: 'out', short: 'o', type: 'string', description: 'write to this file instead of stdout' },
    { name: 'all', short: 'a', type: 'boolean', description: 'include chore/test/ci/build/style + non-conventional commits', default: false },
    { name: 'no-links', type: 'boolean', description: 'omit GitHub commit links', default: false },
    { name: 'date', type: 'string', description: 'override the date shown in the title (default: today)' },
  ],
  examples: [
    { command: 'swarmdo changelog', description: 'Release notes since the last tag' },
    { command: 'swarmdo changelog --version v1.4.0 --out NOTES.md', description: 'Write notes for a release' },
    { command: 'swarmdo changelog --from v1.2.0 --to v1.3.0 --all', description: 'Full notes for a past range' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const git = makeGitRunner(ctx.cwd || process.cwd());
    if (!isRepo(git)) { output.printError('not a git repository'); return { success: false, exitCode: 1 }; }

    let range: string;
    if (typeof ctx.flags.range === 'string' && ctx.flags.range) {
      range = ctx.flags.range;
    } else {
      const to = (ctx.flags.to as string) || 'HEAD';
      const from = (ctx.flags.from as string) || lastTag(git) || '';
      range = from ? `${from}..${to}` : to;
    }

    let commits;
    try {
      commits = collectCommits(range, git);
    } catch (e) {
      output.printError(`git log failed for range '${range}': ${(e as Error).message}`);
      return { success: false, exitCode: 1 };
    }

    const repoUrl = ctx.flags['no-links'] === true ? undefined : (repoUrlFromGit(git) ?? undefined);
    const date = (ctx.flags.date as string) || new Date().toISOString().slice(0, 10);
    const version = (ctx.flags.version as string) || range;
    const md = renderChangelog(commits, { version, date, repoUrl, includeAll: ctx.flags.all === true });

    const outFile = ctx.flags.out as string | undefined;
    if (outFile) {
      try {
        fs.writeFileSync(outFile, md.endsWith('\n') ? md : `${md}\n`, 'utf8');
      } catch (e) {
        output.printError(`failed to write ${outFile}: ${(e as Error).message}`);
        return { success: false, exitCode: 1 };
      }
      output.printSuccess(`Wrote ${commits.length} commit(s) of release notes → ${outFile}`);
      return { success: true, data: { file: outFile, commits: commits.length, range } };
    }
    output.writeln(md);
    return { success: true, data: { commits: commits.length, range } };
  },
};

export default changelogCommand;
