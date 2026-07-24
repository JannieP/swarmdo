/**
 * profile.ts — `swarmdo profile` — session capability profiles.
 *
 *   swarmdo profile list                 the ladder: ultra → smart ★ → light → minimal
 *   swarmdo profile info <name>          what a profile turns on + when to use it
 *   swarmdo profile use <name>           apply it (alias: set / switch); accepts `default`
 *   swarmdo profile status               the active profile + what's live now vs. next session
 *   swarmdo profile clear                unset (back to no explicit profile)
 *   swarmdo profile check                SessionStart hook — prompt when none is set (--hook: JSON)
 *
 * `use` writes swarmdo.config.json (profile.active + llm.enabled), patches
 * .claude/settings.json `env` with the profile's SWARMDO_* levers, drops a
 * sourceable .swarmdo/profile.env for other CLIs, and toggles the efficiency
 * skills. Env-gated levers are read by Claude Code at session start, so those
 * take effect NEXT session; config/skill changes are immediate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { loadProjectConfig, saveProjectConfig, toggleField } from '../config/project-toggles.js';
import {
  SWARMDO_PROFILES,
  resolveProfile,
  profileNames,
  recommendedProfile,
  applyProfileEnv,
  profileDotenv,
  basePresetSummary,
  type ProfileDescriptor,
} from '../profiles/profiles.js';

// ── settings.json env patch ──────────────────────────────────────────────────

interface EnvPatchResult {
  applied: boolean;
  reason?: string;
  env?: Record<string, string>;
}

/** Merge a profile's SWARMDO_* levers into .claude/settings.json `env`, dropping
 * owned keys the profile omits. Preserves every other key + the rest of the
 * file. Returns applied:false (never throws) when there's no settings.json. */
function patchSettingsEnv(cwd: string, p: ProfileDescriptor): EnvPatchResult {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    return { applied: false, reason: 'no .claude/settings.json (run `swarmdo init`)' };
  }
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { applied: false, reason: '.claude/settings.json is not valid JSON — left untouched' };
  }
  const prevEnv = (settings.env && typeof settings.env === 'object' ? settings.env : {}) as Record<string, string>;
  const nextEnv = applyProfileEnv(prevEnv, p);
  settings.env = nextEnv;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return { applied: true, env: nextEnv };
}

/** Toggle the efficiency skill packs by shelling out to the same CLI (matches
 * `swarmdo obsidian`'s decoupled pattern — no re-implementation). Non-fatal. */
function setEfficiency(cwd: string, on: boolean): string {
  try {
    execFileSync(process.execPath, [process.argv[1], 'efficiency', on ? 'on' : 'off'], {
      cwd,
      stdio: 'ignore',
    });
    return on ? 'on' : 'off';
  } catch (e) {
    return `skipped (${(e as Error).message.slice(0, 50)})`;
  }
}

function writeProfileDotenv(cwd: string, p: ProfileDescriptor): string {
  const dir = path.join(cwd, '.swarmdo');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'profile.env');
  fs.writeFileSync(file, profileDotenv(p));
  return path.relative(cwd, file);
}

// ── rendering ────────────────────────────────────────────────────────────────

const yn = (b: boolean): string => (b ? output.info('on') : output.dim('off'));

/** the SWARMDO_* levers a profile sets, as a compact `KEY=v` string. */
function envSummary(p: ProfileDescriptor): string {
  const keys = Object.keys(p.env);
  return keys.length ? keys.map((k) => `${k.replace('SWARMDO_', '')}=${p.env[k]}`).join(' ') : output.dim('none');
}

function activeProfileName(cwd: string): string | undefined {
  return toggleField('profile', 'active', cwd);
}

// ── subcommands ──────────────────────────────────────────────────────────────

const listCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the session profiles (everything → bare)',
  options: [{ name: 'json', type: 'boolean', description: 'machine-readable output', default: false }],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const active = activeProfileName(ctx.cwd || process.cwd());
    if (ctx.flags.json === true) {
      output.printJson(
        SWARMDO_PROFILES.map((p) => ({
          name: p.name,
          emoji: p.emoji,
          tier: p.tier,
          recommended: p.recommended,
          active: p.name === active,
          basePreset: p.basePreset,
          env: p.env,
          llm: p.llm,
          efficiency: p.efficiency,
          tagline: p.tagline,
        })),
      );
      return { success: true };
    }
    output.writeln(output.bold('swarmdo session profiles') + output.dim('  (apply with: swarmdo profile use <name>)'));
    output.writeln();
    output.printTable({
      columns: [
        { key: 'name', header: 'Profile', width: 14 },
        { key: 'preset', header: 'Base', width: 9 },
        { key: 'levers', header: 'Levers', width: 30 },
        { key: 'tagline', header: 'What you get', width: 46 },
      ],
      data: SWARMDO_PROFILES.map((p) => ({
        name: `${p.emoji} ${p.name}${p.recommended ? ' ★' : ''}${p.name === active ? output.info(' ◉') : ''}`,
        preset: p.basePreset,
        levers: envSummary(p),
        tagline: p.tagline,
      })),
    });
    output.writeln(output.dim('★ = recommended default · ◉ = active · Levers = SWARMDO_* set in .claude/settings.json env'));
    output.writeln(output.dim('details:  swarmdo profile info <name>   ·   apply:  swarmdo profile use <name>  (accepts `default`)'));
    return { success: true };
  },
};

