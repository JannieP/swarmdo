/**
 * V3 CLI Commands Index
 * Central registry for all CLI commands
 *
 * NOTE: All commands are synchronously imported at module load time (lines below).
 * The commandLoaders/loadCommand infrastructure provides an async fallback for
 * commands looked up via getCommandAsync() but does NOT reduce startup time since
 * all modules are already imported synchronously for the commands array and
 * commandsByCategory exports.
 */

import type { Command } from '../types.js';

// =============================================================================
// Lazy Loading Infrastructure
// =============================================================================

type CommandLoader = () => Promise<{ default?: Command; [key: string]: Command | unknown }>;

/**
 * Command loaders - commands are only imported when needed
 * This reduces initial bundle parse time by ~200ms
 */
const commandLoaders: Record<string, CommandLoader> = {
  // P1 Core Commands (frequently used - load first)
  init: () => import('./init.js'),
  start: () => import('./start.js'),
  status: () => import('./status.js'),
  statusline: () => import('./statusline.js'),
  compress: () => import('./compress.js'),
  // Deterministic command-output compression (rtk/headroom demand) — a
  // zero-token stream filter, distinct from caveman `compress` for files.
  compact: () => import('./compact.js'),
  // Secret detection + redaction on the agent data path (gitleaks/trufflehog
  // demand) — mask API keys/tokens before they reach an LLM/log/memory.
  redact: () => import('./redact.js'),
  // Repo→AI-context bundle (repomix demand) — one promptable blob with tree +
  // token counts; swarmdo's context-assembly primitive.
  pack: () => import('./pack.js'),
  // Env-var drift checker (dotenv-safe/dotenv-scan demand) — reconcile code
  // references against .env / .env.example (missing/unused/undocumented).
  env: () => import('./env.js'),
  // Dependency license audit + policy gate (license-checker demand) — catch
  // GPL/unknown licenses in the tree, fail CI on a forbidden one.
  license: () => import('./license.js'),
  licenses: () => import('./license.js'), // alias via loader key
  // Software Bill of Materials from the lockfile (syft/cyclonedx demand) —
  // CycloneDX/SPDX JSON; completes the env/license/sbom supply-chain trio.
  sbom: () => import('./sbom.js'),
  // Fuzzy unified-diff applier (agent-diff pain) — a forgiving `git apply` that
  // lands hunks despite context drift and reports what it couldn't.
  apply: () => import('./apply.js'),
  // Change-risk hotspots from git history (code-maat demand) — rank files by
  // churn × recency × author-spread; "where is the tech debt?" from data.
  hotspots: () => import('./hotspots.js'),
  // Affected-file/test set from a git diff (nx/turbo/jest --findRelatedTests
  // demand) — reverse-dependency closure over codegraph's import graph.
  affected: () => import('./affected.js'),
  // Circular-import detector (madge --circular demand) — SCC scan over
  // codegraph's import graph; catches TDZ/undefined-export bugs.
  cycles: () => import('./cycles.js'),
  // Queryable exported-symbol index (codegraph demand) — where things are
  // defined without grep+read round-trips.
  codegraph: () => import('./codegraph.js'),
  cg: () => import('./codegraph.js'), // alias via loader key
  efficiency: () => import('./efficiency.js'),
  task: () => import('./task.js'),
  session: () => import('./session.js'),
  // Original Commands
  agent: () => import('./agent.js'),
  swarm: () => import('./swarm.js'),
  memory: () => import('./memory.js'),
  mcp: () => import('./mcp.js'),
  config: () => import('./config.js'),
  migrate: () => import('./migrate.js'),
  hooks: () => import('./hooks.js'),
  workflow: () => import('./workflow.js'),
  'hive-mind': () => import('./hive-mind.js'),
  process: () => import('./process.js'),
  daemon: () => import('./daemon.js'),
  // V3 Advanced Commands (less frequently used - lazy load)
  neural: () => import('./neural.js'),
  security: () => import('./security.js'),
  performance: () => import('./performance.js'),
  providers: () => import('./providers.js'),
  plugins: () => import('./plugins.js'),
  deployment: () => import('./deployment.js'),
  claims: () => import('./claims.js'),
  embeddings: () => import('./embeddings.js'),
  // P0 Commands
  completions: () => import('./completions.js'),
  doctor: () => import('./doctor.js'),
  // Verification (ADR-095, signed witness manifest)
  verify: () => import('./verify.js'),
  // Analysis Commands
  analyze: () => import('./analyze.js'),
  // Claude Code transcript token/cost analytics (ccusage-style)
  usage: () => import('./usage.js'),
  cost: () => import('./usage.js'), // alias — lazy commands resolve aliases via loader keys
  // Test-Driven Repair — bounded headless claude loop (upstream v3.14.0 parity)
  repair: () => import('./repair.js'),
  'tdd-repair': () => import('./repair.js'), // alias via loader key
  // Single-pane operational HUD (claude-hud demand, swarmdo-native sources)
  hud: () => import('./hud.js'),
  // Isolated git worktrees for parallel work (claude-squad/vibe-kanban demand)
  worktree: () => import('./worktree.js'),
  wt: () => import('./worktree.js'), // alias via loader key
  // Export Claude Code sessions to Markdown (conversation-exporter demand)
  transcript: () => import('./transcript.js'),
  tx: () => import('./transcript.js'), // alias via loader key
  // Named configuration tiers for init + efficiency-skills guide
  preset: () => import('./preset.js'),
  presets: () => import('./preset.js'), // alias via loader key
  // Release notes from conventional commits (git-cliff/conventional-changelog demand)
  integrations: () => import('./integrations.js'),
  integrate: () => import('./integrations.js'), // alias via loader key
  release: () => import('./release.js'),
  ship: () => import('./release.js'), // alias via loader key
  changelog: () => import('./changelog.js'),
  notes: () => import('./changelog.js'), // alias via loader key
  // Q-Learning Routing Commands
  route: () => import('./route.js'),
  // Progress Commands
  progress: () => import('./progress.js'),
  // Issue Claims Commands (ADR-016)
  issues: () => import('./issues.js'),
  // Auto-update System (ADR-025)
  update: () => import('./update.js'),
  // SwarmVector PostgreSQL Bridge
  swarmvector: () => import('./swarmvector/index.js'),
  // Benchmark Suite (Pre-training, Neural, Memory)
  benchmark: () => import('./benchmark.js'),
  // Guidance Control Plane
  guidance: () => import('./guidance.js'),
  // RVFA Appliance Management
  appliance: () => import('./appliance.js'),
  'appliance-advanced': () => import('./appliance-advanced.js'),
  'transfer-store': () => import('./transfer-store.js'),
  cleanup: () => import('./cleanup.js'),
  autopilot: () => import('./autopilot.js'),
  // GAIA Benchmark Harness (ADR-133)
  'gaia-bench': () => import('./gaia-bench.js'),
  // MetaHarness integration (ADR-150) — dispatcher over plugins/swarmdo-metaharness/
  metaharness: () => import('./metaharness.js'),
  // Eject (ADR-150 Phase 2) — lift swarmdo project into a renamed standalone harness
  eject: () => import('./eject.js'),
  // Sprint 1 Move 7 — first-run capability tour (HNSW + Ed25519 + agent_run + embedding backend)
  demo: () => import('./demo.js'),
};

