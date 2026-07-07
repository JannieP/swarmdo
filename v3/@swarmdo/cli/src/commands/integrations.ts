/**
 * integrations.ts — `swarmdo integrations` (alias `integrate`)
 *
 * Wire swarmdo into agent CLIs beyond Claude Code: Codex CLI, GitHub
 * Copilot CLI, pi. Dry-run by default; `--apply` writes. All merges are
 * additive + idempotent (pure engine in ../integrations/integrations.js).
 *
 * NEVER writes `.claude/**`, `.mcp.json`, or `CLAUDE.md` — the Claude Code
 * integration is owned by `swarmdo init` and only read for status.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  mergeCodexToml,
  mergeCopilotMcpJson,
  crossAgentAgentsMd,
  copilotInstructionsMd,
  evaluateStatus,
  INSTALLABLE,
  type IntegrationTarget,
} from '../integrations/integrations.js';

function readOrNull(p: string): string | null {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

interface PlannedWrite { file: string; kind: 'create' | 'update'; content: string }

function planFor(target: IntegrationTarget, cwd: string, home: string): { writes: PlannedWrite[]; notes: string[] } {
  const writes: PlannedWrite[] = [];
  const notes: string[] = [];
  const agentsPath = path.join(cwd, 'AGENTS.md');
  const ensureAgentsMd = (): void => {
    if (readOrNull(agentsPath) === null) {
      writes.push({ file: agentsPath, kind: 'create', content: crossAgentAgentsMd() });
    } else {
      notes.push('AGENTS.md already exists — left untouched (teams own their AGENTS.md)');
    }
  };
  switch (target) {
    case 'codex': {
      ensureAgentsMd();
      const tomlPath = path.join(home, '.codex', 'config.toml');
      const merged = mergeCodexToml(readOrNull(tomlPath));
      if (merged.changed) writes.push({ file: tomlPath, kind: readOrNull(tomlPath) === null ? 'create' : 'update', content: merged.content });
      else notes.push('~/.codex/config.toml already has [mcp_servers.swarmdo]');
      break;
    }
    case 'copilot': {
      ensureAgentsMd();
      const instrPath = path.join(cwd, '.github', 'copilot-instructions.md');
      if (readOrNull(instrPath) === null) writes.push({ file: instrPath, kind: 'create', content: copilotInstructionsMd() });
      else notes.push('.github/copilot-instructions.md already exists — left untouched');
      const jsonPath = path.join(home, '.copilot', 'mcp-config.json');
      const merged = mergeCopilotMcpJson(readOrNull(jsonPath));
      if (merged.changed) writes.push({ file: jsonPath, kind: readOrNull(jsonPath) === null ? 'create' : 'update', content: merged.content });
      else notes.push('~/.copilot/mcp-config.json already has the swarmdo server (or is unparseable — never clobbered)');
      break;
    }
    case 'pi': {
      ensureAgentsMd();
      notes.push('pi reads AGENTS.md natively; if your pi build supports MCP servers, point it at: npx -y swarmdo@latest mcp start');
      break;
    }
    case 'claude':
      notes.push('Claude Code integration is managed by `swarmdo init` — nothing to install here (read-only status)');
      break;
  }
  return { writes, notes };
}

export const integrationsCommand: Command = {
  name: 'integrations',
  aliases: ['integrate'],
  description: 'Wire swarmdo into other agent CLIs (codex, copilot, pi) via AGENTS.md + MCP — never touches the Claude Code surfaces',
  options: [
    { name: 'apply', type: 'boolean', description: 'write the changes (default: preview)', default: false },
    { name: 'json', type: 'boolean', description: 'machine-readable output', default: false },
  ],
  examples: [
    { command: 'swarmdo integrations', description: 'Status of every CLI integration' },
    { command: 'swarmdo integrations install all --apply', description: 'Wire codex + copilot + pi' },
    { command: 'swarmdo integrations install codex --apply', description: 'AGENTS.md + [mcp_servers.swarmdo] in ~/.codex/config.toml' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const home = os.homedir();
    const sub = (ctx.args[0] || 'status').toLowerCase();

    const gatherStatus = (): ReturnType<typeof evaluateStatus> => evaluateStatus({
      agentsMd: readOrNull(path.join(cwd, 'AGENTS.md')),
      codexToml: readOrNull(path.join(home, '.codex', 'config.toml')),
      copilotJson: readOrNull(path.join(home, '.copilot', 'mcp-config.json')),
      copilotInstructions: readOrNull(path.join(cwd, '.github', 'copilot-instructions.md')),
      claudeMcpJson: readOrNull(path.join(cwd, '.mcp.json')),
      claudeUserJson: readOrNull(path.join(home, '.claude.json')),
      claudeDirExists: fs.existsSync(path.join(cwd, '.claude')),
    });

    if (sub === 'status' || sub === 'list') {
      const statuses = gatherStatus();
      if (ctx.flags.json === true) { output.printJson(statuses); return { success: true, data: statuses }; }
      output.writeln(output.bold('Agent CLI integrations'));
      for (const s of statuses) {
        output.writeln(`  ${s.ok ? '◉' : '○'} ${s.target}`);
        for (const d of s.details) output.writeln(output.dim(`      ${d}`));
      }
      output.writeln(output.dim('install:  swarmdo integrations install <codex|copilot|pi|all> --apply'));
      return { success: true };
    }

    if (sub !== 'install') {
      output.printError(`unknown subcommand "${sub}" (expected status|install)`);
      return { success: false, exitCode: 1 };
    }

    const rawTarget = (ctx.args[1] || '').toLowerCase();
    const targets: IntegrationTarget[] = rawTarget === 'all'
      ? INSTALLABLE
      : (INSTALLABLE as string[]).includes(rawTarget) ? [rawTarget as IntegrationTarget] : [];
    if (targets.length === 0) {
      output.printError(`install what? (${INSTALLABLE.join('|')}|all) — claude is managed by \`swarmdo init\``);
      return { success: false, exitCode: 1 };
    }

    const allWrites: PlannedWrite[] = [];
    for (const t of targets) {
      const { writes, notes } = planFor(t, cwd, home);
      output.writeln(output.bold(`▸ ${t}`));
      for (const w of writes) {
        // safety invariant: never under .claude/, never .mcp.json, never CLAUDE.md
        const rel = path.relative(cwd, w.file);
        if (rel.startsWith('.claude') || rel === '.mcp.json' || rel === 'CLAUDE.md') {
          output.printError(`refusing to touch Claude Code surface: ${w.file}`);
          return { success: false, exitCode: 1 };
        }
        output.writeln(`    ${w.kind === 'create' ? '+' : '~'} ${w.file}`);
        allWrites.push(w);
      }
      for (const n of notes) output.writeln(output.dim(`    · ${n}`));
    }

    if (ctx.flags.apply !== true) {
      output.writeln('');
      output.writeln(output.dim(`dry run — ${allWrites.length} write(s) planned; re-run with --apply`));
      return { success: true, data: { dryRun: true, writes: allWrites.map((w) => w.file) } };
    }
    for (const w of allWrites) {
      fs.mkdirSync(path.dirname(w.file), { recursive: true });
      fs.writeFileSync(w.file, w.content, 'utf8');
    }
    output.printSuccess(`applied ${allWrites.length} write(s)`);
    output.writeln(output.dim('restart the target CLI(s) to pick up MCP config changes'));
    return { success: true, data: { applied: allWrites.map((w) => w.file) } };
  },
};

export default integrationsCommand;
