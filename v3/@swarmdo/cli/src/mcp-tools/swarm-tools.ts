/**
 * Swarm MCP Tools for CLI
 *
 * Tool definitions for swarm coordination with file-based state persistence.
 * Replaces previous stub implementations with real state tracking.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type MCPTool, getProjectCwd } from './types.js';
import { validateIdentifier } from './validate-input.js';

// Swarm state persistence
const SWARM_DIR = '.swarmdo/swarm';
const SWARM_STATE_FILE = 'swarm-state.json';

interface SwarmState {
  swarmId: string;
  topology: string;
  maxAgents: number;
  status: 'initializing' | 'running' | 'paused' | 'shutting_down' | 'terminated';
  agents: string[];
  tasks: string[];
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /**
   * #1799 — process that initialized this swarm. Used by reconciliation
   * on `loadSwarmStore()` to detect orphan entries whose host process has
   * already exited (common on Windows where backgrounded daemons don't
   * always survive shell exit). Optional for backward compat with
   * pre-#1799 stores.
   */
  pid?: number;
  /** Reason set when status was forced to 'terminated' by reconciliation. */
  terminationReason?: string;
}

interface SwarmStore {
  swarms: Record<string, SwarmState>;
  version: string;
}

function getSwarmDir(): string {
  return join(getProjectCwd(), SWARM_DIR);
}

function getSwarmStatePath(): string {
  return join(getSwarmDir(), SWARM_STATE_FILE);
}