// Cache for loaded commands
const loadedCommands = new Map<string, Command>();

/**
 * Load a command lazily
 */
async function loadCommand(name: string): Promise<Command | undefined> {
  if (loadedCommands.has(name)) {
    return loadedCommands.get(name);
  }

  const loader = commandLoaders[name];
  if (!loader) return undefined;

  try {
    const module = await loader();
    // Try to find the command export (either default or named)
    const command = (module.default || module[`${name}Command`] || Object.values(module).find(
      (v): v is Command => typeof v === 'object' && v !== null && 'name' in v && 'description' in v
    )) as Command | undefined;

    if (command) {
      loadedCommands.set(name, command);
      return command;
    }
  } catch (error) {
    // Silently fail for missing optional commands
    if (process.env.DEBUG) {
      console.error(`Failed to load command ${name}:`, error);
    }
  }
  return undefined;
}

// =============================================================================
// Synchronous Imports for Core Commands (needed immediately at startup)
// These are the most commonly used commands that need instant access
// =============================================================================

// PERF-03: Only import core commands synchronously (~10 most-used).
// All other commands are lazy-loaded via commandLoaders on demand.
import { initCommand } from './init.js';
import { startCommand } from './start.js';
import { statusCommand } from './status.js';
import { taskCommand } from './task.js';
import { sessionCommand } from './session.js';
import { agentCommand } from './agent.js';
import { swarmCommand } from './swarm.js';
import { memoryCommand } from './memory.js';
import { mcpCommand } from './mcp.js';
import { hooksCommand } from './hooks.js';

