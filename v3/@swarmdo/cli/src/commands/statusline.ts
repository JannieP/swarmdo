/**
 * V3 CLI Statusline Command
 *
 * Interactive configuration for the swarmdo statusline. The generated
 * statusline script (.claude/helpers/statusline.cjs) resolves its segments at
 * render time from SWARMDO_STATUSLINE or .swarmdo/statusline.json — this
 * command is the friendly writer for that config: pick a preset, or choose
 * "Custom" to tick exactly the segments you want from a checklist.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { select, multiSelect, confirm } from '../prompt.js';

/** Every segment the generated statusline can render, in display order. */
export const STATUSLINE_SEGMENTS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'version',      label: 'Version badge',      hint: 'the "▊ Swarmdo Vx.y.z" prefix' },
  { value: 'project',      label: 'Project name',       hint: 'workspace/repo name with activity dot' },
  { value: 'branch',       label: 'Git branch',         hint: 'branch, staged/modified/untracked, ahead/behind' },
  { value: 'model',        label: 'Model',              hint: 'active Claude model name' },
  { value: 'duration',     label: 'Session duration',   hint: 'elapsed wall-clock for the session' },
  { value: 'context',      label: 'Context usage',      hint: 'percent of the context window in use' },
  { value: 'cost',         label: 'Session cost',       hint: 'accumulated $ for the session' },
  { value: 'domains',      label: 'DDD domains row',    hint: 'domain progress bar + perf indicator' },
  { value: 'swarm',        label: 'Swarm row',          hint: 'agents, sub-agents, hooks, CVE, memory, intelligence' },
  { value: 'architecture', label: 'Architecture row',   hint: 'ADRs, DDD %, security status' },
  { value: 'agentdb',      label: 'AgentDB row',        hint: 'vectors, DB size, tests, MCP/DB integration' },
];

/** Must mirror SEGMENT_PRESETS in init/statusline-generator.ts. */
export const STATUSLINE_PRESETS: Record<string, string[]> = {
  full: STATUSLINE_SEGMENTS.map((s) => s.value),
  compact: ['version', 'project', 'branch', 'model', 'context', 'cost', 'swarm'],
  minimal: ['project', 'branch', 'model', 'context'],
};

const VALID = new Set(STATUSLINE_SEGMENTS.map((s) => s.value));

export function configPath(global: boolean, cwd: string = process.cwd()): string {
  return global
    ? path.join(os.homedir(), '.swarmdo', 'statusline.json')
    : path.join(cwd, '.swarmdo', 'statusline.json');
}

/**
 * Resolve the segments currently in effect, mirroring the generated script:
 * SWARMDO_STATUSLINE env → project config → global config → 'full'.
 * Returns the list plus where it came from (for display).
 */
export function resolveCurrentSegments(cwd: string = process.cwd()): { segments: string[]; source: string } {
  const env = (process.env.SWARMDO_STATUSLINE || '').trim();
  if (env) {
    const preset = STATUSLINE_PRESETS[env.toLowerCase()];
    if (preset) return { segments: preset, source: `SWARMDO_STATUSLINE=${env}` };
    const list = env.split(',').map((x) => x.trim().toLowerCase()).filter((x) => VALID.has(x));
    if (list.length) return { segments: list, source: 'SWARMDO_STATUSLINE (custom list)' };
  }
  for (const [where, p] of [['project', configPath(false, cwd)], ['global', configPath(true)]] as const) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { preset?: string; segments?: string[] };
      if (typeof j.preset === 'string' && STATUSLINE_PRESETS[j.preset.toLowerCase()]) {
        return { segments: STATUSLINE_PRESETS[j.preset.toLowerCase()]!, source: `${where} config (preset: ${j.preset})` };
      }
      if (Array.isArray(j.segments)) {
        const list = j.segments.map((x) => String(x).toLowerCase()).filter((x) => VALID.has(x));
        if (list.length) return { segments: list, source: `${where} config (custom)` };
      }
    } catch {
      /* absent or invalid — keep looking */
    }
  }
  return { segments: STATUSLINE_PRESETS.full!, source: 'default (full)' };
}