function renderInfo(name: string): CommandResult {
  const p = resolveProfile(name);
  if (!p) {
    output.printError(`unknown profile '${name}' (choose from: ${profileNames().join(', ')}, or 'default')`);
    return { success: false, exitCode: 1 };
  }
  output.writeln(output.bold(`${p.emoji} ${p.title}`) + output.dim(`  — profile '${p.name}'${p.recommended ? ' · recommended default' : ''}`));
  output.writeln();
  output.writeln(p.summary);
  output.writeln();
  output.writeln(output.bold('When to use'));
  output.writeln(`  ${p.whenToUse}`);
  output.writeln();
  output.writeln(output.bold('What it turns on'));
  output.printList([
    `Session levers:   ${envSummary(p)} ${output.dim('(→ .claude/settings.json env, next session)')}`,
    `Local SwarmLLM:   ${yn(p.llm)} ${output.dim('(🧬 statusline)')}`,
    `Efficiency skills:${yn(p.efficiency)} ${output.dim('(caveman + ponytail)')}`,
    `Base preset:      ${p.basePreset} ${output.dim(`— ${basePresetSummary(p)}`)}`,
  ]);
  output.writeln();
  output.writeln(output.dim(`apply:  swarmdo profile use ${p.name}      deeper setup:  swarmdo init --preset ${p.basePreset}`));
  return { success: true, data: { name: p.name } };
}

const infoCommand: Command = {
  name: 'info',
  aliases: ['show', 'explain'],
  description: 'Explain a profile — what it turns on and when to use it',
  options: [{ name: 'name', type: 'string', description: 'profile name' }],
  examples: [
    { command: 'swarmdo profile info ultra', description: 'What UltraMode turns on' },
    { command: 'swarmdo profile info default', description: 'The recommended (smart) profile' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const name = ((ctx.flags.name as string) || ctx.args[0] || '').toLowerCase();
    if (!name) {
      output.printError(`name required: a profile (${profileNames().join(', ')}) or 'default'`);
      return { success: false, exitCode: 1 };
    }
    return renderInfo(name);
  },
};

const useCommand: Command = {
  name: 'use',
  aliases: ['set', 'switch', 'apply'],
  description: 'Apply a session profile (accepts `default` for the recommended tier)',
  options: [{ name: 'name', type: 'string', description: 'profile name' }],
  examples: [
    { command: 'swarmdo profile use ultra', description: 'Maximum capability' },
    { command: 'swarmdo profile use default', description: 'The recommended (smart) profile' },
    { command: 'swarmdo profile use light', description: 'Just the light tools' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const name = ((ctx.flags.name as string) || ctx.args[0] || '').toLowerCase();
    if (!name) {
      output.printError(`name required: ${profileNames().join(', ')} (or 'default'). See: swarmdo profile list`);
      return { success: false, exitCode: 1 };
    }
    const p = resolveProfile(name);
    if (!p) {
      output.printError(`unknown profile '${name}' (choose from: ${profileNames().join(', ')}, or 'default')`);
      return { success: false, exitCode: 1 };
    }

    // 1. config: record the active profile (+ base) and the llm toggle it implies.
    const cfg = loadProjectConfig(cwd);
    cfg.profile = { enabled: true, active: p.name, base: p.basePreset, appliedAt: new Date().toISOString() };
    const prevLlm = (cfg.llm && typeof cfg.llm === 'object' ? cfg.llm : {}) as Record<string, unknown>;
    cfg.llm = { ...prevLlm, enabled: p.llm };
    saveProjectConfig(cfg, cwd);

    // 2. settings.json env — the real session levers Claude Code injects.
    const patch = patchSettingsEnv(cwd, p);
    // 3. cross-CLI dotenv (Codex / Copilot / pi).
    const dotenv = writeProfileDotenv(cwd, p);
    // 4. efficiency skill packs.
    const eff = setEfficiency(cwd, p.efficiency);

    output.printSuccess(`Profile → ${p.emoji} ${p.title}  ${output.dim(p.tagline)}`);
    output.writeln();
    output.printList([
      `Levers:            ${envSummary(p)}`,
      `Local SwarmLLM:    ${yn(p.llm)}`,
      `Efficiency skills: ${eff}`,
      `Base preset:       ${p.basePreset}`,
      `Cross-CLI dotenv:  ${dotenv} ${output.dim('(source it for Codex/Copilot/pi)')}`,
    ]);
    output.writeln();
    if (patch.applied) {
      output.writeln(output.warning('↻ Session levers written to .claude/settings.json env — restart this session to activate them'));
      output.writeln(output.dim('  (Claude Code caches settings at session start; the statusline profile + skills are live now.)'));
    } else {
      output.writeln(output.dim(`  settings.json env not written: ${patch.reason}`));
      output.writeln(output.dim(`  the profile is recorded; apply the levers yourself or run \`swarmdo init\` first.`));
    }
    return { success: true, data: { profile: p.name, envApplied: patch.applied } };
  },
};

const statusCommand: Command = {
  name: 'status',
  description: 'Show the active profile + what is live',
  options: [{ name: 'json', type: 'boolean', description: 'machine-readable output', default: false }],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const active = activeProfileName(cwd);
    const p = active ? resolveProfile(active) : undefined;
    if (ctx.flags.json === true) {
      output.printJson({ active: active ?? null, recommended: recommendedProfile().name, descriptor: p ?? null });
      return { success: true };
    }
    if (!p) {
      output.writeln(`  ${output.dim('○ no profile set')}  ${output.dim('— recommended:')} ${recommendedProfile().emoji} ${recommendedProfile().name}`);
      output.writeln(output.dim(`  set one:  swarmdo profile use default   ·   browse:  swarmdo profile list`));
      return { success: true };
    }
    output.writeln(`  ${output.info('◉')} ${p.emoji} ${output.bold(p.title)}  ${output.dim(`— profile '${p.name}'`)}`);
    output.writeln(`     ${p.tagline}`);
    output.writeln(`     levers: ${envSummary(p)}   ·   llm: ${yn(p.llm)}   ·   efficiency: ${yn(p.efficiency)}   ·   base: ${p.basePreset}`);
    // is the settings.json env actually in sync with the recorded profile?
    const sess = process.env.SWARMDO_PROFILE;
    if (sess && sess !== p.name) {
      output.writeln(output.warning(`     this session is running '${sess}' — restart to pick up '${p.name}'`));
    }
    output.writeln(output.dim(`  switch:  swarmdo profile use <name>   ·   details:  swarmdo profile info ${p.name}`));
    return { success: true, data: { active: p.name } };
  },
};

const clearCommand: Command = {
  name: 'clear',
  aliases: ['unset', 'reset'],
  description: 'Unset the active profile (leaves settings.json env as-is)',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const cwd = ctx.cwd || process.cwd();
    const cfg = loadProjectConfig(cwd);
    if (cfg.profile && typeof cfg.profile === 'object') {
      (cfg.profile as Record<string, unknown>).enabled = false;
      delete (cfg.profile as Record<string, unknown>).active;
      saveProjectConfig(cfg, cwd);
    }
    output.printSuccess('Profile cleared — the next new session will offer to set one again.');
    return { success: true };
  },
};