// Pre-populate cache with core commands only
loadedCommands.set('init', initCommand);
loadedCommands.set('start', startCommand);
loadedCommands.set('status', statusCommand);
loadedCommands.set('task', taskCommand);
loadedCommands.set('session', sessionCommand);
loadedCommands.set('agent', agentCommand);
loadedCommands.set('swarm', swarmCommand);
loadedCommands.set('memory', memoryCommand);
loadedCommands.set('mcp', mcpCommand);
loadedCommands.set('hooks', hooksCommand);

// =============================================================================
// Exports (maintain backwards compatibility)
// =============================================================================

// Export core commands (synchronous)
export { initCommand } from './init.js';
export { startCommand } from './start.js';
export { statusCommand } from './status.js';
export { taskCommand } from './task.js';
export { sessionCommand } from './session.js';
export { agentCommand } from './agent.js';
export { swarmCommand } from './swarm.js';
export { memoryCommand } from './memory.js';
export { mcpCommand } from './mcp.js';
export { hooksCommand } from './hooks.js';

// Lazy-loaded command re-exports (for backwards compatibility, but async-only)
export async function getConfigCommand() { return loadCommand('config'); }
export async function getMigrateCommand() { return loadCommand('migrate'); }
export async function getWorkflowCommand() { return loadCommand('workflow'); }
export async function getHiveMindCommand() { return loadCommand('hive-mind'); }
export async function getProcessCommand() { return loadCommand('process'); }
export async function getTaskCommand() { return loadCommand('task'); }
export async function getSessionCommand() { return loadCommand('session'); }
export async function getNeuralCommand() { return loadCommand('neural'); }
export async function getSecurityCommand() { return loadCommand('security'); }
export async function getPerformanceCommand() { return loadCommand('performance'); }
export async function getProvidersCommand() { return loadCommand('providers'); }
export async function getPluginsCommand() { return loadCommand('plugins'); }
export async function getDeploymentCommand() { return loadCommand('deployment'); }
export async function getClaimsCommand() { return loadCommand('claims'); }
export async function getEmbeddingsCommand() { return loadCommand('embeddings'); }
export async function getCompletionsCommand() { return loadCommand('completions'); }
export async function getAnalyzeCommand() { return loadCommand('analyze'); }
export async function getRouteCommand() { return loadCommand('route'); }
export async function getProgressCommand() { return loadCommand('progress'); }
export async function getIssuesCommand() { return loadCommand('issues'); }
export async function getSwarmvectorCommand() { return loadCommand('swarmvector'); }
export async function getGuidanceCommand() { return loadCommand('guidance'); }
export async function getApplianceCommand() { return loadCommand('appliance'); }
export async function getCleanupCommand() { return loadCommand('cleanup'); }
export async function getAutopilotCommand() { return loadCommand('autopilot'); }

