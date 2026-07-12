/**
 * permissions.ts — `swarmdo permissions` (alias `perms`) — audit Claude Code
 * permission rules for conflicts, dead/shadowed rules, and over-broad grants.
 *
 * Complements `config lint` (which validates the hooks block): this reads the
 * `permissions.allow` / `deny` / `ask` arrays from `.claude/settings.json` +
 * `settings.local.json` (+ `~/.claude/settings.json` with `--global`), merges
 * them into the effective ruleset Claude Code enforces, and runs the pure
 * permissions/audit.ts analyzer. Read-only — never edits settings.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { auditPermissions, type PermissionSets } from '../permissions/audit.js';

const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Extract permissions.allow/deny/ask from a settings file, or null if none. */
function readPerms(file: string): PermissionSets | null {
  try {
    if (!existsSync(file)) return null;
    const obj = JSON.parse(readFileSync(file, 'utf8')) as { permissions?: unknown };
    const perm = obj?.permissions as { allow?: unknown; deny?: unknown; ask?: unknown } | undefined;
    if (!perm || typeof perm !== 'object') return null;
    const sets = { allow: strArray(perm.allow), deny: strArray(perm.deny), ask: strArray(perm.ask) };
    return sets.allow.length + sets.deny.length + sets.ask.length > 0 ? sets : null;
  } catch {
    return null;
  }
}

export const permissionsCommand: Command = {
  name: 'permissions',
  aliases: ['perms'],
  description: 'Audit Claude Code permission rules (allow/deny/ask) for conflicts, dead/shadowed rules, and over-broad grants',
  options: [
    { name: 'global', description: 'Also include ~/.claude/settings.json', type: 'boolean' },
    { name: 'strict', description: 'Exit 1 if any error-severity finding (CI gate)', type: 'boolean' },
    { name: 'json', description: 'Machine-readable output', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo permissions', description: "Audit this project's permission rules" },
    { command: 'swarmdo permissions --global --strict', description: 'Include user-global settings; fail on conflicts' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const files = [join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json')];
    if (ctx.flags.global === true) files.push(join(homedir(), '.claude', 'settings.json'));

    const used: string[] = [];
    const merged: PermissionSets = { allow: [], deny: [], ask: [] };
    for (const file of files) {
      const p = readPerms(file);
      if (!p) continue;
      used.push(file);
      merged.allow!.push(...(p.allow ?? []));
      merged.deny!.push(...(p.deny ?? []));
      merged.ask!.push(...(p.ask ?? []));
    }

    const totalRules = merged.allow!.length + merged.deny!.length + merged.ask!.length;
    if (used.length === 0) {
      if (ctx.flags.json === true) output.printJson({ files: [], rules: 0, findings: [] });
      else output.printInfo('No permission rules found in .claude/settings*.json.');
      return { success: true };
    }

    const findings = auditPermissions(merged);
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warns = findings.filter((f) => f.severity === 'warn').length;

    if (ctx.flags.json === true) {
      output.printJson({ files: used, rules: totalRules, findings });
    } else if (findings.length === 0) {
      output.printSuccess(`permissions audit: ${totalRules} rule(s) across ${used.length} file(s) — no issues`);
    } else {
      const icon = (s: string): string => (s === 'error' ? '✖' : s === 'warn' ? '⚠' : '·');
      output.writeln(output.bold('Permission audit') + output.dim(`  (${totalRules} rules, ${used.length} file${used.length === 1 ? '' : 's'})`));
      for (const x of findings) output.writeln(`  ${icon(x.severity)} ${output.dim(`[${x.rule}]`)} ${x.message}`);
      output.writeln('');
      output.writeln(`${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}, ${findings.length - errors - warns} info`);
    }

    const failed = ctx.flags.strict === true && errors > 0;
    return { success: !failed, exitCode: failed ? 1 : 0, data: { rules: totalRules, findings } };
  },
};

export default permissionsCommand;
