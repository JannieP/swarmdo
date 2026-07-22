/**
 * Agent MCP Tools for CLI
 *
 * Tool definitions for agent lifecycle management with file persistence.
 * Includes model routing integration for intelligent model selection.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type MCPTool, getProjectCwd } from './types.js';
import { validateIdentifier, validateText, validateAgentSpawn } from './validate-input.js';
import { executeAgentTask } from './agent-execute-core.js';
import { buildSpawnInput, reconcile, isBound, orphanedAgentIds, type SwarmdoAgentLike } from '../agent-bridge/bridge.js';

// Storage paths
const STORAGE_DIR = '.swarmdo';
const AGENT_DIR = 'agents';
const AGENT_FILE = 'store.json';
// #1916: hive-mind_spawn writes its workers to `.swarmdo/agents.json`
// (a *different* file from the canonical `.swarmdo/agents/store.json`
// used here). agent_status / agent_list / agent_logs merge that store so a
// hive-spawned worker is resolvable instead of returning `not_found`.
const HIVE_AGENT_FILE = 'agents.json';

// Model types matching Claude Agent SDK
type ClaudeModel = 'haiku' | 'sonnet' | 'opus' | 'opus-4.7' | 'inherit';

interface AgentRecord {
  agentId: string;
  agentType: string;
  status: 'idle' | 'busy' | 'terminated';
  health: number;
  taskCount: number;
  config: Record<string, unknown>;
  createdAt: string;
  domain?: string;
  model?: ClaudeModel;  // Tier label assigned to this agent
  modelRoutedBy?: 'explicit' | 'router' | 'codemod' | 'default' | 'hybrid';  // ADR-026/143/149
  /** ADR-149 — concrete picked model id (e.g. inclusionai/ling-2.6-flash). */
  modelId?: string;
  /** ADR-148 — execution provider hint. */
  provider?: 'anthropic' | 'openrouter';
  /** ADR-148 — concrete OpenRouter slug when provider='openrouter'. */
  openrouterModel?: string;
  lastResult?: Record<string, unknown>;
}

interface AgentStore {
  agents: Record<string, AgentRecord>;
  version: string;
}

function getAgentDir(): string {
  return join(getProjectCwd(), STORAGE_DIR, AGENT_DIR);
}

function getAgentPath(): string {
  return join(getAgentDir(), AGENT_FILE);
}

function ensureAgentDir(): void {
  const dir = getAgentDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadAgentStore(): AgentStore {
  try {
    const path = getAgentPath();
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return empty store on error
  }
  return { agents: {}, version: '3.0.0' };
}

function saveAgentStore(store: AgentStore): void {
  ensureAgentDir();
  writeFileSync(getAgentPath(), JSON.stringify(store, null, 2), 'utf-8');
}

// #1916: read hive-mind-spawned workers from `.swarmdo/agents.json`.
function getHiveAgentPath(): string {
  return join(getProjectCwd(), STORAGE_DIR, HIVE_AGENT_FILE);
}

function loadHiveAgents(): Record<string, AgentRecord> {
  try {
    const path = getHiveAgentPath();
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      if (data && typeof data.agents === 'object' && data.agents) {
        return data.agents as Record<string, AgentRecord>;
      }
    }
  } catch {
    // Ignore — hive store is optional/best-effort.
  }
  return {};
}

/**
 * #1916: merged view of every tracked agent — the canonical agent store
 * plus hive-mind-spawned workers. On an id collision the canonical record
 * wins (it carries model-routing + lastResult that the hive store omits).
 */
function loadAllAgents(): Record<string, AgentRecord> {
  return { ...loadHiveAgents(), ...loadAgentStore().agents };
}

/**
 * Read the project's swarm topology defaults from swarmdo.config.json for the
 * agent bridge's auto-swarm. Defensive — returns {} on any error so the bridge
 * falls back to the anti-drift defaults (hierarchical / 8 / specialized).
 * Accepts either a top-level `swarm` block or the root object.
 */
function readSwarmConfigDefaults(): { topology?: string; maxAgents?: number; strategy?: string } {
  try {
    const p = join(getProjectCwd(), 'swarmdo.config.json');
    if (!existsSync(p)) return {};
    const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
    const sw = ((j.swarm as Record<string, unknown>) || j) ?? {};
    const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
    const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
    return { topology: str(sw.topology), maxAgents: num(sw.maxAgents), strategy: str(sw.strategy) };
  } catch {
    return {};
  }
}

// Default model mappings for agent types (can be overridden)
const AGENT_TYPE_MODEL_DEFAULTS: Record<string, ClaudeModel> = {
  // Complex agents → opus
  'architect': 'opus',
  'security-architect': 'opus',
  'system-architect': 'opus',
  'core-architect': 'opus',
  // Medium complexity → sonnet
  'coder': 'sonnet',
  'reviewer': 'sonnet',
  'researcher': 'sonnet',
  'tester': 'sonnet',
  'analyst': 'sonnet',
  // Simple/fast agents → haiku
  'formatter': 'haiku',
  'linter': 'haiku',
  'documenter': 'haiku',
};

// Lazy-loaded model router
let modelRouterInstance: Awaited<ReturnType<typeof import('../swarmvector/model-router.js').getModelRouter>> | null = null;

