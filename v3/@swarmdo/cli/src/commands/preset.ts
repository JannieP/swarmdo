/**
 * preset.ts — `swarmdo preset` — named capability tiers for init.
 *
 *   swarmdo preset list                recommended ladder, leanest → everything
 *   swarmdo preset info <name>         what a tier enables + when to use it
 *   swarmdo preset info efficiency     how to use the caveman + ponytail integrations
 *   swarmdo preset show <name> --json  the raw InitOptions a tier applies
 *
 * Apply a tier at init time with:  swarmdo init --preset <name>
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { SWARMDO_PRESETS, resolvePreset, presetNames, deriveHighlights } from '../init/presets.js';

const yn = (b: boolean): string => (b ? output.info('on') : output.dim('off'));

const listCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the configuration presets (leanest → everything)',
  options: [{ name: 'json', type: 'boolean', description: 'machine-readable output', default: false }],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    if (ctx.flags.json === true) {
      output.printJson(SWARMDO_PRESETS.map((p) => ({ name: p.name, tier: p.tier, recommended: p.recommended, summary: p.summary, highlights: deriveHighlights(p.options) })));
      return { success: true };
    }
    output.writeln(output.bold('swarmdo configuration presets') + output.dim('  (apply with: swarmdo init --preset <name>)'));
    output.writeln();
    output.printTable({
      columns: [
        { key: 'tier', header: 'Tier', width: 5, align: 'right' },
        { key: 'name', header: 'Preset', width: 12 },
        { key: 'agents', header: 'Agents', width: 7, align: 'right' },
        { key: 'ml', header: 'ML', width: 4 },
        { key: 'summary', header: 'What you get', width: 60 },
      ],
      data: SWARMDO_PRESETS.map((p) => {
        const h = deriveHighlights(p.options);
        return {
          tier: String(p.tier),
          name: p.recommended ? `${p.name} ★` : p.name,
          agents: String(h.maxAgents),
          ml: h.memoryIntelligence ? '✓' : '—',
          summary: p.summary,
        };
      }),
    });
    output.writeln(output.dim('★ = recommended default · ML = HNSW + neural + embeddings substrate'));
    output.writeln(output.dim('details:  swarmdo preset info <name>   ·   efficiency skills:  swarmdo preset info efficiency'));
    return { success: true };
  },
};

function renderPresetInfo(name: string): CommandResult {
  const p = resolvePreset(name);
  if (!p) {
    output.printError(`unknown preset '${name}' (choose from: ${presetNames().join(', ')}, or 'efficiency')`);
    return { success: false, exitCode: 1 };
  }
  const h = deriveHighlights(p.options);
  output.writeln(output.bold(`${p.title}`) + output.dim(`  — tier ${p.tier}${p.recommended ? ' · recommended default' : ''}`));
  output.writeln();
  output.writeln(p.summary);
  output.writeln();
  output.writeln(output.bold('When to use'));
  output.writeln(`  ${p.whenToUse}`);
  output.writeln();
  output.writeln(output.bold('What it enables'));
  output.printList([
    `Topology:            ${h.topology}`,
    `Max agents:          ${h.maxAgents}`,
    `Memory backend:      ${h.memory}`,
    `Vector intelligence: ${yn(h.memoryIntelligence)} ${output.dim('(HNSW + neural + ONNX embeddings)')}`,
    `Skill sets:          ${h.skills.join(', ')}`,
    `Agent sets:          ${h.agentSets.join(', ')}`,
    `Dual-mode (Codex):   ${yn(h.dualMode)}`,
    `swarmdo-swarm MCP:   ${yn(h.mcpSwarm)}`,
  ]);
  output.writeln();
  output.writeln(output.dim(`apply:  swarmdo init --preset ${p.name}      raw options:  swarmdo preset show ${p.name} --json`));
  return { success: true, data: { name: p.name, highlights: h } };
}

/** The caveman + ponytail integration guide — how to use the efficiency skills
 * from inside Claude Code. Shown by `swarmdo preset info efficiency`. */