export function writeStatuslineConfig(
  value: { preset: string } | { segments: string[] },
  global: boolean,
  cwd: string = process.cwd()
): string {
  const p = configPath(global, cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
  return p;
}

/** Render a live preview through the generated helper, if the project has one. */
function preview(segments: string[], cwd: string): void {
  const helper = path.join(cwd, '.claude', 'helpers', 'statusline.cjs');
  if (!fs.existsSync(helper)) return;
  const r = spawnSync(process.execPath, [helper], {
    env: { ...process.env, SWARMDO_STATUSLINE: segments.join(',') },
    input: '{}',
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (r.status === 0 && r.stdout.trim()) {
    output.writeln('');
    output.writeln(output.dim('Preview:'));
    output.writeln(r.stdout.trimEnd());
  }
}

async function runConfigure(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const global = Boolean(ctx.flags.global);
  const flagPreset = typeof ctx.flags.preset === 'string' ? ctx.flags.preset.toLowerCase() : '';
  const flagSegments = typeof ctx.flags.segments === 'string' ? ctx.flags.segments : '';

  // Non-interactive paths first: --preset / --segments write directly.
  if (flagPreset) {
    if (!STATUSLINE_PRESETS[flagPreset]) {
      output.writeln(output.error(`Unknown preset "${flagPreset}". Valid: ${Object.keys(STATUSLINE_PRESETS).join(', ')}`));
      return { success: false, exitCode: 1 };
    }
    const p = writeStatuslineConfig({ preset: flagPreset }, global, cwd);
    output.writeln(output.success(`Statusline preset "${flagPreset}" written to ${p}`));
    preview(STATUSLINE_PRESETS[flagPreset]!, cwd);
    return { success: true, exitCode: 0 };
  }
  if (flagSegments) {
    const list = flagSegments.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const bad = list.filter((x) => !VALID.has(x));
    if (bad.length) {
      output.writeln(output.error(`Unknown segment(s): ${bad.join(', ')}. Valid: ${[...VALID].join(', ')}`));
      return { success: false, exitCode: 1 };
    }
    const p = writeStatuslineConfig({ segments: list }, global, cwd);
    output.writeln(output.success(`Statusline segments written to ${p}`));
    preview(list, cwd);
    return { success: true, exitCode: 0 };
  }

  // Interactive: preset choice, with Custom opening the checklist.
  const current = resolveCurrentSegments(cwd);
  output.writeln(output.dim(`Current: ${current.segments.join(', ')}  (from ${current.source})`));

  const choice = await select<string>({
    message: 'How busy should the statusline be?',
    options: [
      { value: 'full', label: 'Full', hint: 'everything — header + all 4 detail rows (6 lines)' },
      { value: 'compact', label: 'Compact', hint: 'header + swarm row' },
      { value: 'minimal', label: 'Minimal', hint: 'one line: project, branch, model, context' },
      { value: 'custom', label: 'Custom…', hint: 'pick exactly the segments you want from a checklist' },
    ],
    default: 'custom',
  });

  let segments: string[];
  let written: string;
  if (choice === 'custom') {
    const picked = await multiSelect<string>({
      message: 'Select the segments to show (space toggles, enter confirms)',
      options: STATUSLINE_SEGMENTS.map((s) => ({
        value: s.value,
        label: s.label,
        hint: s.hint,
        selected: current.segments.includes(s.value),
      })),
      default: current.segments,
      required: true,
      min: 1,
    });
    segments = STATUSLINE_SEGMENTS.map((s) => s.value).filter((v) => picked.includes(v));
    written = writeStatuslineConfig({ segments }, global, cwd);
  } else {
    segments = STATUSLINE_PRESETS[choice]!;
    written = writeStatuslineConfig({ preset: choice }, global, cwd);
  }

  output.writeln(output.success(`Statusline config written to ${written}`));
  if (process.env.SWARMDO_STATUSLINE) {
    output.writeln(output.warning('Note: SWARMDO_STATUSLINE is set in your environment and overrides this file.'));
  }
  preview(segments, cwd);
  return { success: true, exitCode: 0 };
}

async function runShow(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const { segments, source } = resolveCurrentSegments(cwd);
  if (ctx.flags.json) {
    output.writeln(JSON.stringify({ segments, source }, null, 2));
  } else {
    output.writeln(`Segments (${source}):`);
    for (const s of STATUSLINE_SEGMENTS) {
      output.writeln(`  [${segments.includes(s.value) ? 'x' : ' '}] ${s.value.padEnd(13)} ${output.dim(s.hint)}`);
    }
    preview(segments, cwd);
  }
  return { success: true, exitCode: 0 };
}

async function runReset(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const global = Boolean(ctx.flags.global);
  const p = configPath(global, cwd);
  if (!fs.existsSync(p)) {
    output.writeln(output.info(`No ${global ? 'global' : 'project'} statusline config to remove (${p}).`));
    return { success: true, exitCode: 0 };
  }
  const yes = Boolean(ctx.flags.yes) || (await confirm({ message: `Remove ${p}?`, default: true }));
  if (yes) {
    fs.rmSync(p);
    output.writeln(output.success(`Removed ${p} — statusline falls back to ${global ? "the default ('full')" : 'the global config or default'}.`));
  }
  return { success: true, exitCode: 0 };
}

export const statuslineCommand: Command = {
  name: 'statusline',
  description: 'Choose what the statusline shows (presets or a custom checklist)',
  options: [
    { name: 'global', short: 'g', description: 'Write to ~/.swarmdo/statusline.json instead of the project', type: 'boolean' },
    { name: 'preset', description: "Write a preset non-interactively: 'full' | 'compact' | 'minimal'", type: 'string' },
    { name: 'segments', description: 'Write a custom comma list non-interactively (e.g. project,model,swarm)', type: 'string' },
    { name: 'json', description: 'JSON output (with "show")', type: 'boolean' },
    { name: 'yes', short: 'y', description: 'Skip confirmation (with "reset")', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo statusline', description: 'Interactive: preset or custom checklist' },
    { command: 'swarmdo statusline --segments project,model,swarm', description: 'Write a custom selection directly' },
    { command: 'swarmdo statusline --preset minimal --global', description: 'Minimal statusline for every project' },
    { command: 'swarmdo statusline show', description: 'Show the active selection and where it comes from' },
    { command: 'swarmdo statusline reset', description: 'Remove the project config' },
  ],
  subcommands: [
    { name: 'show', description: 'Show the active segment selection and its source', action: runShow },
    { name: 'reset', description: 'Remove the statusline config file', action: runReset },
  ],
  action: runConfigure,
};

export default statuslineCommand;
