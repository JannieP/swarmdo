/**
 * V3 CLI Efficiency Command
 *
 * `swarmdo efficiency on|off|status` — toggle the vendored efficiency skills
 * (caveman-compress + ponytail) in the current project after init. `on`
 * copies the bundled skill dirs into ./.claude/skills, `off` removes exactly
 * those two dirs, `status` reports every toggle surface (skills, ponytail
 * agent env, plugins).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';

// v1.4.0: all swarmdo skills carry the sdo- prefix so they group together in
// Claude Code's `/` menu (/sdo-caveman-compress, /sdo-ponytail).
export const EFFICIENCY_SKILLS = ['sdo-caveman-compress', 'sdo-ponytail'] as const;

/** Pre-1.4.0 unprefixed installs, cleaned up on `on`/`off`. */
const LEGACY_EFFICIENCY_SKILLS = ['caveman-compress', 'ponytail'] as const;

/** Bundled skill sources: cli package .claude/skills, else monorepo plugins. */
export function resolveBundledSkill(name: string, cwd: string): string | null {
  const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const candidates = [
    path.join(pkgRoot, '.claude', 'skills', name),
    path.join(cwd, 'plugins', name.includes('ponytail') ? 'swarmdo-ponytail' : 'swarmdo-caveman', 'skills', name),
  ];
  for (const c of candidates) if (fs.existsSync(path.join(c, 'SKILL.md'))) return c;
  return null;
}

function skillState(cwd: string): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const s of EFFICIENCY_SKILLS) {
    state[s] = fs.existsSync(path.join(cwd, '.claude', 'skills', s, 'SKILL.md'));
  }
  return state;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const action = (ctx.args[0] || 'status').toLowerCase();
  const dest = path.join(cwd, '.claude', 'skills');

  if (action === 'on') {
    for (const legacy of LEGACY_EFFICIENCY_SKILLS) {
      // v1.4.0 migration: replace pre-namespace installs
      const old = path.join(dest, legacy);
      if (fs.existsSync(old)) fs.rmSync(old, { recursive: true, force: true });
    }
    for (const s of EFFICIENCY_SKILLS) {
      const src = resolveBundledSkill(s, cwd);
      if (!src) {
        output.writeln(output.error(`bundled skill not found: ${s}`));
        return { success: false, exitCode: 1 };
      }
      fs.cpSync(src, path.join(dest, s), { recursive: true });
      output.writeln(output.success(`✓ ${s} → .claude/skills/${s}`));
    }
    output.writeln(output.dim('skills are user-invoked (/sdo-caveman-compress, /sdo-ponytail) — on = available, never automatic'));
    return { success: true, exitCode: 0 };
  }

  if (action === 'off') {
    for (const s of [...EFFICIENCY_SKILLS, ...LEGACY_EFFICIENCY_SKILLS]) {
      const dir = path.join(dest, s);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        output.writeln(output.success(`✓ removed .claude/skills/${s}`));
      } else if ((EFFICIENCY_SKILLS as readonly string[]).includes(s)) {
        output.writeln(output.dim(`  ${s}: already off`));
      }
    }
    return { success: true, exitCode: 0 };
  }

  // status
  const state = skillState(cwd);
  for (const [s, on] of Object.entries(state)) {
    output.writeln(`  ${on ? '◉ on ' : '○ off'}  /${s}`);
  }
  const env = process.env.SWARMDO_PONYTAIL || '(unset)';
  output.writeln(`  ponytail agent persona: SWARMDO_PONYTAIL=${env}${env === '(unset)' ? ' — per-call via ponytail:true on agent_run/agent_execute' : ''}`);
  output.writeln(output.dim('  toggle: swarmdo efficiency on|off · wizard: init "Efficiency" group · plugins: swarmdo-caveman / swarmdo-ponytail'));
  return { success: true, exitCode: 0 };
}

export const efficiencyCommand: Command = {
  name: 'efficiency',
  description: 'Toggle the caveman-compress + ponytail skills in this project (on|off|status)',
  examples: [
    { command: 'swarmdo efficiency status', description: 'Show which efficiency features are active' },
    { command: 'swarmdo efficiency off', description: 'Remove both skills from this project' },
    { command: 'swarmdo efficiency on', description: 'Re-add both skills to this project' },
  ],
  action: run,
};

export default efficiencyCommand;