async function getModelRouter() {
  if (!modelRouterInstance) {
    try {
      const { getModelRouter } = await import('../swarmvector/model-router.js');
      modelRouterInstance = getModelRouter();
    } catch (e) {
      // Log but don't fail - model router is optional
      console.error('[agent-tools] Model router load failed:', (e as Error).message);
    }
  }
  return modelRouterInstance;
}

// ADR-149 — the cost-optimal neural router fires only when
// `routeToModelFull(task, embedding)` is called with a real embedding. We
// delegate to the shared task-embedder module (ADR-149 iter 9) so the
// @xenova/transformers MiniLM pipeline + LRU cache are shared across
// agent-tools and the agent-execute-core fallback path.
async function embedTaskSafe(task: string): Promise<number[] | undefined> {
  const { embedTaskWithCache } = await import('../swarmvector/task-embedder.js');
  return embedTaskWithCache(task);
}

/**
 * Determine model for agent based on (ADR-026 3-tier routing):
 * 1. Explicit model in config
 * 2. Enhanced task-based routing with deterministic Tier-1 codemods (if task provided)
 * 3. Agent type defaults
 * 4. Fallback to sonnet
 */
async function determineAgentModel(
  agentType: string,
  config: Record<string, unknown>,
  task?: string
): Promise<{
  model: ClaudeModel;
  routedBy: 'explicit' | 'router' | 'codemod' | 'default' | 'hybrid';
  canSkipLLM?: boolean;
  codemodIntent?: string;
  tier?: 1 | 2 | 3;
  /** ADR-149 — concrete picked model id when the neural backend fired. */
  modelId?: string;
  /** ADR-148 — execution provider hint. */
  provider?: 'anthropic' | 'openrouter';
  /** ADR-148 — concrete OpenRouter slug when provider='openrouter'. */
  openrouterModel?: string;
}> {
  // 1. Explicit model in config
  if (config.model && ['haiku', 'sonnet', 'opus', 'opus-4.7', 'inherit'].includes(config.model as string)) {
    return { model: config.model as ClaudeModel, routedBy: 'explicit' };
  }

  // 2. Enhanced task-based routing with deterministic Tier-1 codemods
  if (task) {
    try {
      // Try enhanced router first (includes codemod-intent detection)
      const { getEnhancedModelRouter } = await import('../swarmvector/enhanced-model-router.js');
      const enhancedRouter = getEnhancedModelRouter();
      // ADR-149 — embed the task so the cost-optimal neural backend fires.
      // We probe the embedder lazily; if it can't load (no @xenova/transformers
      // available), the enhanced router falls back to heuristic+bandit and
      // the existing behaviour is preserved.
      const embedding = await embedTaskSafe(task);
      const routeResult = await enhancedRouter.route(task, { filePath: config.filePath as string, embedding });

      if (routeResult.tier === 1 && routeResult.canSkipLLM) {
        // Deterministic codemod can apply this edit ($0, no LLM)
        return {
          model: 'haiku', // fallback model if the codemod can't apply
          routedBy: 'codemod',
          canSkipLLM: true,
          codemodIntent: (routeResult.codemodIntent ?? routeResult.agentBoosterIntent)?.type,
          tier: 1,
        };
      }

      // ADR-149 — forward the per-model fields. When the neural backend
      // fired, modelId carries the cost-optimal pick (e.g. Ling); when
      // it didn't, these are undefined and downstream behaviour is unchanged.
      const routedBy: 'router' | 'hybrid' =
        routeResult.routedBy === 'hybrid' ? 'hybrid' : 'router';
      return {
        model: routeResult.model!,
        routedBy,
        tier: routeResult.tier,
        modelId: routeResult.modelId,
        provider: routeResult.provider,
        openrouterModel: routeResult.openrouterModel,
      };
    } catch {
      // Enhanced router not available, try basic router
      const router = await getModelRouter();
      if (router) {
        try {
          // ADR-149 — embed the task so the cost-optimal neural backend
          // fires (it's gated on `embedding && embedding.length > 0`).
          // Without the embedding, route() falls back to heuristic+bandit
          // and every per-model Pareto win the v2 measurement landed is
          // invisible. embedTaskSafe returns undefined on any failure;
          // route(task, undefined) behaves exactly as the prior code.
          const embedding = await embedTaskSafe(task);
          const result = await router.route(task, embedding);
          // Map the routing mechanism to the broader agent-record taxonomy.
          // 'hybrid' = neural prior + bandit blended (ADR-149); fold the rest
          // into 'router' for back-compat with consumers reading modelRoutedBy.
          const routedBy: 'router' | 'hybrid' =
            result.routedBy === 'hybrid' ? 'hybrid' : 'router';
          return {
            model: result.model,
            routedBy,
            modelId: result.modelId,
            provider: result.provider,
            openrouterModel: result.openrouterModel,
          };
        } catch {
          // Fall through to defaults on router error
        }
      }
    }
  }

  // 3. Agent type defaults
  const defaultModel = AGENT_TYPE_MODEL_DEFAULTS[agentType];
  if (defaultModel) {
    return { model: defaultModel, routedBy: 'default' };
  }

  // 4. Fallback to sonnet (balanced)
  return { model: 'sonnet', routedBy: 'default' };
}

interface RegisterAgentResult {
  success: boolean;
  error?: string;
  agentId?: string;
  agentType?: string;
  model?: ClaudeModel;
  modelRoutedBy?: 'explicit' | 'router' | 'codemod' | 'default' | 'hybrid';
  modelId?: string;
  provider?: 'anthropic' | 'openrouter';
  openrouterModel?: string;
  createdAt?: string;
  canSkipLLM?: boolean;
  codemodIntent?: string;
  tier?: number;
}

