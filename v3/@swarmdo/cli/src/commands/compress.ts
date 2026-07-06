/**
 * V3 CLI Compress Command
 *
 * `swarmdo compress <file>` — caveman token compression from any terminal,
 * no Claude Code session required. Thin wrapper over the vendored
 * caveman-compress pipeline (detect → compress via Claude → validate →
 * backup). Uses ANTHROPIC_API_KEY when set, else falls back to the local
 * `claude --print` CLI for auth. `--check` runs only the token-free
 * detection step.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';

/** Locate the bundled caveman-compress skill dir (has scripts/__main__.py). */
export function resolveSkillDir(cwd: string = process.cwd()): string | null {
  const pkgSkills = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.claude', 'skills');
  const candidates = [
    // project initialized with `swarmdo init` (sdo- namespaced since v1.4.0)
    path.join(cwd, '.claude', 'skills', 'sdo-caveman-compress'),
    path.join(cwd, '.claude', 'skills', 'caveman-compress'), // pre-1.4.0 install
    // bundled with @swarmdo/cli (dist/src/commands -> package root/.claude)
    path.join(pkgSkills, 'sdo-caveman-compress'),
    // monorepo plugin source
    path.join(cwd, 'plugins', 'swarmdo-caveman', 'skills', 'sdo-caveman-compress'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'scripts', '__main__.py'))) return c;
  }
  return null;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const target = ctx.args[0];
  if (!target) {
    output.writeln(output.error('Usage: swarmdo compress <file> [--check]'));
    return { success: false, exitCode: 1 };
  }
  const file = path.resolve(cwd, target);
  if (!fs.existsSync(file)) {
    output.writeln(output.error(`File not found: ${file}`));
    return { success: false, exitCode: 1 };
  }
  const skillDir = resolveSkillDir(cwd);
  if (!skillDir) {
    output.writeln(output.error(
      'caveman-compress skill not found. Run `swarmdo init` (efficiency skills) or install the swarmdo-caveman plugin.'
    ));
    return { success: false, exitCode: 1 };
  }

  if (ctx.flags.check) {
    // Token-free: detection only.
    const py = [
      'import sys; sys.path.insert(0, sys.argv[1])',
      'from pathlib import Path',
      'from scripts.detect import detect_file_type, should_compress',
      'p = Path(sys.argv[2])',
      "print(f'type: {detect_file_type(p)}')",
      "print(f'compressible: {should_compress(p)}')",
    ].join('\n');
    const r = spawnSync('python3', ['-c', py, skillDir, file], { encoding: 'utf8', timeout: 30_000 });
    if (r.status !== 0) {
      output.writeln(output.error(r.stderr?.trim() || 'detection failed'));
      return { success: false, exitCode: 1 };
    }
    output.writeln(r.stdout.trimEnd());
    return { success: true, exitCode: 0 };
  }

  output.writeln(output.dim(`pipeline: ${skillDir}`));
  const r = spawnSync('python3', ['-m', 'scripts', file], {
    cwd: skillDir,
    stdio: 'inherit',
    timeout: 600_000,
  });
  return { success: r.status === 0, exitCode: r.status ?? 1 };
}

export const compressCommand: Command = {
  name: 'compress',
  description: 'Caveman-compress a memory file to save tokens (substance preserved, backup kept)',
  options: [
    { name: 'check', description: 'Detection only — report file type and compressibility, no tokens spent', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo compress CLAUDE.md', description: 'Compress a memory file (backup saved as CLAUDE.original.md)' },
    { command: 'swarmdo compress notes.md --check', description: 'Just report whether the file would compress' },
  ],
  action: run,
};

export default compressCommand;
