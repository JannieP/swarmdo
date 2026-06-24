/**
 * Task dispatcher — the missing worker (Sprint 3 Move 6').
 *
 * The 2026-04 external audit's sharpest true finding: "task_create / task_assign
 * store a record but NO worker ever picks it up — tasks sit `pending` forever."
 * This closes that gap by draining pending tasks through the SAME proven LLM
 * wire as `agent_run` / `agent_execute` (executeAgentTask → Anthropic /
 * OpenRouter / Ollama), then writing the result back to the task store.
 *
 * Deliberately NOT routed through the in-memory UnifiedSwarmCoordinator: that
 * path's actual execution is still uncertain, whereas executeAgentTask is the
 * verified wire (PR #2). One source of execution truth.
 *
 * Honest degradation: a task with no assignable agent, or with no LLM provider
 * configured, is left `pending`/`failed` with a clear reason — never fabricated
 * as complete.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectCwd } from './types.js';
import { loadTaskStore, saveTaskStore, type TaskRecord } from './task-tools.js';
import { executeAgentTask, type AgentExecuteResult } from './agent-execute-core.js';

export interface DispatchOptions {
  /** Project root (for the .rufflo stores). Default process.cwd(). */
  cwd?: string;
  /** Max tasks to run this pass. Default 10. */
  max?: number;
  /** Don't execute — just report what WOULD run. Default false. */
  dryRun?: boolean;
  /**
   * Execution function — defaults to the real executeAgentTask. Injectable so
   * tests can drive the dispatcher without a network call.
   */
  executor?: (input: { agentId: string; prompt: string }) => Promise<AgentExecuteResult>;
  /**
   * If a pending task has an empty assignedTo, pick any non-terminated agent
   * from the agent store. Default true (so `task_create` without an explicit
   * assignment still gets worked).
   */
  autoAssign?: boolean;
}

export interface DispatchTaskOutcome {
  taskId: string;
  agentId: string | null;
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
  durationMs?: number;
}

export interface DispatchSummary {
  scanned: number;
  pending: number;
  dispatched: number;
  completed: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  outcomes: DispatchTaskOutcome[];
}

interface AgentRecordLite {
  agentId: string;
  status?: string;
}

function agentStorePath(cwd: string): string {
  return join(cwd, '.rufflo', 'agents', 'store.json');
}

function loadAgentIds(cwd: string): AgentRecordLite[] {
  try {
    const p = agentStorePath(cwd);
    if (!existsSync(p)) return [];
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as { agents?: Record<string, AgentRecordLite> };
    return Object.values(parsed.agents ?? {});
  } catch {
    return [];
  }
}

/** Mirror task_complete's agent sync: set assigned agents idle + bump taskCount. */
function syncAgentsAfterTask(cwd: string, agentIds: string[]): void {
  if (agentIds.length === 0) return;
  const p = agentStorePath(cwd);
  try {
    if (!existsSync(p)) return;
    const store = JSON.parse(readFileSync(p, 'utf-8')) as { agents: Record<string, Record<string, unknown>> };
    for (const id of agentIds) {
      const a = store.agents?.[id];
      if (a) {
        a.status = 'idle';
        a.taskCount = ((a.taskCount as number) || 0) + 1;
      }
    }
    writeFileSync(p, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    /* best-effort */
  }
}

function pickAgentFor(task: TaskRecord, agents: AgentRecordLite[]): string | null {
  if (task.assignedTo && task.assignedTo.length > 0) return task.assignedTo[0];
  const candidate = agents.find(a => a.status !== 'terminated');
  return candidate?.agentId ?? null;
}

/**
 * Drain pending tasks. Returns a summary; never throws (per-task failures are
 * captured as `failed` outcomes).
 */
export async function dispatchPendingTasks(opts: DispatchOptions = {}): Promise<DispatchSummary> {
  const cwd = opts.cwd ?? getProjectCwd();
  const max = opts.max ?? 10;
  const dryRun = opts.dryRun ?? false;
  const autoAssign = opts.autoAssign ?? true;
  const executor = opts.executor ?? ((input) => executeAgentTask(input));

  const store = loadTaskStore();
  const all = Object.values(store.tasks);
  const pending = all.filter(t => t.status === 'pending' || t.status === 'in_progress');

  const summary: DispatchSummary = {
    scanned: all.length,
    pending: pending.length,
    dispatched: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    outcomes: [],
  };

  const agents = loadAgentIds(cwd);
  const queue = pending.slice(0, max);

  for (const task of queue) {
    const agentId = autoAssign ? pickAgentFor(task, agents) : (task.assignedTo[0] ?? null);

    if (!agentId) {
      summary.skipped++;
      summary.outcomes.push({ taskId: task.taskId, agentId: null, status: 'skipped', reason: 'no assignable agent (spawn one with agent_spawn, or assign explicitly)' });
      continue;
    }

    if (dryRun) {
      summary.dispatched++;
      summary.outcomes.push({ taskId: task.taskId, agentId, status: 'skipped', reason: 'dry-run' });
      continue;
    }

    // Mark in_progress before executing so a crash leaves a visible state.
    task.status = 'in_progress';
    task.startedAt = task.startedAt ?? new Date().toISOString();
    if (!task.assignedTo.includes(agentId)) task.assignedTo.push(agentId);
    saveTaskStore(store);

    const startedAt = Date.now();
    summary.dispatched++;
    let result: AgentExecuteResult;
    try {
      result = await executor({ agentId, prompt: task.description });
    } catch (err) {
      result = { success: false, agentId, error: err instanceof Error ? err.message : String(err) };
    }
    const durationMs = Date.now() - startedAt;

    if (result.success) {
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date().toISOString();
      task.result = { output: result.output, model: result.model, usage: result.usage, durationMs };
      summary.completed++;
      summary.outcomes.push({ taskId: task.taskId, agentId, status: 'completed', durationMs });
      syncAgentsAfterTask(cwd, [agentId]);
    } else {
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      task.result = { error: result.error, durationMs };
      summary.failed++;
      summary.outcomes.push({ taskId: task.taskId, agentId, status: 'failed', reason: result.error, durationMs });
    }
    saveTaskStore(store);
  }

  return summary;
}
