/**
 * profiles.ts — session capability profiles for swarmdo.
 *
 * A profile is a one-word answer to "how much swarmdo do you want this session?"
 * It bundles the levers that are otherwise scattered across env vars, config
 * toggles, and skill installs into a named tier a user can switch on demand:
 *
 *   ultra 🦾  → smart 🧠 (recommended) → light 🪶 → minimal 🔩
 *
 * Distinct from `swarmdo init --preset` (presets.ts): a preset is the one-time
 * project *scaffold* (agent counts, which skills to download, memory backend);
 * a profile is the *session mode* you flip between afterwards without re-running
 * init. A profile names a base preset for the deeper setup, but applying one is
 * fast and non-destructive — it writes:
 *
 *   1. swarmdo.config.json  `profile.active`  (+ llm.enabled)   — live-read by
 *      the statusline and MCP/hook data paths.
 *   2. .claude/settings.json `env`            — the real levers Claude Code
 *      injects into the session, its hooks, and the swarmdo MCP server:
 *      SWARMDO_ULTRA / SWARMDO_HARNESS / SWARMDO_ROUTER_NEURAL / SWARMDO_PONYTAIL.
 *      (Cached at session start → env-gated changes take effect next session.)
 *   3. .swarmdo/profile.env                   — the same env as a sourceable
 *      dotenv, so Codex CLI / Copilot CLI / pi (any AGENTS.md-aware CLI that
 *      also drives the swarmdo MCP server) can pick up the same mode.
 *   4. the efficiency skill packs (caveman + ponytail) — present or not.
 *
 * The env maps are pure data here so they can be fixture-tested without touching
 * a filesystem; the `swarmdo profile` command owns the fs writes.
 */

import { resolvePreset } from '../init/presets.js';

/** A profile's env contribution. A value is the string to set; the KEYS this
 * module owns but a profile omits are *removed* on apply, so switching profiles
 * never leaves a stale lever behind. */
export type ProfileEnv = Record<string, string>;

export interface ProfileDescriptor {
  /** canonical slug used everywhere (config, CLI, dotenv) */
  name: string;
  emoji: string;
  /** display name */
  title: string;
  /** one-line "what you get" */
  tagline: string;
  summary: string;
  whenToUse: string;
  recommended: boolean;
  /** 0 (leanest) … 3 (everything) — mirrors the capability ladder */
  tier: number;
  /** the `swarmdo init --preset` tier this profile pairs with for deeper setup */
  basePreset: 'minimal' | 'basic' | 'standard' | 'advanced' | 'max';
  /** SWARMDO_* levers written into .claude/settings.json env + .swarmdo/profile.env */
  env: ProfileEnv;
  /** local SwarmLLM inference backend (swarmdo.config.json llm.enabled) */
  llm: boolean;
  /** caveman + ponytail skill packs present in ./.claude/skills */
  efficiency: boolean;
}

/**
 * The complete set of SWARMDO_* env keys any profile may set. Applying a profile
 * SETS the keys in its `env` and DELETES every other key in this list, so a
 * switch (e.g. ultra → light) cleanly drops levers the new profile doesn't want.
 * Nothing outside this list is ever touched — user/other env survives.
 */
export const PROFILE_OWNED_ENV_KEYS = [
  'SWARMDO_ULTRA',
  'SWARMDO_HARNESS',
  'SWARMDO_ROUTER_NEURAL',
  'SWARMDO_PONYTAIL',
] as const;

// ── the ladder ───────────────────────────────────────────────────────────────

/**
 * Design notes on the env matrix (each profile is internally coherent):
 *  - SWARMDO_HARNESS gates the default coding-agent harness injected into spawned
 *    agents. It defaults ON (opt-out), so it's set '1' explicitly everywhere it's
 *    wanted and '0' only in `minimal`, the one profile that opts out entirely.
 *  - SWARMDO_ULTRA is the "correctness/completeness over speed, cost is not the
 *    constraint" policy — only `ultra`. It deliberately excludes SWARMDO_PONYTAIL,
 *    which is the opposite instinct (laziest thing that works).
 *  - SWARMDO_PONYTAIL makes the anti-over-engineering persona the DEFAULT for
 *    spawned agents — a fit for `light` (lean by design), wrong for ultra/smart.
 *  - SWARMDO_ROUTER_NEURAL turns on learned model routing — the "smart" levers.
 */