function renderEfficiencyGuide(): CommandResult {
  const B = (s: string): string => output.bold(s);
  output.writeln(B('Efficiency integrations — caveman & ponytail'));
  output.writeln(output.dim('Two vendored skill packs (MIT). Both are user-invoked — available, never automatic.'));
  output.writeln();
  output.writeln(B('Toggle for this project'));
  output.printList([
    'swarmdo efficiency status   — show what is active (skills, ponytail persona/env)',
    'swarmdo efficiency on        — add both skill packs to ./.claude/skills',
    'swarmdo efficiency off       — remove them',
    'At init:  swarmdo init  → "Efficiency" skill group (on by default in every preset)',
  ]);
  output.writeln();
  output.writeln(B('🦴 caveman — token compression') + output.dim('  (JuliusBrussee/caveman)'));
  output.writeln('  Cuts INPUT tokens by rewriting memory files into caveman-speak — all code,');
  output.writeln('  URLs, and structure preserved. From Claude Code, type these slash commands:');
  output.printList([
    '/sdo-caveman-compress <file>  — compress a memory file (CLAUDE.md, todos, prefs).',
    '                                Overwrites it; keeps <file>.original.md as a backup.',
    '/sdo-caveman                  — speak compressed for the rest of the session.',
    'sdo-cavecrew                  — run a compressed multi-agent crew.',
    'sdo-caveman-stats             — measure the tokens saved.',
  ]);
  output.writeln(output.dim('  Reverse it by restoring <file>.original.md. Also: swarmdo compress.'));
  output.writeln();
  output.writeln(B('🎯 ponytail — anti-over-engineering') + output.dim('  (DietrichGebert/ponytail)'));
  output.writeln('  Channels a lazy senior dev on coding tasks: YAGNI, standard library before');
  output.writeln('  custom code, native features before dependencies, one line before fifty.');
  output.printList([
    '/sdo-ponytail [lite|full|ultra]  — engage on the current task (default: full).',
    '                                   Stays active every response until "stop ponytail".',
    'sdo-ponytail-audit               — score a codebase for over-engineering.',
    'sdo-ponytail-review              — apply the lens to a diff.',
    'sdo-ponytail-debt / sdo-ponytail-gain — track simplicity debt and wins.',
  ]);
  output.writeln(output.dim('  For swarm agents (agent_run / agent_execute): pass ponytail:true per call,'));
  output.writeln(output.dim('  or set SWARMDO_PONYTAIL=1 to make the persona the default for every agent.'));
  output.writeln();
  output.writeln(output.dim('Every preset ships both skill packs enabled. Turn them off with: swarmdo efficiency off'));
  return { success: true };
}

const infoCommand: Command = {
  name: 'info',
  aliases: ['show-info', 'explain'],
  description: 'Explain a preset (or "efficiency" for the caveman + ponytail guide)',
  options: [{ name: 'name', type: 'string', description: 'preset name, or "efficiency"' }],
  examples: [
    { command: 'swarmdo preset info standard', description: 'What the standard tier enables' },
    { command: 'swarmdo preset info efficiency', description: 'How to use caveman + ponytail from Claude Code' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const name = ((ctx.flags.name as string) || ctx.args[0] || '').toLowerCase();
    if (!name) {
      output.printError(`name required: a preset (${presetNames().join(', ')}) or 'efficiency'`);
      return { success: false, exitCode: 1 };
    }
    if (['efficiency', 'caveman', 'ponytail', 'skills'].includes(name)) return renderEfficiencyGuide();
    return renderPresetInfo(name);
  },
};

const showCommand: Command = {
  name: 'show',
  description: 'Print the raw InitOptions a preset applies',
  options: [
    { name: 'name', type: 'string', description: 'preset name' },
    { name: 'json', type: 'boolean', description: 'JSON output', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const name = (ctx.flags.name as string) || ctx.args[0] || '';
    const p = resolvePreset(name);
    if (!p) {
      output.printError(`unknown preset '${name}' (choose from: ${presetNames().join(', ')})`);
      return { success: false, exitCode: 1 };
    }
    output.printJson(p.options);
    return { success: true, data: p.options };
  },
};

export const presetCommand: Command = {
  name: 'preset',
  aliases: ['presets'],
  description: 'Named configuration tiers for init (list / info / show) + the efficiency-skills guide',
  subcommands: [listCommand, infoCommand, showCommand],
  options: [],
  examples: [
    { command: 'swarmdo preset list', description: 'The preset ladder, leanest → everything' },
    { command: 'swarmdo preset info basic', description: 'What the default tier enables' },
    { command: 'swarmdo preset info efficiency', description: 'Caveman + ponytail usage from Claude Code' },
    { command: 'swarmdo init --preset standard', description: 'Initialize a project with a preset' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // bare `swarmdo preset` → show the list
    return (await listCommand.action!(ctx)) ?? { success: true, exitCode: 0 };
  },
};

export default presetCommand;