/**
 * Shared agent-registration body — extracted so `agent_spawn` (cheap, sub-100ms,
 * preserves swarm-coordination contract) and the new `agent_run` (spawn + LLM
 * execute in one call) reuse identical persistence, swarm-join, and graph-DB
 * side-effects. Callers append their own `status` + `note` fields.
 */
async function registerAgent(input: Record<string, unknown>): Promise<RegisterAgentResult> {
  const validation = await validateAgentSpawn(input);
  if (!validation.valid) {
    return { success: false, error: `Input validation failed: ${validation.errors.join('; ')}` };
  }

  const store = loadAgentStore();
  const agentId = (input.agentId as string) || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const agentType = input.agentType as string;
  const config = (input.config as Record<string, unknown>) || {};

  if (input.model) {
    config.model = input.model;
  }

  const task = (input.task as string) || (config.task as string) || undefined;

  const routingResult = await determineAgentModel(agentType, config, task);

  const agent: AgentRecord = {
    agentId,
    agentType,
    status: 'idle',
    health: 1.0,
    taskCount: 0,
    config,
    createdAt: new Date().toISOString(),
    domain: input.domain as string,
    model: routingResult.model,
    modelRoutedBy: routingResult.routedBy,
    ...(routingResult.modelId ? { modelId: routingResult.modelId } : {}),
    ...(routingResult.provider ? { provider: routingResult.provider } : {}),
    ...(routingResult.openrouterModel ? { openrouterModel: routingResult.openrouterModel } : {}),
  };

  store.agents[agentId] = agent;
  saveAgentStore(store);

  // #2085 — push into swarm store's agents array so swarm_status reports it.
  try {
    const { loadSwarmStore: _loadSwarmStore, saveSwarmStore: _saveSwarmStore } =
      await import('./swarm-tools.js');
    const swarmStore = _loadSwarmStore();
    let targetSwarmId = (input.swarmId as string) || '';
    if (!targetSwarmId) {
      const all = Object.values(swarmStore.swarms);
      const latest = all.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      targetSwarmId = latest?.swarmId || '';
    }
    if (targetSwarmId && swarmStore.swarms[targetSwarmId]) {
      const swarm = swarmStore.swarms[targetSwarmId];
      if (!Array.isArray(swarm.agents)) swarm.agents = [];
      if (!swarm.agents.includes(agentId)) {
        swarm.agents.push(agentId);
        _saveSwarmStore(swarmStore);
      }
    }
  } catch { /* swarm store unavailable — agent still registered globally */ }

  try {
    const { addNode } = await import('../swarmvector/graph-backend.js');
    await addNode({ id: agentId, type: 'agent', name: agentType });
  } catch { /* graph-node not available */ }

  return {
    success: true,
    agentId,
    agentType: agent.agentType,
    model: agent.model,
    modelRoutedBy: routingResult.routedBy,
    ...(routingResult.modelId ? { modelId: routingResult.modelId } : {}),
    ...(routingResult.provider ? { provider: routingResult.provider } : {}),
    ...(routingResult.openrouterModel ? { openrouterModel: routingResult.openrouterModel } : {}),
    createdAt: agent.createdAt,
    ...(routingResult.canSkipLLM
      ? { canSkipLLM: true, codemodIntent: routingResult.codemodIntent, tier: routingResult.tier }
      : routingResult.tier ? { tier: routingResult.tier } : {}),
  };
}

