/**
 * `swarmdo affected` — from a git diff, list the files (and the test files)
 * that a change could break, by walking codegraph's import graph. The "only run
 * what my change touches" query, à la `nx affected` / `jest --findRelatedTests`.
 *
 *   swarmdo affected                       # vs working tree (staged+unstaged)
 *   swarmdo affected --base main           # vs a ref
 *   swarmdo affected --tests               # just the test files to run
 *   swarmdo affected --tests --format json # feed a test runner
 *
 * Engine (../affected/affected.ts) is pure + tested; this captures the diff and
 * loads (or builds) the index. Composes `codegraph`.
 */

import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { computeAffected } from '../affected/affected.js';
import { loadIndex, scanRepo, saveIndex } from '../codegraph/store.js';

/** Collect changed repo-relative files: vs a base ref, or the working tree. */
function changedFiles(root: string, base: string | undefined): string[] {
  const run = (args: string[]) => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { return ''; }
  };
  let out: string;
  if (base) {
    // Everything that differs from the base ref (three-dot: since the merge-base).
    out = run(['diff', '--name-only', `${base}...`]);
    if (!out.trim()) out = run(['diff', '--name-only', base]); // fallback: two-dot
  } else {
    // Working tree: staged + unstaged + untracked.
    out = run(['diff', '--name-only', 'HEAD']);
    out += run(['ls-files', '--others', '--exclude-standard']);
  }
  return [...new Set(out.split('\n').map((l) => l.trim()).filter(Boolean))]
    // Never count swarmdo's own state dir (incl. the codegraph.json we may write).
    .filter((f) => f !== '.swarm' && !f.startsWith('.swarm/'))
    .sort();
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const base = typeof ctx.flags.base === 'string' ? ctx.flags.base : undefined;
  const testsOnly = ctx.flags.tests === true;
  const asJson = ctx.flags.format === 'json';

  const changed = changedFiles(root, base);
  if (changed.length === 0) {
    if (asJson) process.stdout.write(JSON.stringify({ changed: [], affected: [], tests: [], unknown: [] }, null, 2) + '\n');
    else output.writeln(output.dim(base ? `no changes vs ${base}` : 'no working-tree changes'));
    return { success: true, exitCode: 0 };
  }

  // Prefer a saved codegraph index; build a fresh one if absent.
  let index = loadIndex(root);
  if (!index) {
    index = scanRepo(root);
    try { saveIndex(root, index); } catch { /* read-only fs — fine, we have it in memory */ }
  }

  const result = computeAffected(changed, index);
  const list = testsOnly ? result.tests : result.affected;

  if (asJson) {
    process.stdout.write(JSON.stringify({ changed, ...result }, null, 2) + '\n');
  } else if (testsOnly) {
    // Plain list on stdout so it pipes straight into a test runner.
    if (list.length) process.stdout.write(list.join('\n') + '\n');
    process.stderr.write(output.dim(`${result.tests.length} affected test file(s) from ${changed.length} changed\n`));
  } else {
    output.writeln(output.bold(`Affected by ${changed.length} changed file(s)${base ? ` vs ${base}` : ''}:`));
    for (const f of list) output.writeln(`  ${f}`);
    output.writeln(output.dim(`${result.affected.length} affected · ${result.tests.length} test file(s)${result.unknown.length ? ` · ${result.unknown.length} not in index` : ''}`));
  }
  return { success: true, exitCode: 0 };
}

export const affectedCommand: Command = {
  name: 'affected',
  description: 'List files (and test files) a change could break, via the import graph — run only the tests your diff impacts (nx/turbo-style)',
  options: [
    { name: 'base', description: 'diff against a git ref (e.g. main); default is the working tree', type: 'string' },
    { name: 'tests', description: 'output only the affected test files (one per line, for a test runner)', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo affected --base main', description: 'Files impacted since branching from main' },
    { command: 'swarmdo affected --tests | xargs vitest run', description: 'Run only the tests your change affects' },
  ],
  action: run,
};

export default affectedCommand;