/**
 * Core commands loaded synchronously (available immediately)
 * Advanced commands loaded on-demand for faster startup
 */
export const commands: Command[] = [
  // Core commands (synchronously loaded) — PERF-03
  initCommand,
  startCommand,
  statusCommand,
  taskCommand,
  sessionCommand,
  agentCommand,
  swarmCommand,
  memoryCommand,
  mcpCommand,
  hooksCommand,
];

/**
 * Commands organized by category for help display (synchronous core only).
 * @deprecated Use getCommandsByCategory() for full categorized listing.
 */
export const commandsByCategory = {
  primary: [
    initCommand,
    startCommand,
    statusCommand,
    agentCommand,
    swarmCommand,
    memoryCommand,
    taskCommand,
    sessionCommand,
    mcpCommand,
    hooksCommand,
  ],
  advanced: [] as Command[],
  utility: [] as Command[],
  analysis: [] as Command[],
  management: [] as Command[],
};

/**
 * Async version that loads all commands by category (PERF-03).
 * Use this for help display and full command listings.
 */
export async function getCommandsByCategory(): Promise<Record<string, Command[]>> {
  // NOTE: destructure names MUST stay position-aligned with the Promise.all
  // list. Before the `usage` command landed, the names lagged the loads by
  // three slots from 'statusline' onward (completionsCmd received the
  // statusline module, analyzeCmd received completions, …), scrambling the
  // categorized help. Every load now has a named slot.
  const [
    daemonCmd, doctorCmd, embeddingsCmd, neuralCmd,
    performanceCmd, securityCmd, swarmvectorCmd, hiveMindCmd,
    configCmd, statuslineCmd, compressCmd, efficiencyCmd,
    completionsCmd, migrateCmd, workflowCmd,
    analyzeCmd, routeCmd, progressCmd, providersCmd,
    pluginsCmd, deploymentCmd, claimsCmd, issuesCmd,
    updateCmd, processCmd, guidanceCmd, applianceCmd,
    cleanupCmd, autopilotCmd, demoCmd, usageCmd, repairCmd, hudCmd, compactCmd, codegraphCmd, redactCmd, packCmd, envCmd, licenseCmd, sbomCmd, applyCmd, hotspotsCmd, affectedCmd, cyclesCmd,
  ] = await Promise.all([
    loadCommand('daemon'), loadCommand('doctor'), loadCommand('embeddings'), loadCommand('neural'),
    loadCommand('performance'), loadCommand('security'), loadCommand('swarmvector'), loadCommand('hive-mind'),
    loadCommand('config'), loadCommand('statusline'), loadCommand('compress'), loadCommand('efficiency'),
    loadCommand('completions'), loadCommand('migrate'), loadCommand('workflow'),
    loadCommand('analyze'), loadCommand('route'), loadCommand('progress'), loadCommand('providers'),
    loadCommand('plugins'), loadCommand('deployment'), loadCommand('claims'), loadCommand('issues'),
    loadCommand('update'), loadCommand('process'), loadCommand('guidance'), loadCommand('appliance'),
    loadCommand('cleanup'), loadCommand('autopilot'), loadCommand('demo'), loadCommand('usage'), loadCommand('repair'), loadCommand('hud'), loadCommand('compact'), loadCommand('codegraph'), loadCommand('redact'), loadCommand('pack'), loadCommand('env'), loadCommand('license'), loadCommand('sbom'), loadCommand('apply'), loadCommand('hotspots'), loadCommand('affected'), loadCommand('cycles'),
  ]);

  return {
    primary: [
      initCommand, startCommand, statusCommand, agentCommand,
      swarmCommand, memoryCommand, taskCommand, sessionCommand,
      mcpCommand, hooksCommand,
    ],
    advanced: [
      neuralCmd, securityCmd, performanceCmd, embeddingsCmd,
      hiveMindCmd, swarmvectorCmd, guidanceCmd, autopilotCmd,
      repairCmd,
    ].filter(Boolean) as Command[],
    utility: [
      configCmd, doctorCmd, daemonCmd, completionsCmd,
      migrateCmd, workflowCmd, demoCmd,
      statuslineCmd, compressCmd, compactCmd, redactCmd, packCmd, envCmd, licenseCmd, sbomCmd, applyCmd, hotspotsCmd, affectedCmd, cyclesCmd, efficiencyCmd,
    ].filter(Boolean) as Command[],
    analysis: [
      analyzeCmd, routeCmd, progressCmd, usageCmd, hudCmd, codegraphCmd,
    ].filter(Boolean) as Command[],
    management: [
      providersCmd, pluginsCmd, deploymentCmd, claimsCmd,
      issuesCmd, updateCmd, processCmd, applianceCmd, cleanupCmd,
    ].filter(Boolean) as Command[],
  };
}

