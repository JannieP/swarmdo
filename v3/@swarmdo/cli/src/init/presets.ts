/**
 * presets.ts — named capability tiers for `swarmdo init`.
 *
 * A monotonic ladder from leanest to everything, so users pick one word instead
 * of toggling dozens of flags. Each rung is a superset of the one below in
 * capability and resource use. All bundles are built from DEFAULT_INIT_OPTIONS
 * so they stay in lockstep with the base schema; `deriveHighlights` reads the
 * options back so the info display can never drift from what actually ships.
 *
 *   minimal → basic (default) → standard → advanced → max
 */

import {
  DEFAULT_INIT_OPTIONS,
  MINIMAL_INIT_OPTIONS,
  FULL_INIT_OPTIONS,
  type InitOptions,
} from './types.js';

export interface PresetHighlights {
  topology: string;
  maxAgents: number;
  memory: string;
  /** the full vector-intelligence bundle: HNSW + neural + embeddings */
  memoryIntelligence: boolean;
  skills: string[];
  agentSets: string[];
  /** Claude + Codex dual-mode collaboration */
  dualMode: boolean;
  /** the optional swarmdo-swarm MCP server */
  mcpSwarm: boolean;
}

export interface PresetDescriptor {
  name: string;
  /** 0 (leanest) … 4 (everything) */
  tier: number;
  title: string;
  summary: string;
  whenToUse: string;
  recommended: boolean;
  options: InitOptions;
}

function enabledKeys(obj: Record<string, unknown>, skip: string[] = ['all']): string[] {
  return Object.entries(obj)
    .filter(([k, v]) => v === true && !skip.includes(k))
    .map(([k]) => k);
}

/** Read a preset's capabilities straight back off its InitOptions — single
 * source of truth for the info display. */
export function deriveHighlights(o: InitOptions): PresetHighlights {
  return {
    topology: o.runtime.topology,
    maxAgents: o.runtime.maxAgents,
    memory: o.runtime.memoryBackend,
    memoryIntelligence: o.runtime.enableHNSW && o.runtime.enableNeural && o.embeddings.enabled,
    skills: o.skills.all ? ['all'] : enabledKeys(o.skills as unknown as Record<string, unknown>),
    agentSets: o.agents.all ? ['all'] : enabledKeys(o.agents as unknown as Record<string, unknown>),
    dualMode: o.skills.dualMode,
    mcpSwarm: o.mcp.swarmdoSwarm,
  };
}

// ── the ladder ───────────────────────────────────────────────────────────────

/** tier 0 — leanest: core coordination only, no ML substrate, tiny footprint. */
const minimal: InitOptions = {
  ...MINIMAL_INIT_OPTIONS,
  runtime: { ...MINIMAL_INIT_OPTIONS.runtime, topology: 'mesh', maxAgents: 4 },
};

/** tier 1 — the recommended default: real coordination + lightweight memory, but
 * no heavy vector-intelligence substrate (no embeddings download, no neural). */
const basic: InitOptions = {
  ...DEFAULT_INIT_OPTIONS,
  components: { ...DEFAULT_INIT_OPTIONS.components, statusline: true },
  skills: { core: true, efficiency: true, agentdb: true, github: false, browser: false, v3: false, dualMode: false, all: false },
  agents: { ...DEFAULT_INIT_OPTIONS.agents, consensus: false, sparc: true, swarm: false, browser: false, testing: true },
  runtime: {
    ...DEFAULT_INIT_OPTIONS.runtime,
    topology: 'hierarchical',
    maxAgents: 6,
    enableHNSW: false,
    enableNeural: false,
    enableLearningBridge: false,
    enableMemoryGraph: false,
  },
  embeddings: { ...DEFAULT_INIT_OPTIONS.embeddings, enabled: false, hyperbolic: false, neuralSubstrate: false },
};

/** tier 2 — balanced intermediate: turns on the vector-intelligence substrate
 * (HNSW + neural + embeddings) and the broader skill/agent sets. ≈ the shipped
 * DEFAULT_INIT_OPTIONS with a moderate agent ceiling. */
const standard: InitOptions = {
  ...DEFAULT_INIT_OPTIONS,
  runtime: { ...DEFAULT_INIT_OPTIONS.runtime, topology: 'hierarchical-mesh', maxAgents: 10 },
};

/** tier 3 — everything on except cross-platform extras: all skills/agents/
 * commands, hyperbolic embeddings, high agent ceiling. */
const advanced: InitOptions = {
  ...FULL_INIT_OPTIONS,
  skills: { ...FULL_INIT_OPTIONS.skills, dualMode: false },
  mcp: { ...FULL_INIT_OPTIONS.mcp, swarmdoSwarm: false },
  runtime: { ...FULL_INIT_OPTIONS.runtime, topology: 'hierarchical-mesh', maxAgents: 15 },
};

/** tier 4 — max capability: advanced + dual-mode (Claude + Codex) + the
 * swarmdo-swarm MCP server + the highest agent ceiling. */
const max: InitOptions = {
  ...FULL_INIT_OPTIONS,
  runtime: { ...FULL_INIT_OPTIONS.runtime, topology: 'hierarchical-mesh', maxAgents: 20 },
};

export const SWARMDO_PRESETS: PresetDescriptor[] = [
  {
    name: 'minimal',
    tier: 0,
    title: 'Minimal',
    summary: 'Core coordination only — no ML substrate, tiny footprint, offline-friendly.',
    whenToUse: 'Quick experiments, low-power machines, air-gapped/offline work, or when you want the smallest possible install.',
    recommended: false,
    options: minimal,
  },
  {
    name: 'basic',
    tier: 1,
    title: 'Basic (default)',
    summary: 'Real multi-agent coordination + lightweight memory. No embeddings download or neural substrate.',
    whenToUse: 'Most projects. The balanced starting point: fast init, no model downloads, everything you need to coordinate agents.',
    recommended: true,
    options: basic,
  },
  {
    name: 'standard',
    tier: 2,
    title: 'Standard',
    summary: 'Adds the vector-intelligence substrate (HNSW + neural + ONNX embeddings) and broader skill/agent sets.',
    whenToUse: 'Projects that benefit from semantic memory search and learned routing — the intermediate step up from basic.',
    recommended: false,
    options: standard,
  },
  {
    name: 'advanced',
    tier: 3,
    title: 'Advanced',
    summary: 'All skills, agents, and commands; hyperbolic embeddings; high agent ceiling. Everything except cross-platform extras.',
    whenToUse: 'Large or complex codebases that want the full skill/agent surface and maximum on-device intelligence.',
    recommended: false,
    options: advanced,
  },
  {
    name: 'max',
    tier: 4,
    title: 'Max',
    summary: 'Maximum capability: advanced + Claude⇄Codex dual-mode + the swarmdo-swarm MCP server + the highest agent ceiling.',
    whenToUse: 'Power users running dual-platform collaboration and the widest swarm. Heaviest footprint.',
    recommended: false,
    options: max,
  },
];

export function presetNames(): string[] {
  return SWARMDO_PRESETS.map((p) => p.name);
}

export function resolvePreset(name: string): PresetDescriptor | undefined {
  const n = (name ?? '').trim().toLowerCase();
  // a couple of friendly aliases onto the canonical rungs
  const alias: Record<string, string> = { default: 'basic', full: 'max', intermediate: 'standard' };
  const target = alias[n] ?? n;
  return SWARMDO_PRESETS.find((p) => p.name === target);
}