function ensureSwarmDir(): void {
  const dir = getSwarmDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * #1799 — return true when `pid` belongs to a live process. process.kill(pid, 0)
 * with signal 0 is the documented liveness probe: ESRCH ⇒ dead, EPERM ⇒ alive
 * but owned by another user (still alive — don't reap), success ⇒ alive.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * #1799 — Walk swarms with status='running' and mark orphans as 'terminated':
 *
 *   - PID-based: if `pid` is set and the process is dead, the swarm is an
 *     orphan (host crashed / shell exited / daemon backgrounded poorly).
 *   - TTL fallback: pre-#1799 entries have no `pid`; reap them when their
 *     `updatedAt` is older than 24h. This is conservative — long-idle but
 *     legitimately running swarms can recover by writing a heartbeat.
 *
 * Mutates `store` in place; returns the count for the caller to decide
 * whether to persist.
 */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;
function reconcileOrphanSwarms(store: SwarmStore): number {
  let reconciled = 0;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  for (const swarm of Object.values(store.swarms)) {
    if (swarm.status !== 'running') continue;
    let orphanReason: string | null = null;
    if (typeof swarm.pid === 'number') {
      if (!isPidAlive(swarm.pid)) {
        orphanReason = `host process ${swarm.pid} exited`;
      }
    } else {
      const ageMs = nowMs - new Date(swarm.updatedAt).getTime();
      if (Number.isFinite(ageMs) && ageMs > ORPHAN_TTL_MS) {
        orphanReason = `no pid recorded and heartbeat is ${Math.round(ageMs / 3600000)}h stale`;
      }
    }
    if (orphanReason) {
      swarm.status = 'terminated';
      swarm.terminationReason = orphanReason;
      swarm.updatedAt = nowIso;
      reconciled++;
    }
  }
  return reconciled;
}

// #2085 — exported so `agent-tools.ts agent_spawn` can push into
// `swarm.agents` (the field `swarm_status` reads).
export function loadSwarmStore(): SwarmStore {
  let store: SwarmStore = { swarms: {}, version: '3.0.0' };
  try {
    const path = getSwarmStatePath();
    if (existsSync(path)) {
      store = JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch { /* fall through with default */ }

  // #1799 — reconcile orphans on every load and persist if anything changed.
  // Cheap (process.kill(pid, 0) is sub-millisecond) and means
  // `swarm_status`/`swarm_health` never see ghost "running" entries.
  const reconciled = reconcileOrphanSwarms(store);
  if (reconciled > 0) {
    try { saveSwarmStore(store); } catch { /* best-effort */ }
  }
  return store;
}

export function saveSwarmStore(store: SwarmStore): void {
  ensureSwarmDir();
  writeFileSync(getSwarmStatePath(), JSON.stringify(store, null, 2), 'utf-8');
}

// Input validation
const VALID_TOPOLOGIES = new Set([
  'hierarchical', 'mesh', 'hierarchical-mesh', 'ring', 'star', 'hybrid', 'adaptive',
]);

export interface CreateSwarmOptions {
  topology?: string;
  maxAgents?: number;
  strategy?: string;
  config?: Record<string, unknown>;
  /**
   * When true, do NOT stamp the host `pid` — the swarm is a persistent logical
   * coordination record, not tied to one process's lifetime, so it survives
   * ephemeral CLI invocations (the agent bridge) instead of being reaped by the
   * #1799 PID-orphan check the instant the creating process exits. Such swarms
   * still expire via the 24h idle-TTL fallback. Daemon-hosted swarms
   * (`swarm_init`) leave this false so a dead host IS reaped promptly.
   */
  persistent?: boolean;
}

/**
 * Create + persist a swarm. Extracted from the `swarm_init` handler so other
 * subsystems (the Claude-Code agent bridge) can spin up a swarm from config
 * WITHOUT duplicating the store-write. Throws on an invalid topology. Shared
 * single source of truth — no parallel swarm creation.
 */
export function createSwarm(opts: CreateSwarmOptions): SwarmState {
  const topology = opts.topology || 'hierarchical-mesh';
  const maxAgents = Math.min(Math.max(opts.maxAgents || 15, 1), 50);
  const strategy = opts.strategy || 'specialized';
  const config = opts.config || {};
  if (!VALID_TOPOLOGIES.has(topology)) {
    throw new Error(`Invalid topology: ${topology}. Valid: ${[...VALID_TOPOLOGIES].join(', ')}`);
  }
  const swarmId = `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const swarmState: SwarmState = {
    swarmId,
    topology,
    maxAgents,
    status: 'running',
    agents: [],
    tasks: [],
    config: {
      topology,
      maxAgents,
      strategy,
      communicationProtocol: (config.communicationProtocol as string) || 'message-bus',
      autoScaling: (config.autoScaling as boolean) ?? true,
      consensusMechanism: (config.consensusMechanism as string) || 'majority',
    },
    createdAt: now,
    updatedAt: now,
    // Persistent (bridge) swarms omit the pid so they aren't reaped on process
    // exit; daemon-hosted swarms record it for prompt orphan reconciliation.
    ...(opts.persistent ? {} : { pid: process.pid }),
  };
  const store = loadSwarmStore();
  store.swarms[swarmId] = swarmState;
  saveSwarmStore(store);
  return swarmState;
}

/**
 * Return the most-recent RUNNING swarm, or create one from `defaults` if none
 * exists. Used by the agent bridge so registering a Claude Code agent
 * auto-spins-up a swarm (from the project's anti-drift config) and enrolls it,
 * instead of leaving the agent unattached.
 */
export function ensureActiveSwarm(defaults: CreateSwarmOptions): { swarmId: string; topology: string; created: boolean } {
  const store = loadSwarmStore();
  const running = Object.values(store.swarms)
    .filter((s) => s.status === 'running')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (running) return { swarmId: running.swarmId, topology: running.topology, created: false };
  const s = createSwarm({ ...defaults, persistent: true });
  return { swarmId: s.swarmId, topology: s.topology, created: true };
}

export const swarmTools: MCPTool[] = [
  {
    name: 'swarm_init',
    description: 'Initialize a swarm with persistent state tracking Use when native Task tool is wrong because you need multi-agent coordination — topology (hierarchical/mesh/star), consensus (raft/byzantine/gossip/crdt/quorum), shared memory namespace, or anti-drift gates. For independent one-shot subagents, native Task is fine; spawn each separately.',
    category: 'swarm',
    inputSchema: {
      type: 'object',
      properties: {
        topology: { type: 'string', description: 'Swarm topology type (hierarchical, mesh, hierarchical-mesh, ring, star, hybrid, adaptive)' },
        maxAgents: { type: 'number', description: 'Maximum number of agents (1-50)' },
        strategy: { type: 'string', description: 'Agent strategy (specialized, balanced, adaptive)' },
        config: { type: 'object', description: 'Additional swarm configuration' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.topology) {
        const v = validateIdentifier(input.topology, 'topology');
        if (!v.valid) return { success: false, error: v.error };
      }
      if (input.strategy) {
        const v = validateIdentifier(input.strategy, 'strategy');
        if (!v.valid) return { success: false, error: v.error };
      }

      const strategy = (input.strategy as string) || 'specialized';
      let swarmState: SwarmState;
      try {
        swarmState = createSwarm({
          topology: input.topology as string | undefined,
          maxAgents: input.maxAgents as number | undefined,
          strategy,
          config: (input.config || {}) as Record<string, unknown>,
        });
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }

      return {
        success: true,
        swarmId: swarmState.swarmId,
        topology: swarmState.topology,
        strategy,
        maxAgents: swarmState.maxAgents,
        initializedAt: swarmState.createdAt,
        config: swarmState.config,
        persisted: true,
      };
    },
  },
  {
    name: 'swarm_status',
    description: 'Get swarm status from persistent state Use when native Task tool is wrong because you need multi-agent coordination — topology (hierarchical/mesh/star), consensus (raft/byzantine/gossip/crdt/quorum), shared memory namespace, or anti-drift gates. For independent one-shot subagents, native Task is fine; spawn each separately.',
    category: 'swarm',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: { type: 'string', description: 'Swarm ID (omit for most recent)' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.swarmId) {
        const v = validateIdentifier(input.swarmId, 'swarmId');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadSwarmStore();
      const swarmId = input.swarmId as string;

      if (swarmId && store.swarms[swarmId]) {
        const swarm = store.swarms[swarmId];
        return {
          swarmId: swarm.swarmId,
          status: swarm.status,
          topology: swarm.topology,
          maxAgents: swarm.maxAgents,
          agentCount: swarm.agents.length,
          taskCount: swarm.tasks.length,
          config: swarm.config,
          createdAt: swarm.createdAt,
          updatedAt: swarm.updatedAt,
        };
      }

      // Return most recent swarm if no ID specified
      const swarmIds = Object.keys(store.swarms);
      if (swarmIds.length === 0) {
        return {
          status: 'no_swarm',
          message: 'No active swarms. Use swarm_init to create one.',
          totalSwarms: 0,
        };
      }

      const latest = swarmIds
        .map(id => store.swarms[id])
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      return {
        swarmId: latest.swarmId,
        status: latest.status,
        topology: latest.topology,
        maxAgents: latest.maxAgents,
        agentCount: latest.agents.length,
        taskCount: latest.tasks.length,
        config: latest.config,
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
        totalSwarms: swarmIds.length,
      };
    },
  },
  {
    name: 'swarm_shutdown',
    description: 'Shutdown a swarm and update persistent state Use when native Task tool is wrong because you need multi-agent coordination — topology (hierarchical/mesh/star), consensus (raft/byzantine/gossip/crdt/quorum), shared memory namespace, or anti-drift gates. For independent one-shot subagents, native Task is fine; spawn each separately.',
    category: 'swarm',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: { type: 'string', description: 'Swarm ID to shutdown' },
        graceful: { type: 'boolean', description: 'Graceful shutdown (default: true)' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.swarmId) {
        const v = validateIdentifier(input.swarmId, 'swarmId');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadSwarmStore();
      const swarmId = input.swarmId as string;

      // Find the swarm
      let target: SwarmState | undefined;
      if (swarmId && store.swarms[swarmId]) {
        target = store.swarms[swarmId];
      } else {
        // Shutdown most recent running swarm
        const running = Object.values(store.swarms)
          .filter(s => s.status === 'running')
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        target = running[0];
      }

      if (!target) {
        return {
          success: false,
          error: swarmId ? `Swarm ${swarmId} not found` : 'No running swarms to shutdown',
        };
      }

      if (target.status === 'terminated') {
        return {
          success: false,
          swarmId: target.swarmId,
          error: 'Swarm already terminated',
        };
      }

      target.status = 'terminated';
      target.updatedAt = new Date().toISOString();
      saveSwarmStore(store);

      return {
        success: true,
        swarmId: target.swarmId,
        terminated: true,
        graceful: (input.graceful as boolean) ?? true,
        agentsTerminated: target.agents.length,
        terminatedAt: target.updatedAt,
      };
    },
  },
  {
    name: 'swarm_health',
    description: 'Check swarm health status with real state inspection Use when native Task tool is wrong because you need multi-agent coordination — topology (hierarchical/mesh/star), consensus (raft/byzantine/gossip/crdt/quorum), shared memory namespace, or anti-drift gates. For independent one-shot subagents, native Task is fine; spawn each separately.',
    category: 'swarm',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: { type: 'string', description: 'Swarm ID to check' },
      },
    },
    handler: async (input) => {
      // Validate user-provided input (#1425)
      if (input.swarmId) {
        const v = validateIdentifier(input.swarmId, 'swarmId');
        if (!v.valid) return { success: false, error: v.error };
      }

      const store = loadSwarmStore();
      const swarmId = input.swarmId as string;

      // Find the swarm
      let target: SwarmState | undefined;
      if (swarmId) {
        target = store.swarms[swarmId];
        if (!target) {
          return {
            status: 'not_found',
            healthy: false,
            checks: [
              { name: 'swarm_exists', status: 'fail', message: `Swarm ${swarmId} not found` },
            ],
            checkedAt: new Date().toISOString(),
          };
        }
      } else {
        const running = Object.values(store.swarms)
          .filter(s => s.status === 'running')
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        target = running[0];
      }

      if (!target) {
        return {
          status: 'no_swarm',
          healthy: false,
          checks: [
            { name: 'swarm_exists', status: 'fail', message: 'No active swarm found' },
          ],
          checkedAt: new Date().toISOString(),
        };
      }

      const isRunning = target.status === 'running';
      const stateFileExists = existsSync(getSwarmStatePath());

      const checks = [
        {
          name: 'coordinator',
          status: isRunning ? 'ok' : 'warn',
          message: isRunning ? 'Coordinator active' : `Swarm status: ${target.status}`,
        },
        {
          name: 'agents',
          status: target.agents.length > 0 ? 'ok' : 'info',
          message: `${target.agents.length} agents registered (max: ${target.maxAgents})`,
        },
        {
          name: 'persistence',
          status: stateFileExists ? 'ok' : 'warn',
          message: stateFileExists ? 'State file persisted' : 'State file missing',
        },
        {
          name: 'topology',
          status: 'ok',
          message: `Topology: ${target.topology}`,
        },
      ];

      const healthy = isRunning && stateFileExists;

      return {
        status: healthy ? 'healthy' : 'degraded',
        healthy,
        swarmId: target.swarmId,
        topology: target.topology,
        agentCount: target.agents.length,
        checks,
        checkedAt: new Date().toISOString(),
      };
    },
  },
];