/**
 * Command registry map for quick lookup
 * Supports both sync (core commands) and async (lazy-loaded) commands
 */
export const commandRegistry = new Map<string, Command>();

// Register core commands and their aliases
for (const cmd of commands) {
  commandRegistry.set(cmd.name, cmd);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      commandRegistry.set(alias, cmd);
    }
  }
}

/**
 * Get command by name (sync for core commands, returns undefined for lazy commands)
 * Use getCommandAsync for lazy-loaded commands
 */
export function getCommand(name: string): Command | undefined {
  return loadedCommands.get(name) || commandRegistry.get(name);
}

/**
 * Get command by name (async - supports lazy loading)
 */
export async function getCommandAsync(name: string): Promise<Command | undefined> {
  // Check already-loaded commands first
  const cached = loadedCommands.get(name);
  if (cached) return cached;

  // Check sync registry
  const synced = commandRegistry.get(name);
  if (synced) return synced;

  // Try lazy loading
  return loadCommand(name);
}

/**
 * Check if command exists (sync check for core commands)
 */
export function hasCommand(name: string): boolean {
  return loadedCommands.has(name) || commandRegistry.has(name) || name in commandLoaders;
}

/**
 * Get the names of all lazy-loadable commands (the commandLoaders keys).
 * Used by the CLI constructor to register these names with the parser so
 * the two-pass argument walker can recognize them as commands before their
 * modules have been imported. Fix for #1596.
 */
export function getLazyCommandNames(): string[] {
  return Object.keys(commandLoaders);
}

/**
 * Get all command names (including aliases and lazy-loadable)
 */
export function getCommandNames(): string[] {
  const names = new Set([
    ...Array.from(commandRegistry.keys()),
    ...Array.from(loadedCommands.keys()),
    ...Object.keys(commandLoaders),
  ]);
  return Array.from(names);
}

/**
 * Get all unique commands (excluding aliases)
 */
export function getUniqueCommands(): Command[] {
  return commands.filter(cmd => !cmd.hidden);
}

/**
 * Load all commands (populates lazy-loaded commands)
 * Use this when you need all commands available synchronously
 */
export async function loadAllCommands(): Promise<Command[]> {
  const allCommands: Command[] = [...commands];

  for (const name of Object.keys(commandLoaders)) {
    if (!loadedCommands.has(name)) {
      const cmd = await loadCommand(name);
      if (cmd && !allCommands.includes(cmd)) {
        allCommands.push(cmd);
      }
    }
  }

  return allCommands;
}

/**
 * Setup commands in a CLI instance
 */
export function setupCommands(cli: { command: (cmd: Command) => void }): void {
  for (const cmd of commands) {
    cli.command(cmd);
  }
}

/**
 * Setup all commands including lazy-loaded (async)
 */
export async function setupAllCommands(cli: { command: (cmd: Command) => void }): Promise<void> {
  const allCommands = await loadAllCommands();
  for (const cmd of allCommands) {
    cli.command(cmd);
  }
}
