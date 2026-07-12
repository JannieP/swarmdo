/**
 * `swarmdo commands` (alias `slash`) — a hot/cold/orphan USAGE report for the
 * project's authored `.claude/` slash-commands + subagents. `config lint` says
 * "are these valid?"; this says "are these used?" by joining defined files
 * against invocation counts mined from the local transcripts. #101.
 *
 *   swarmdo commands                # this project's authored surface
 *   swarmdo commands --all          # count invocations across every project
 *   swarmdo commands --unused       # only the cold (never-invoked) items
 *   swarmdo commands --unused --strict   # exit 1 if anything is unused (CI gate)
 *   swarmdo commands --json         # machine-readable
 *
 * Engine (../command-usage/usage.ts) is pure + fixture-tested; this thin layer
 * renders and applies the --unused/--strict policy.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { collectCommandUsage, type UsageBuckets, type CommandUsageReport } from '../command-usage/usage.js';

/** Render one domain's hot/cold/orphan buckets. `slash` prefixes command names. */
function renderBuckets(label: string, defined: number, b: UsageBuckets, slash: boolean): void {
  const nm = (n: string): string => (slash ? `/${n}` : n);
  output.writeln('');
  output.writeln(output.bold(`${label}`) + output.dim(`  (${defined} defined · ${b.hot.length} hot · ${b.cold.length} cold · ${b.orphan.length} orphan)`));
  if (b.hot.length > 0) {
    output.printTable({
      columns: [
        { key: 'name', header: 'Hot (used)', width: 34 },
        { key: 'count', header: 'Invocations', width: 12, align: 'right' },
      ],
      data: b.hot.map((h) => ({ name: nm(h.name), count: h.count.toLocaleString('en-US') })),
    });
  }
  if (b.cold.length > 0) {
    output.writeln(output.warning(`  cold (never invoked — prune candidates): `) + b.cold.map(nm).join('  '));
  }
  if (b.orphan.length > 0) {
    output.writeln(output.dim(`  orphan (invoked, not defined — builtin or typo): `) + b.orphan.map(nm).join('  '));
  }
  if (b.hot.length === 0 && b.cold.length === 0 && b.orphan.length === 0) {
    output.writeln(output.dim('  (none)'));
  }
}

/** Print only the cold (unused) items — the prune list. Returns the cold count. */
function renderUnused(report: CommandUsageReport): number {
  const coldCmds = report.commands.cold;
  const coldAgents = report.agents.cold;
  const total = coldCmds.length + coldAgents.length;
  output.writeln(output.bold('Unused (cold) authored items') + output.dim(`  (${report.scope} scope · ${report.filesScanned} transcript files)`));
  if (total === 0) {
    output.writeln(output.info('  none — every authored command and agent has been invoked 🎉'));
    return 0;
  }
  if (coldCmds.length > 0) output.writeln(`  commands: ${coldCmds.map((c) => `/${c}`).join('  ')}`);
  if (coldAgents.length > 0) output.writeln(`  agents:   ${coldAgents.join('  ')}`);
  return total;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const all = ctx.flags.all === true;
  const report = collectCommandUsage({ cwd, all });

  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify(report, null, 2));
    return { success: true, exitCode: 0 };
  }

  if (report.definedCommands === 0 && report.definedAgents === 0) {
    output.writeln(output.info('nothing authored — no .claude/commands or .claude/agents in this project'));
    return { success: true, exitCode: 0 };
  }

  if (ctx.flags.unused === true) {
    const coldCount = renderUnused(report);
    const strict = ctx.flags.strict === true;
    const exitCode = strict && coldCount > 0 ? 1 : 0;
    if (exitCode === 1) output.writeln(output.dim(`exit 1 (--strict + ${coldCount} unused)`));
    return { success: exitCode === 0, exitCode };
  }

  output.writeln(output.bold('Authored .claude/ surface — usage') + output.dim(`  (${report.scope} scope · ${report.filesScanned} transcript files)`));
  renderBuckets('Commands', report.definedCommands, report.commands, true);
  renderBuckets('Agents', report.definedAgents, report.agents, false);
  const totalCold = report.commands.cold.length + report.agents.cold.length;
  if (totalCold > 0) {
    output.writeln('');
    output.writeln(output.dim(`${totalCold} unused — see \`swarmdo commands --unused\` (add --strict for a CI gate)`));
  }
  return { success: true, exitCode: 0 };
}

export const commandsCommand: Command = {
  name: 'commands',
  aliases: ['slash'],
  description: "Usage report (hot/cold/orphan) for the project's authored .claude/ slash-commands & subagents",
  options: [
    { name: 'all', description: 'count invocations across every project (default: current project only)', type: 'boolean', default: false },
    { name: 'unused', description: 'print only the cold (never-invoked) items — the prune list', type: 'boolean', default: false },
    { name: 'strict', description: 'with --unused, exit 1 if anything is unused (CI gate)', type: 'boolean', default: false },
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
  ],
  examples: [
    { command: 'swarmdo commands', description: 'Hot/cold/orphan report for your authored .claude/ surface' },
    { command: 'swarmdo commands --unused', description: 'List slash-commands & agents you defined but never invoke' },
    { command: 'swarmdo commands --unused --strict', description: 'CI gate: fail if any authored command/agent is unused' },
    { command: 'swarmdo slash --all --json', description: 'Cross-project invocation counts as JSON (alias)' },
  ],
  action: run,
};

export default commandsCommand;