/**
 * check — the SessionStart nudge. When no profile is set, prompt the user (via
 * additionalContext in --hook mode, or plain text otherwise). Never throws and
 * always exits 0: a hook must never break session start.
 */
const checkCommand: Command = {
  name: 'check',
  description: 'Prompt to pick a profile when none is set (SessionStart hook)',
  options: [{ name: 'hook', type: 'boolean', description: 'emit SessionStart additionalContext JSON', default: false }],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const cwd = ctx.cwd || process.cwd();
      const active = activeProfileName(cwd);
      if (active) return { success: true }; // already set → silent no-op
      const rec = recommendedProfile();
      const options = SWARMDO_PROFILES.map((p) => `${p.emoji} ${p.name}${p.recommended ? ' (recommended)' : ''}`).join(', ');
      if (ctx.flags.hook === true) {
        const msg =
          `[SWARMDO] No session profile is set for this project. Offer the user a one-time choice of ` +
          `capability profile and then run \`swarmdo profile use <name>\`. Options: ${options}. ` +
          `Recommend ${rec.emoji} ${rec.name} — ${rec.tagline} Present the choice with AskUserQuestion ` +
          `(include a "default" = ${rec.name} and let them skip). Do this once, near the top of your first reply.`;
        process.stdout.write(
          JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } }) + '\n',
        );
        return { success: true };
      }
      output.writeln(`No swarmdo profile set. Recommended: ${rec.emoji} ${rec.name} — ${rec.tagline}`);
      output.writeln(output.dim(`  pick one:  swarmdo profile use <${profileNames().join('|')}>   (or: swarmdo profile use default)`));
      return { success: true };
    } catch {
      return { success: true }; // never break session start
    }
  },
};

export const profileCommand: Command = {
  name: 'profile',
  aliases: ['profiles'],
  description: 'Session capability profiles — one word for how much swarmdo you want (ultra/smart/light/minimal)',
  subcommands: [listCommand, infoCommand, useCommand, statusCommand, clearCommand, checkCommand],
  options: [],
  examples: [
    { command: 'swarmdo profile list', description: 'The profile ladder' },
    { command: 'swarmdo profile use default', description: 'Apply the recommended (smart) profile' },
    { command: 'swarmdo profile use ultra', description: 'Turn on every super tool' },
    { command: 'swarmdo profile status', description: 'Show the active profile' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // bare `swarmdo profile` → status
    return (await statusCommand.action!(ctx)) ?? { success: true, exitCode: 0 };
  },
};

export default profileCommand;
