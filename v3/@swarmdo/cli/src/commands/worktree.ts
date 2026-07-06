/**
 * worktree.ts — `swarmdo worktree` — isolated git worktrees for parallel work.
 *
 *   swarmdo worktree add <name>      create .swarm/worktrees/<name> on branch swarmdo/<name>
 *   swarmdo worktree list            show managed worktrees
 *   swarmdo worktree diff <name>     changes in a worktree vs its base
 *   swarmdo worktree merge <name>    merge swarmdo/<name> into the current branch
 *   swarmdo worktree remove <name>   tear down the worktree (+ its branch)
 *
 * Engine (arg-building, porcelain parsing, name-sanitizing) lives in
 * ../worktree/worktree.ts and is unit-tested with an injected git runner.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  makeGitRunner,
  sanitizeName,
  branchFor,
  worktreeAdd,
  worktreeList,
  worktreeDiff,
  worktreeMerge,
  worktreeRemove,
  type GitRunner,
} from '../worktree/worktree.js';

function repoRoot(git: GitRunner): string | null {
  const r = git(['rev-parse', '--show-toplevel'], { allowFail: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function ctxName(ctx: CommandContext): string | undefined {
  return (ctx.flags.name as string) || ctx.args[0];
}

const addCommand: Command = {
  name: 'add',
  aliases: ['create', 'new'],
  description: 'Create an isolated git worktree + branch for parallel work',
  options: [
    { name: 'name', description: 'worktree name (or pass as the first argument)', type: 'string' },
    { name: 'base', short: 'b', description: 'base ref to branch from (default: current branch)', type: 'string' },
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const git = makeGitRunner(ctx.cwd || process.cwd());
    const root = repoRoot(git);
    if (!root) { output.printError('not a git repository'); return { success: false, exitCode: 1 }; }
    const name = sanitizeName(ctxName(ctx) ?? '');
    if (!name) { output.printError('a valid worktree name is required (letters, digits, . _ -)'); return { success: false, exitCode: 1 }; }
    try {
      const res = worktreeAdd(git, root, name, ctx.flags.base as string | undefined);
      if (ctx.flags.json === true) { output.printJson({ name, ...res }); return { success: true, data: res }; }
      output.printSuccess(`Created worktree '${name}'`);
      output.printList([
        `Path:   ${res.path}`,
        `Branch: ${res.branch} (from ${res.base})`,
        `Work:   cd ${res.path}`,
        `Later:  swarmdo worktree diff ${name} · merge ${name} · remove ${name}`,
      ]);
      return { success: true, data: res };
    } catch (e) {
      output.printError(`failed to create worktree: ${(e as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  },
};

const listCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List swarmdo-managed worktrees',
  options: [
    { name: 'all', short: 'a', description: 'include non-managed worktrees too', type: 'boolean', default: false },
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const git = makeGitRunner(ctx.cwd || process.cwd());
    if (!repoRoot(git)) { output.printError('not a git repository'); return { success: false, exitCode: 1 }; }
    const all = worktreeList(git);
    const rows = (ctx.flags.all === true ? all : all.filter((w) => w.managed));
    if (ctx.flags.json === true) { output.printJson(rows); return { success: true, data: rows }; }
    if (rows.length === 0) {
      output.printInfo(ctx.flags.all === true ? 'no worktrees' : "no managed worktrees — create one with 'swarmdo worktree add <name>'");
      return { success: true, exitCode: 0 };
    }
    output.printTable({
      columns: [
        { key: 'name', header: 'Name', width: 20 },
        { key: 'branch', header: 'Branch', width: 26 },
        { key: 'head', header: 'HEAD', width: 10 },
        { key: 'path', header: 'Path', width: 40 },
      ],
      data: rows.map((w) => ({
        name: w.name ?? (w.managed ? '?' : '(primary)'),
        branch: w.detached ? '(detached)' : (w.branch ?? '—'),
        head: w.head ? w.head.slice(0, 8) : '—',
        path: w.path,
      })),
    });
    return { success: true, data: rows };
  },
};

const diffCommand: Command = {
  name: 'diff',
  description: 'Show a worktree changes vs its base branch',
  options: [
    { name: 'name', description: 'worktree name (or first argument)', type: 'string' },
    { name: 'base', short: 'b', description: 'base ref to diff against (default: current branch)', type: 'string' },
    { name: 'stat', description: 'summary (--stat) instead of full diff', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const git = makeGitRunner(ctx.cwd || process.cwd());
    const root = repoRoot(git);
    if (!root) { output.printError('not a git repository'); return { success: false, exitCode: 1 }; }
    const name = sanitizeName(ctxName(ctx) ?? '');
    if (!name) { output.printError('a worktree name is required'); return { success: false, exitCode: 1 }; }
    const diff = worktreeDiff(git, root, name, { base: ctx.flags.base as string | undefined, stat: ctx.flags.stat === true });
    if (!diff.trim()) { output.printInfo(`worktree '${name}' has no changes vs base`); return { success: true, exitCode: 0 }; }
    output.writeln(diff);
    return { success: true, exitCode: 0 };
  },
};

const mergeCommand: Command = {
  name: 'merge',
  description: 'Merge a worktree branch into the current branch',
  options: [
    { name: 'name', description: 'worktree name (or first argument)', type: 'string' },
    { name: 'no-ff', description: 'always create a merge commit', type: 'boolean', default: false },
    { name: 'remove', description: 'remove the worktree after a clean merge', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const git = makeGitRunner(ctx.cwd || process.cwd());
    const root = repoRoot(git);
    if (!root) { output.printError('not a git repository'); return { success: false, exitCode: 1 }; }
    const name = sanitizeName(ctxName(ctx) ?? '');
    if (!name) { output.printError('a worktree name is required'); return { success: false, exitCode: 1 }; }
    const res = worktreeMerge(git, name, { noFf: ctx.flags['no-ff'] === true });
    if (!res.ok) {
      output.printError(res.conflict ? `merge of '${branchFor(name)}' hit conflicts — resolve in the current worktree, then commit` : `merge failed: ${res.output}`);
      return { success: false, exitCode: res.conflict ? 2 : 1 };
    }
    output.printSuccess(`Merged ${branchFor(name)} into the current branch`);
    if (res.output) output.writeln(output.dim(res.output));
    if (ctx.flags.remove === true) {
      const rm = worktreeRemove(git, root, name, {});
      output.printInfo(rm.ok ? `removed worktree '${name}'${rm.branchDeleted ? ' + branch' : ''}` : `worktree kept (${rm.output})`);
    }
    return { success: true, exitCode: 0 };
  },
};

const removeCommand: Command = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Remove a worktree and (unless --keep-branch) delete its branch',
  options: [
    { name: 'name', description: 'worktree name (or first argument)', type: 'string' },
    { name: 'force', short: 'f', description: 'remove even with uncommitted changes', type: 'boolean', default: false },
    { name: 'keep-branch', description: 'keep the swarmdo/<name> branch', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const git = makeGitRunner(ctx.cwd || process.cwd());
    const root = repoRoot(git);
    if (!root) { output.printError('not a git repository'); return { success: false, exitCode: 1 }; }
    const name = sanitizeName(ctxName(ctx) ?? '');
    if (!name) { output.printError('a worktree name is required'); return { success: false, exitCode: 1 }; }
    const res = worktreeRemove(git, root, name, { force: ctx.flags.force === true, keepBranch: ctx.flags['keep-branch'] === true });
    if (!res.ok) {
      output.printError(`failed to remove: ${res.output}${/use --force|not empty|contains modified/i.test(res.output) ? ' (re-run with --force to discard changes)' : ''}`);
      return { success: false, exitCode: 1 };
    }
    output.printSuccess(`Removed worktree '${name}'${res.branchDeleted ? ` and branch ${branchFor(name)}` : ''}`);
    return { success: true, exitCode: 0 };
  },
};

export const worktreeCommand: Command = {
  name: 'worktree',
  aliases: ['wt'],
  description: 'Isolated git worktrees for parallel agent/task work (add/list/diff/merge/remove)',
  subcommands: [addCommand, listCommand, diffCommand, mergeCommand, removeCommand],
  options: [],
  examples: [
    { command: 'swarmdo worktree add feature-x', description: 'Create an isolated worktree + branch' },
    { command: 'swarmdo worktree list', description: 'Show managed worktrees' },
    { command: 'swarmdo worktree diff feature-x --stat', description: 'Summarize a worktree changes' },
    { command: 'swarmdo worktree merge feature-x --remove', description: 'Merge back and tear down' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    output.writeln(output.bold('swarmdo worktree — isolated worktrees for parallel work'));
    output.printList([
      'add <name>     create .swarm/worktrees/<name> on branch swarmdo/<name>',
      'list           show managed worktrees',
      'diff <name>    changes vs base',
      'merge <name>   merge swarmdo/<name> into the current branch',
      'remove <name>  tear down worktree (+ branch)',
    ]);
    return { success: true, exitCode: 0 };
  },
};

export default worktreeCommand;