export const SWARMDO_PROFILES: ProfileDescriptor[] = [
  {
    name: 'ultra',
    emoji: '🦾',
    title: 'UltraMode',
    tagline: 'Everything on — maximum capability, cost is not the constraint.',
    summary:
      'Turns on every super tool: ULTRA thoroughness policy, the agent harness, learned neural routing, local SwarmLLM inference, and the full efficiency skill set. Pairs with the `max` preset (widest swarm, dual-mode, all intelligence).',
    whenToUse:
      'Hard problems where you want correctness and completeness over speed — deep refactors, audits, thorny debugging. Highest token/compute cost.',
    recommended: false,
    tier: 3,
    basePreset: 'max',
    env: { SWARMDO_ULTRA: '1', SWARMDO_HARNESS: '1', SWARMDO_ROUTER_NEURAL: '1' },
    llm: true,
    efficiency: true,
  },
  {
    name: 'smart',
    emoji: '🧠',
    title: 'Smart',
    tagline: 'The intelligence layer without the heaviest fan-out. Recommended.',
    summary:
      'Only the smart tools: the coding-agent harness plus learned neural routing, with the efficiency skills available. No ULTRA over-thoroughness, no local model download. Pairs with the `standard` preset (HNSW + neural + embeddings).',
    whenToUse:
      'The balanced daily driver — most projects, most sessions. Smart routing and better agents without max cost.',
    recommended: true,
    tier: 2,
    basePreset: 'standard',
    env: { SWARMDO_HARNESS: '1', SWARMDO_ROUTER_NEURAL: '1' },
    llm: false,
    efficiency: true,
  },
  {
    name: 'light',
    emoji: '🪶',
    title: 'Light',
    tagline: 'Just the light tools — lean, fast, cheap.',
    summary:
      'The cheap wins only: the agent harness plus the anti-over-engineering (ponytail) persona as the default for spawned agents, and the efficiency skills for token savings. No neural routing, no ULTRA, no local model. Pairs with the `basic` preset.',
    whenToUse:
      'Quick work, tight token budgets, or when you want minimal-by-default solutions. Fast init, no model downloads.',
    recommended: false,
    tier: 1,
    basePreset: 'basic',
    env: { SWARMDO_HARNESS: '1', SWARMDO_PONYTAIL: '1' },
    llm: false,
    efficiency: true,
  },
  {
    name: 'minimal',
    emoji: '🔩',
    title: 'Minimal',
    tagline: 'Bare — plain Claude, no swarmdo flavor injected.',
    summary:
      'Opts out of everything: no harness injection (SWARMDO_HARNESS=0), no routing, no ULTRA, no local model, no efficiency skills. Pairs with the `minimal` preset (core coordination only, offline-friendly).',
    whenToUse:
      'Air-gapped or low-power machines, or when you want Claude Code untouched and are using swarmdo purely for its CLI/memory.',
    recommended: false,
    tier: 0,
    basePreset: 'minimal',
    env: { SWARMDO_HARNESS: '0' },
    llm: false,
    efficiency: false,
  },
];

/** Friendly aliases onto the canonical rungs. `default` → the recommended tier. */
const ALIASES: Record<string, string> = {
  default: 'smart',
  recommended: 'smart',
  mid: 'smart',
  ultramode: 'ultra',
  max: 'ultra',
  full: 'ultra',
  basic: 'light',
  bare: 'minimal',
  off: 'minimal',
};

export function profileNames(): string[] {
  return SWARMDO_PROFILES.map((p) => p.name);
}

export function recommendedProfile(): ProfileDescriptor {
  return SWARMDO_PROFILES.find((p) => p.recommended) ?? SWARMDO_PROFILES[1];
}

export function resolveProfile(name: string): ProfileDescriptor | undefined {
  const n = (name ?? '').trim().toLowerCase();
  const target = ALIASES[n] ?? n;
  return SWARMDO_PROFILES.find((p) => p.name === target);
}

/**
 * Compute the new settings.json `env` object for a profile: start from the
 * existing env, drop every owned key, then set the profile's keys. Pure — the
 * caller persists it. Non-owned keys (CLAUDE_CODE_*, SWARMDO_V3_ENABLED, the
 * user's own) are preserved untouched.
 */
export function applyProfileEnv(
  prevEnv: Record<string, string>,
  p: ProfileDescriptor,
): Record<string, string> {
  const next: Record<string, string> = { ...prevEnv };
  for (const k of PROFILE_OWNED_ENV_KEYS) delete next[k];
  return { ...next, ...p.env };
}

/** The sourceable `.swarmdo/profile.env` for cross-CLI (Codex/Copilot/pi). Owned
 * keys the profile omits are emitted as `unset` lines so a re-source of an older
 * file doesn't leave a stale lever in the shell. */
export function profileDotenv(p: ProfileDescriptor): string {
  const lines = [
    `# swarmdo profile: ${p.name} ${p.emoji} — ${p.tagline}`,
    `# Generated by \`swarmdo profile use ${p.name}\`. Source this in any shell/CLI`,
    `# that drives the swarmdo MCP server (Codex CLI, Copilot CLI, pi):  source .swarmdo/profile.env`,
    `export SWARMDO_PROFILE=${p.name}`,
  ];
  for (const k of PROFILE_OWNED_ENV_KEYS) {
    if (p.env[k] !== undefined) lines.push(`export ${k}=${p.env[k]}`);
    else lines.push(`unset ${k}`);
  }
  return lines.join('\n') + '\n';
}

/** Human-readable one-liner for the base preset a profile pairs with. */
export function basePresetSummary(p: ProfileDescriptor): string {
  return resolvePreset(p.basePreset)?.summary ?? p.basePreset;
}
