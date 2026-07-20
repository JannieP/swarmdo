/**
 * obsidian.ts — `swarmdo obsidian on|off|status`
 *
 * Toggles the dual-plane Obsidian memory integration for this project.
 *   on     record the toggle + vault path in swarmdo.config.json, then export
 *          the current memory into that vault (one note per entry + INDEX.md).
 *   off    flip the flag off (vault files are kept on disk).
 *   status show whether it's on + the vault path + note count.
 *
 * After `on`, edit notes in Obsidian and sync back with
 *   swarmdo memory import -i <vault> -f obsidian [--watch]
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { loadProjectConfig, setToggle, toggleEnabled, toggleField } from '../config/project-toggles.js';

const DEFAULT_VAULT = 'vault';

function countNotes(vaultAbs: string): number {
  try {
    return (fs.readdirSync(vaultAbs, { recursive: true }) as string[])
      .filter((f) => f.endsWith('.md') && path.basename(f) !== 'INDEX.md').length;
  } catch {
    return 0;
  }
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const action = (ctx.args[0] || 'status').toLowerCase();
  const vault = (ctx.flags.vault as string) || toggleField('obsidian', 'vault', cwd) || DEFAULT_VAULT;
  const vaultAbs = path.isAbsolute(vault) ? vault : path.join(cwd, vault);

  if (action === 'on') {
    setToggle('obsidian', true, { vault }, cwd);
    output.printSuccess(`Obsidian integration ON — vault: ${vault}/`);
    // Populate the vault via the same CLI (decoupled — no re-implementation of the exporter).
    try {
      execFileSync(process.execPath, [process.argv[1], 'memory', 'export', '-o', vaultAbs, '-f', 'obsidian'], {
        stdio: 'ignore',
      });
      output.writeln(`  exported ${countNotes(vaultAbs)} notes → ${vault}/`);
    } catch (e) {
      output.writeln(output.dim(`  (initial export skipped: ${(e as Error).message.slice(0, 70)})`));
    }
    output.writeln(output.dim('  edit notes in Obsidian, then sync back:'));
    output.writeln(`    swarmdo memory import -i ${vault} -f obsidian --watch`);
    return { success: true, exitCode: 0 };
  }

  if (action === 'off') {
    setToggle('obsidian', false, {}, cwd);
    output.printSuccess('Obsidian integration OFF (vault files kept)');
    return { success: true, exitCode: 0 };
  }

  // status
  const on = toggleEnabled('obsidian', cwd);
  output.writeln(`  ${on ? '◉ on ' : '○ off'}  Obsidian memory integration`);
  if (on) {
    if (fs.existsSync(vaultAbs)) output.writeln(`         vault: ${vault}/ (${countNotes(vaultAbs)} notes)`);
    else output.writeln(`         vault: ${vault}/ — not exported yet (swarmdo memory export -o ${vault} -f obsidian)`);
  }
  output.writeln(output.dim('  toggle: swarmdo obsidian on|off  ·  sync: swarmdo memory import -i <vault> -f obsidian [--watch]'));
  return { success: true, exitCode: 0 };
}

export const obsidianCommand: Command = {
  name: 'obsidian',
  description: 'Toggle the dual-plane Obsidian memory integration for this project (on|off|status)',
  options: [
    { name: 'vault', short: 'v', description: 'Vault directory (default: ./vault)', type: 'string' },
  ],
  examples: [
    { command: 'swarmdo obsidian on', description: 'Enable + export memory to an Obsidian vault' },
    { command: 'swarmdo obsidian status', description: 'Show whether Obsidian integration is on + vault info' },
    { command: 'swarmdo obsidian off', description: 'Disable (vault files kept)' },
  ],
  action: run,
};

export default obsidianCommand;