export const agentTools: MCPTool[] = [
  {
    name: 'agent_spawn',
    description: 'Spawn a Swarmdo-tracked agent with cost attribution, memory persistence, and swarm coordination. Use when native Task is wrong because you need per-agent cost tracking, cross-session learning, or swarm-topology coordination; for one-shot subtasks native Task is fine. For spawn-and-run in one call use agent_run; pair with hooks_route to pick the model first.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentType: { type: 'string', description: 'Type of agent to spawn' },
        agentId: { type: 'string', description: 'Optional custom agent ID' },
        // #2085 — accept swarmId so spawned agents register in the
        // swarm.agents array that swarm_status reports. Omit to register
        // with the most-recently-created swarm.
        swarmId: { type: 'string', description: 'Optional swarm to register the agent with (defaults to most-recent swarm)' },
        config: { type: 'object', description: 'Agent configuration' },
        domain: { type: 'string', description: 'Agent domain' },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus', 'opus-4.7', 'inherit'],
          description: 'Claude model alias (haiku=fast/cheap, sonnet=balanced, opus=current Opus 4.8, opus-4.7=prior Opus pin)'
        },
        task: { type: 'string', description: 'Task description for intelligent model routing' },
      },
      required: ['agentType'],
    },
    handler: async (input) => {
      const registration = await registerAgent(input);
      if (!registration.success) return registration;

      const response: Record<string, unknown> = {
        ...registration,
        status: 'registered',
        note: registration.canSkipLLM
          ? `Deterministic codemod can apply "${registration.codemodIntent}" — call the hooks_codemod MCP tool (intent="${registration.codemodIntent}"), $0, no LLM`
          : 'Agent registered for coordination. Four execution paths: ' +
            '(1) call agent_run(agentType, prompt) — spawn + execute in one call (recommended for one-shot work); ' +
            '(2) call agent_execute(agentId, prompt) — direct LLM call on this existing agent (multi-turn); ' +
            '(3) Claude Code Task tool — spawns a real subagent; ' +
            '(4) claude -p — headless background instance.',
      };
      return response;
    },
  },
  {
    name: 'agent_bridge_register',
    description:
      "Register a REAL Claude Code Agent-tool agent into Swarmdo's registry so `swarmdo agent list` and `swarm_status` reflect it. Usually unnecessary since #108: the SubagentStart hook from `swarmdo init` auto-registers every subagent — call by hand only when that hook isn't installed or to bind an agent it can't see. Unlike agent_spawn (coordination metadata only), this binds the record to a worker that actually exists.",
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The Claude Code agent name (e.g. "research-ccgap")' },
        sessionId: { type: 'string', description: 'The Claude Code session id (from name@session-…)' },
        agentType: { type: 'string', description: 'The subagent_type (e.g. general-purpose, coder). Default general-purpose.' },
        task: { type: 'string', description: 'One-line task/prompt summary' },
      },
      required: ['name'],
    },
    handler: async (input) => {
      const src = input as Record<string, unknown>;
      const name = String(src.name || '').trim();
      if (!name) return { success: false, error: 'name is required (the Claude Code agent name)' };
      const descriptor = {
        name,
        sessionId: src.sessionId ? String(src.sessionId) : undefined,
        agentType: String(src.agentType || 'general-purpose'),
        task: src.task ? String(src.task) : undefined,
      };
      const spawnInput = buildSpawnInput(descriptor, new Date().toISOString());

      // Auto-swarm: registering a Claude Code agent spins up a swarm from the
      // project config (anti-drift defaults if absent) when none is running, and
      // enrolls this agent into it — so bridged agents coordinate instead of
      // floating unattached. registerAgent honors spawnInput.swarmId to join.
      let swarm: { swarmId: string; topology: string; created: boolean } | undefined;
      try {
        const { ensureActiveSwarm } = await import('./swarm-tools.js');
        const cfg = readSwarmConfigDefaults();
        swarm = ensureActiveSwarm({
          topology: cfg.topology || 'hierarchical',
          maxAgents: cfg.maxAgents || 8,
          strategy: cfg.strategy || 'specialized',
        });
        spawnInput.swarmId = swarm.swarmId;
      } catch {
        /* swarm optional — the agent still registers in the global store */
      }

      const res = await registerAgent(spawnInput);
      if (!res.success) return res;
      return {
        ...res,
        bound: true,
        origin: 'claude-code',
        claudeName: descriptor.name,
        status: 'registered',
        ...(swarm ? { swarm } : {}),
      };
    },
  },
  {
    name: 'agent_bridge_list',
    description:
      'List Swarmdo agent records split into Claude-Code-BOUND (each mirrors a real Task/Agent-tool agent) vs NATIVE, with binding detail. Pass `live` (current Claude Code agent names) to also get a reconciliation: which live agents are unmirrored (need agent_bridge_register) and which bound records are orphaned.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        live: {
          type: 'array',
          items: { type: 'string' },
          description: 'Current live Claude Code agent names, for reconciliation',
        },
      },
    },
    handler: async (input) => {
      const all = Object.values(loadAllAgents()) as unknown as SwarmdoAgentLike[];
      const summarize = (a: SwarmdoAgentLike) => ({
        agentId: a.agentId,
        agentType: a.agentType,
        status: a.status,
        ...(isBound(a) ? { binding: a.config!.binding } : {}),
      });
      const bound = all.filter(isBound).map(summarize);
      const native = all.filter((a) => !isBound(a)).map(summarize);
      const liveRaw = (input as Record<string, unknown>).live;
      const live = Array.isArray(liveRaw) ? liveRaw.map(String) : undefined;
      const reconciliation = live ? reconcile(all, live) : undefined;
      return {
        total: all.length,
        boundCount: bound.length,
        nativeCount: native.length,
        bound,
        native,
        ...(reconciliation ? { reconciliation } : {}),
      };
    },
  },
  {
    name: 'agent_bridge_prune',
    description:
      "Reap orphaned Claude-Code-bound records — bound agents whose Claude Code agent is no longer live. Pass the current live agent names as `live`; any bound record not in that list is removed from the agent store and every swarm roster. Native (unbound) agents are never touched; idempotent.",
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        live: {
          type: 'array',
          items: { type: 'string' },
          description: 'Current live Claude Code agent names; bound records not in this list are pruned',
        },
      },
      required: ['live'],
    },
    handler: async (input) => {
      const liveRaw = (input as Record<string, unknown>).live;
      const live = Array.isArray(liveRaw) ? liveRaw.map(String) : [];
      const all = Object.values(loadAllAgents()) as unknown as SwarmdoAgentLike[];
      const toPrune = orphanedAgentIds(all, live);
      if (toPrune.length === 0) return { pruned: [], count: 0 };
      // Remove from the canonical agent store (bound records always live here).
      const store = loadAgentStore();
      for (const id of toPrune) delete store.agents[id];
      saveAgentStore(store);
      // Remove from any swarm roster so swarm_status doesn't report ghosts.
      try {
        const { loadSwarmStore: _loadSwarmStore, saveSwarmStore: _saveSwarmStore } = await import('./swarm-tools.js');
        const swarmStore = _loadSwarmStore();
        const pruneSet = new Set(toPrune);
        let changed = false;
        for (const swarm of Object.values(swarmStore.swarms)) {
          if (Array.isArray(swarm.agents)) {
            const before = swarm.agents.length;
            swarm.agents = swarm.agents.filter((a: string) => !pruneSet.has(a));
            if (swarm.agents.length !== before) changed = true;
          }
        }
        if (changed) _saveSwarmStore(swarmStore);
      } catch {
        /* swarm store optional — records already removed from the agent store */
      }
      return { pruned: toPrune, count: toPrune.length };
    },
  },
  {
    // ADR-095 G3 — spawn + execute fused. Closes the #1 UX trap from the
    // 2026-04 audit (@roman-rr): `agent_spawn` looks like it spawns a worker
    // but only registers metadata. New callers who want "register an agent
    // AND run a task on it" should use agent_run — one tool call, real LLM
    // round-trip, same cost-tracking + swarm-coordination + graph-DB side
    // effects as agent_spawn. Blocks ~2-5s on the LLM call; `agent_spawn`
    // stays cheap (<100ms) to preserve the swarm coordinator latency budget
    // documented at @swarmdo/swarm/src/unified-coordinator.ts:7-8.
    name: 'agent_run',
    description: 'Spawn a Swarmdo-tracked agent and execute a task on it in one call — reuses the same model routing, cost attribution, swarm registration, and graph-DB record as agent_spawn, then calls the Anthropic Messages API (or OpenRouter / Ollama per SWARMDO_PROVIDER). Blocks ~2-5s. For cheap registration without execution use agent_spawn; for multi-turn work on an existing agent use agent_execute.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentType: { type: 'string', description: 'Type of agent to spawn (coder, researcher, etc.)' },
        prompt: { type: 'string', description: 'Task / prompt for the agent to execute' },
        agentId: { type: 'string', description: 'Optional custom agent ID' },
        swarmId: { type: 'string', description: 'Optional swarm to register the agent with (defaults to most-recent swarm)' },
        config: { type: 'object', description: 'Agent configuration' },
        domain: { type: 'string', description: 'Agent domain' },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus', 'opus-4.7', 'inherit'],
          description: 'Claude model alias (haiku=fast/cheap, sonnet=balanced, opus=current Opus 4.8, opus-4.7=prior Opus pin)'
        },
        task: { type: 'string', description: 'Task description for intelligent model routing (separate from prompt)' },
        systemPrompt: { type: 'string', description: 'Optional system prompt (overrides agent default)' },
        ponytail: { type: 'boolean', description: 'Prepend the ponytail lazy-senior-dev persona (YAGNI, minimal code)' },
        maxTokens: { type: 'number', description: 'Max output tokens (default 1024)' },
        temperature: { type: 'number', description: 'Sampling temperature 0..1 (default 0.7)' },
        timeoutMs: { type: 'number', description: 'LLM call timeout in ms (default 60000)' },
      },
      required: ['agentType', 'prompt'],
    },
    handler: async (input) => {
      const vP = validateText(input.prompt as string, 'prompt');
      if (!vP.valid) return { success: false, error: `Input validation failed: ${vP.error}` };

      const registration = await registerAgent(input);
      if (!registration.success) return registration;

      // ADR-143 — if the router determined a deterministic codemod can apply,
      // skip the LLM call entirely and surface the recommendation. The agent
      // is still registered so subsequent agent_execute calls work normally.
      if (registration.canSkipLLM) {
        return {
          ...registration,
          status: 'codemod_recommended',
          execution: {
            skipped: true,
            reason: `Deterministic codemod available — call hooks_codemod (intent="${registration.codemodIntent}") instead. $0, no LLM.`,
            codemodIntent: registration.codemodIntent,
          },
        };
      }

      const exec = await executeAgentTask({
        agentId: registration.agentId as string,
        prompt: input.prompt as string,
        systemPrompt: input.systemPrompt as string | undefined,
        ponytail: input.ponytail as boolean | undefined,
        maxTokens: input.maxTokens as number | undefined,
        temperature: input.temperature as number | undefined,
        timeoutMs: input.timeoutMs as number | undefined,
      });

      return {
        success: exec.success,
        agentId: registration.agentId,
        agentType: registration.agentType,
        model: registration.model,
        modelRoutedBy: registration.modelRoutedBy,
        ...(registration.modelId ? { modelId: registration.modelId } : {}),
        ...(registration.provider ? { provider: registration.provider } : {}),
        ...(registration.openrouterModel ? { openrouterModel: registration.openrouterModel } : {}),
        ...(registration.tier ? { tier: registration.tier } : {}),
        status: exec.success ? 'completed' : 'failed',
        createdAt: registration.createdAt,
        execution: exec,
      };
    },
  },
  {
    // ADR-095 G1: real LLM execution via the agent registry. Previously
    // agent_spawn registered metadata but nothing dispatched work to a
    // provider — the wire between AnthropicProvider and the agent
    // registry was missing, as the April audit (@roman-rr) called out.
    // agent_execute closes that wire by reading the agent's configured
    // model, calling the Anthropic Messages API directly via fetch, and
    // updating the agent record with lastResult / taskCount / status.
    // No mock — actual HTTP request to api.anthropic.com.
    name: 'agent_execute',
    description: 'Run a task on a previously-spawned agent_spawn record via the Anthropic Messages API with that agent\'s configured model. Use when native Task is wrong because you need the spawned agent\'s persistent config, lifecycle updates (taskCount, lastResult), or explicit model routing; for one-shot prompts without a tracked agent, native Task is fine. Requires ANTHROPIC_API_KEY.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of the spawned agent' },
        prompt: { type: 'string', description: 'Task / prompt for the agent to execute' },
        systemPrompt: { type: 'string', description: 'Optional system prompt (overrides agent default)' },
        ponytail: { type: 'boolean', description: 'Prepend the ponytail lazy-senior-dev persona (YAGNI, minimal code)' },
        maxTokens: { type: 'number', description: 'Max output tokens (default 1024)' },
        temperature: { type: 'number', description: 'Sampling temperature 0..1 (default 0.7)' },
      },
      required: ['agentId', 'prompt'],
    },
    handler: async (input) => {
      const vId = validateIdentifier(input.agentId, 'agentId');
      if (!vId.valid) return { success: false, error: `Input validation failed: ${vId.error}` };
      const vP = validateText(input.prompt as string, 'prompt');
      if (!vP.valid) return { success: false, error: `Input validation failed: ${vP.error}` };

      // Delegate to the shared core (also used by the workflow runtime).
      return executeAgentTask({
        agentId: input.agentId as string,
        prompt: input.prompt as string,
        systemPrompt: input.systemPrompt as string | undefined,
        ponytail: input.ponytail as boolean | undefined,
        maxTokens: input.maxTokens as number | undefined,
        temperature: input.temperature as number | undefined,
        timeoutMs: input.timeoutMs as number | undefined,
      });
    },
  },
  {
    name: 'agent_terminate',
    description: 'Remove a Swarmdo-tracked agent from the registry and free its swarm slot — finalizes its cost-tracking row, reclaims a topology slot, or ends a stuck agent without restarting the swarm. For one-shot Task invocations that self-terminate, this tool is not needed. Pair with agent_list first to confirm the agentId.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent to terminate' },
        force: { type: 'boolean', description: 'Force immediate termination' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const v = validateIdentifier(input.agentId, 'agentId');
      if (!v.valid) return { success: false, error: `Input validation failed: ${v.error}` };

      const store = loadAgentStore();
      const agentId = input.agentId as string;

      if (store.agents[agentId]) {
        store.agents[agentId].status = 'terminated';
        saveAgentStore(store);
        return {
          success: true,
          agentId,
          terminated: true,
          terminatedAt: new Date().toISOString(),
        };
      }

      return {
        success: false,
        agentId,
        error: 'Agent not found',
      };
    },
  },
  {
    name: 'agent_status',
    description: 'Read the lifecycle state of a single tracked agent: status, taskCount, lastResult, model, health score. Use when native Task is wrong because you need agent-level state across turns rather than a one-shot response; for inspecting a Task you just ran, native output is fine. Pair with agent_list to find the agentId.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const v = validateIdentifier(input.agentId, 'agentId');
      if (!v.valid) return { agentId: input.agentId, status: 'not_found', error: `Input validation failed: ${v.error}` };

      const agentId = input.agentId as string;
      const agent = loadAllAgents()[agentId]; // #1916: includes hive-mind-spawned workers

      if (agent) {
        return {
          agentId: agent.agentId,
          agentType: agent.agentType,
          status: agent.status,
          health: agent.health,
          taskCount: agent.taskCount,
          createdAt: agent.createdAt,
          domain: agent.domain,
          lastResult: agent.lastResult || null,
        };
      }

      return {
        agentId,
        status: 'not_found',
        error: 'Agent not found',
      };
    },
  },
  {
    name: 'agent_list',
    description: 'List every Swarmdo-tracked agent in the registry with its type, model, status, and taskCount. Use when native Task is wrong because you need the swarm-wide agent inventory across turns rather than a new one-shot Task; filter by status/domain/agentType. For a fresh single-shot subagent, native Task is fine.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        domain: { type: 'string', description: 'Filter by domain' },
        includeTerminated: { type: 'boolean', description: 'Include terminated agents' },
      },
    },
    handler: async (input) => {
      if (input.status) {
        const v = validateIdentifier(input.status, 'status');
        if (!v.valid) return { agents: [], total: 0, error: `Input validation failed: ${v.error}` };
      }
      if (input.domain) {
        const v = validateIdentifier(input.domain, 'domain');
        if (!v.valid) return { agents: [], total: 0, error: `Input validation failed: ${v.error}` };
      }

      let agents = Object.values(loadAllAgents()); // #1916: includes hive-mind-spawned workers

      // Filter by status
      if (input.status) {
        agents = agents.filter(a => a.status === input.status);
      } else if (!input.includeTerminated) {
        agents = agents.filter(a => a.status !== 'terminated');
      }

      // Filter by domain
      if (input.domain) {
        agents = agents.filter(a => a.domain === input.domain);
      }

      return {
        agents: agents.map(a => ({
          agentId: a.agentId,
          agentType: a.agentType,
          status: a.status,
          health: a.health,
          taskCount: a.taskCount,
          createdAt: a.createdAt,
          domain: a.domain,
        })),
        total: agents.length,
        filters: {
          status: input.status,
          domain: input.domain,
          includeTerminated: input.includeTerminated,
        },
      };
    },
  },
  {
    name: 'agent_pool',
    description: 'Manage a fixed-size warm pool of pre-spawned agents to skip cold-start cost on bursty workloads. Use when native Task is wrong because you want to amortize spawn latency, keep stable agentIds across requests, or hold a known agent count for swarm topology. For one-shot work, just call agent_spawn or native Task.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'scale', 'drain', 'fill'], description: 'Pool action' },
        targetSize: { type: 'number', description: 'Target pool size (for scale action)' },
        agentType: { type: 'string', description: 'Agent type filter' },
      },
      required: ['action'],
    },
    handler: async (input) => {
      if (input.agentType) {
        const v = validateIdentifier(input.agentType, 'agentType');
        if (!v.valid) return { action: input.action, error: `Input validation failed: ${v.error}` };
      }

      const store = loadAgentStore();
      const agents = Object.values(store.agents).filter(a => a.status !== 'terminated');
      const action = (input.action as string) || 'status';  // Default to status

      if (action === 'status') {
        const byType: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const agent of agents) {
          byType[agent.agentType] = (byType[agent.agentType] || 0) + 1;
          byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
        }
        const idleAgents = agents.filter(a => a.status === 'idle').length;
        const busyAgents = agents.filter(a => a.status === 'busy').length;
        const utilization = agents.length > 0 ? busyAgents / agents.length : 0;
        return {
          action,
          // CLI expected fields
          poolId: 'agent-pool-default',
          currentSize: agents.length,
          minSize: (input.min as number) || 0,
          maxSize: (input.max as number) || 100,
          autoScale: (input.autoScale as boolean) ?? false,
          utilization,
          agents: agents.map(a => ({
            id: a.agentId,
            type: a.agentType,
            status: a.status,
          })),
          // Additional fields
          id: 'agent-pool-default',
          size: agents.length,
          totalAgents: agents.length,
          byType,
          byStatus,
          avgHealth: agents.length > 0 ? agents.reduce((sum, a) => sum + a.health, 0) / agents.length : 0,
        };
      }

      if (action === 'scale') {
        const targetSize = (input.targetSize as number) || 5;
        const agentType = (input.agentType as string) || 'worker';
        const currentSize = agents.filter(a => a.agentType === agentType).length;
        const delta = targetSize - currentSize;
        const added: string[] = [];
        const removed: string[] = [];

        if (delta > 0) {
          for (let i = 0; i < delta; i++) {
            const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            store.agents[agentId] = {
              agentId,
              agentType,
              status: 'idle',
              health: 1.0,
              taskCount: 0,
              config: {},
              createdAt: new Date().toISOString(),
            };
            added.push(agentId);
          }
        } else if (delta < 0) {
          const toRemove = agents.filter(a => a.agentType === agentType && a.status === 'idle').slice(0, -delta);
          for (const agent of toRemove) {
            store.agents[agent.agentId].status = 'terminated';
            removed.push(agent.agentId);
          }
        }

        saveAgentStore(store);
        return {
          action,
          agentType,
          previousSize: currentSize,
          targetSize,
          newSize: currentSize + delta,
          added,
          removed,
        };
      }

      if (action === 'drain') {
        const agentType = input.agentType as string;
        let drained = 0;
        for (const agent of agents) {
          if (!agentType || agent.agentType === agentType) {
            if (agent.status === 'idle') {
              store.agents[agent.agentId].status = 'terminated';
              drained++;
            }
          }
        }
        saveAgentStore(store);
        return {
          action,
          agentType: agentType || 'all',
          drained,
          remaining: agents.length - drained,
        };
      }

      return { action, error: 'Unknown action' };
    },
  },
  {
    name: 'agent_health',
    description: 'Compute an agent\'s rolling health score (0-1) from recent task success ratio, latency p50/p95, and error rate. Use when native Task is wrong because you\'re running a long-lived agent and need to catch degradation before the breaker trips it; one-shot Tasks have no history to score. Pair with hooks_post-task to keep scores current.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Specific agent ID (optional)' },
        threshold: { type: 'number', description: 'Health threshold (0-1)' },
      },
    },
    handler: async (input) => {
      if (input.agentId) {
        const v = validateIdentifier(input.agentId, 'agentId');
        if (!v.valid) return { agentId: input.agentId, error: `Input validation failed: ${v.error}` };
      }

      const store = loadAgentStore();
      const agents = Object.values(store.agents).filter(a => a.status !== 'terminated');
      const threshold = (input.threshold as number) || 0.5;

      if (input.agentId) {
        const agent = store.agents[input.agentId as string];
        if (agent) {
          return {
            agentId: agent.agentId,
            health: agent.health,
            status: agent.status,
            healthy: agent.health >= threshold,
            taskCount: agent.taskCount,
            uptime: Date.now() - new Date(agent.createdAt).getTime(),
          };
        }
        return { agentId: input.agentId, error: 'Agent not found' };
      }

      const healthyAgents = agents.filter(a => a.health >= threshold);
      const degradedAgents = agents.filter(a => a.health >= 0.3 && a.health < threshold);
      const unhealthyAgents = agents.filter(a => a.health < 0.3);
      const avgHealth = agents.length > 0 ? agents.reduce((sum, a) => sum + a.health, 0) / agents.length : 1;

      return {
        // CLI expected fields
        agents: agents.map(a => {
          const uptime = Date.now() - new Date(a.createdAt).getTime();
          return {
            id: a.agentId,
            type: a.agentType,
            health: a.health >= threshold ? 'healthy' : (a.health >= 0.3 ? 'degraded' : 'unhealthy'),
            uptime,
            tasks: { active: a.taskCount > 0 ? 1 : 0, queued: 0, completed: a.taskCount, failed: 0 },
            _note: 'Per-agent OS metrics not available — use system_metrics for real CPU/memory',
          };
        }),
        overall: {
          healthy: healthyAgents.length,
          degraded: degradedAgents.length,
          unhealthy: unhealthyAgents.length,
          cpu: null,
          memory: null,
          _note: 'Per-agent CPU/memory not available — use system_metrics for real OS-level stats',
          score: Math.round(avgHealth * 100),
          issues: unhealthyAgents.length,
        },
        // Additional fields
        total: agents.length,
        healthyCount: healthyAgents.length,
        unhealthyCount: unhealthyAgents.length,
        threshold,
        avgHealth,
        unhealthyAgents: unhealthyAgents.map(a => ({
          agentId: a.agentId,
          health: a.health,
          status: a.status,
        })),
      };
    },
  },
  {
    name: 'agent_update',
    description: 'Mutate a tracked agent\'s config (model, instructions, status, health) without re-spawning. Use when native Task is wrong because the agent already has accumulated state (taskCount, swarm membership, cost-tracking) and you only need to tweak one field. For a brand-new subagent, agent_spawn (or native Task) is the right call.',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent' },
        status: { type: 'string', description: 'New status' },
        health: { type: 'number', description: 'Health value (0-1)' },
        taskCount: { type: 'number', description: 'Task count' },
        config: { type: 'object', description: 'Config updates' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const v = validateIdentifier(input.agentId, 'agentId');
      if (!v.valid) return { success: false, agentId: input.agentId, error: `Input validation failed: ${v.error}` };
      if (input.status) {
        const vs = validateIdentifier(input.status, 'status');
        if (!vs.valid) return { success: false, agentId: input.agentId, error: `Input validation failed: ${vs.error}` };
      }

      const store = loadAgentStore();
      const agentId = input.agentId as string;
      const agent = store.agents[agentId];

      if (agent) {
        if (input.status) agent.status = input.status as AgentRecord['status'];
        if (typeof input.health === 'number') agent.health = input.health as number;
        if (typeof input.taskCount === 'number') agent.taskCount = input.taskCount as number;
        if (input.config) {
          agent.config = { ...agent.config, ...(input.config as Record<string, unknown>) };
        }
        saveAgentStore(store);

        return {
          success: true,
          agentId,
          updated: true,
          agent: {
            agentId: agent.agentId,
            status: agent.status,
            health: agent.health,
            taskCount: agent.taskCount,
          },
        };
      }

      return {
        success: false,
        agentId,
        error: 'Agent not found',
      };
    },
  },
  {
    // #1916 — the `swarmdo agent logs <id>` CLI subcommand and the guidance
    // surface both reference an `agent_logs` MCP tool that was never
    // registered, so it errored with `MCP tool not found: agent_logs`.
    // This is the registered handler. Note: agents don't yet keep a
    // structured per-agent activity log (that lands with hive worker
    // execution wiring — see #1916), so for now we surface the agent's
    // last task result as a single synthetic entry, or an explicit empty
    // response. The shape matches what the CLI `logs` subcommand expects:
    // `{ agentId, entries: [{timestamp,level,message,context?}], total }`.
    name: 'agent_logs',
    description: 'Return recorded activity-log entries for a tracked agent (idle/running history, last task result). Use when native Task is wrong because you need the agent\'s log across turns rather than a one-shot Task transcript; for a Task you just ran, native output is fine. Pair with agent_list to find the agentId. Today it returns only the last task result as a synthetic entry (full per-agent logs pending, upstream/swarmdo#1916).',
    category: 'agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of agent' },
        tail: { type: 'number', description: 'Max recent entries to return (default 50)' },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], description: 'Minimum log level (currently advisory — entries are synthetic)' },
        since: { type: 'string', description: 'Show logs since, e.g. "1h" / "30m" (currently advisory)' },
      },
      required: ['agentId'],
    },
    handler: async (input) => {
      const v = validateIdentifier(input.agentId, 'agentId');
      if (!v.valid) return { agentId: input.agentId, entries: [], total: 0, error: `Input validation failed: ${v.error}` };

      const agentId = input.agentId as string;
      const agent = loadAllAgents()[agentId]; // #1916: includes hive-mind-spawned workers
      if (!agent) {
        return { agentId, entries: [], total: 0, error: 'Agent not found' };
      }

      const entries: Array<{ timestamp: string; level: 'debug' | 'info' | 'warn' | 'error'; message: string; context?: Record<string, unknown> }> = [];
      entries.push({ timestamp: agent.createdAt, level: 'info', message: `agent created (type=${agent.agentType}, status=${agent.status})` });
      if (agent.lastResult) {
        entries.push({ timestamp: agent.createdAt, level: 'info', message: 'last task result', context: agent.lastResult });
      }

      const tail = typeof input.tail === 'number' && input.tail > 0 ? Math.floor(input.tail) : 50;
      const sliced = entries.slice(-tail);
      return {
        agentId: agent.agentId,
        entries: sliced,
        total: entries.length,
        note: 'per-agent activity logging is not yet wired; entries are synthetic (upstream/swarmdo#1916)',
      };
    },
  },
];
