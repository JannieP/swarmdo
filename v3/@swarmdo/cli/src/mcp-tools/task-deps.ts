/**
 * task-deps.ts — dependency edges for the task store (DAG semantics).
 *
 * Capability modeled on beads (github.com/gastownhall/beads, 25.1k★): work
 * items form a dependency graph; the queries that matter to agents are
 * "what is READY now" and "what just got unblocked". The task_create MCP
 * tool has advertised "dependency tracking" in its description since it
 * shipped — this module makes that sentence true.
 *
 * Semantics:
 *   - `dependsOn` lists task ids that must reach status 'completed' before
 *     this task is ready. failed/cancelled do NOT satisfy a dependency —
 *     a task whose dependency failed stays blocked until a human (or agent)
 *     retries or cancels it; silently running on a failed prerequisite is
 *     how half-built states escape.
 *   - Missing dependency ids block forever and are surfaced as such.
 *   - The graph must stay acyclic; edits that would close a cycle are
 *     rejected with the offending path.
 */

import type { TaskRecord, TaskStore } from './task-tools.js';

export interface DepValidation {
  ok: boolean;
  error?: string;
}

/** Terminal-success is the only state that satisfies a dependency. */
function satisfies(dep: TaskRecord | undefined): boolean {
  return dep?.status === 'completed';
}

/**
 * Validate a dependency list for a task (existing id, or an id about to be
 * created). Checks existence, self-reference, duplicates, and — for edits
 * to existing tasks — acyclicity.
 */
export function validateDependencies(store: TaskStore, taskId: string | null, dependsOn: string[]): DepValidation {
  const seen = new Set<string>();
  for (const dep of dependsOn) {
    if (dep === taskId) return { ok: false, error: `task cannot depend on itself (${dep})` };
    if (seen.has(dep)) return { ok: false, error: `duplicate dependency: ${dep}` };
    seen.add(dep);
    if (!store.tasks[dep]) return { ok: false, error: `dependency does not exist: ${dep}` };
  }

  // Cycle check only matters when the task already exists (a brand-new id
  // cannot be depended upon yet, so no cycle can close through it).
  if (taskId && store.tasks[taskId]) {
    const path = findPathToTarget(store, dependsOn, taskId);
    if (path) {
      return { ok: false, error: `dependency cycle: ${[taskId, ...path].join(' → ')}` };
    }
  }
  return { ok: true };
}

/** DFS from `roots` along dependsOn edges; returns the path if `target` is reachable. */
function findPathToTarget(store: TaskStore, roots: string[], target: string): string[] | null {
  const stack: Array<{ id: string; path: string[] }> = roots.map((id) => ({ id, path: [id] }));
  const visited = new Set<string>();
  while (stack.length > 0) {
    const { id, path } = stack.pop()!;
    if (id === target) return path;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of store.tasks[id]?.dependsOn ?? []) {
      stack.push({ id: next, path: [...path, next] });
    }
  }
  return null;
}

export interface BlockedInfo {
  task: TaskRecord;
  /** dependency ids not yet completed (missing ids included, annotated) */
  waitingOn: string[];
  missing: string[];
}

/** A pending task with every dependency completed (or no dependencies). */
export function isReady(store: TaskStore, task: TaskRecord): boolean {
  if (task.status !== 'pending') return false;
  return (task.dependsOn ?? []).every((id) => satisfies(store.tasks[id]));
}

/** Pending tasks ready to execute now, priority-stable order preserved. */
export function readyTasks(store: TaskStore): TaskRecord[] {
  return Object.values(store.tasks).filter((t) => isReady(store, t));
}

/** Pending tasks that cannot run yet, with the reason. */
export function blockedTasks(store: TaskStore): BlockedInfo[] {
  const out: BlockedInfo[] = [];
  for (const task of Object.values(store.tasks)) {
    if (task.status !== 'pending') continue;
    const deps = task.dependsOn ?? [];
    if (deps.length === 0) continue;
    const waitingOn = deps.filter((id) => !satisfies(store.tasks[id]));
    if (waitingOn.length === 0) continue;
    out.push({ task, waitingOn, missing: waitingOn.filter((id) => !store.tasks[id]) });
  }
  return out;
}

/** Tasks that became ready exactly because `completedTaskId` completed. */
export function unblockedBy(store: TaskStore, completedTaskId: string): TaskRecord[] {
  return Object.values(store.tasks).filter(
    (t) => t.status === 'pending' && (t.dependsOn ?? []).includes(completedTaskId) && isReady(store, t),
  );
}

export interface DeadBlock {
  task: TaskRecord;
  /**
   * The terminal-dead dependency ids in this task's dependency closure — the
   * failed, cancelled, or missing tasks that make it permanently unreachable
   * until a human retries/cancels/creates them. Deterministic (sorted).
   */
  rootCause: string[];
}

export interface TaskDagHealth {
  /** pending tasks whose unmet deps can STILL complete — a transient wait */
  liveBlocked: TaskRecord[];
  /** pending tasks that can NEVER become ready without human intervention */
  deadBlocked: DeadBlock[];
  /**
   * true when pending work exists but nothing is ready AND nothing is
   * in_progress — the DAG cannot advance on its own. A coordinator looping on
   * `task dispatch` would otherwise spin forever doing nothing.
   */
  deadlocked: boolean;
}

/**
 * Classify every blocked task as live- vs dead-blocked and report a global
 * deadlock verdict. Pure.
 *
 * This is Apache Airflow's `upstream_failed` state + DAG-deadlock detection,
 * ported onto the beads-style task DAG (see the module header): a dependency
 * that failed / was cancelled / is missing NEVER satisfies (only 'completed'
 * does), so every task transitively downstream is permanently stuck until a
 * human intervenes. `blockedTasks()` reports the wait but can't tell a
 * transient wait from a permanent one — the dispatcher then skips a
 * failed-dep block every pass, indistinguishable from a normal wait, and the
 * DAG quietly wedges. This turns that silent stall into a named diagnostic.
 */
export function taskDagHealth(store: TaskStore): TaskDagHealth {
  // canComplete(id): can this task ever reach status 'completed'?
  //   completed → yes; failed/cancelled/missing → no; pending/in_progress →
  //   only if EVERY dependency can complete. Memoized; a cycle (the store is
  //   acyclic by invariant, but guard anyway) resolves to false.
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const canComplete = (id: string): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const task = store.tasks[id];
    if (!task) return false; // missing id — blocks forever
    if (task.status === 'completed') return true;
    if (task.status === 'failed' || task.status === 'cancelled') return false;
    if (visiting.has(id)) return false; // cycle guard
    visiting.add(id);
    const ok = (task.dependsOn ?? []).every((d) => canComplete(d));
    visiting.delete(id);
    memo.set(id, ok);
    return ok;
  };

  // The terminal-dead ids (failed/cancelled/missing) reachable from a task,
  // descending THROUGH still-pending intermediates to name the real culprit.
  const deadRoots = (task: TaskRecord): string[] => {
    const found = new Set<string>();
    const seen = new Set<string>();
    const stack = [...(task.dependsOn ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const dep = store.tasks[id];
      if (!dep) { found.add(id); continue; } // missing
      if (dep.status === 'failed' || dep.status === 'cancelled') { found.add(id); continue; }
      if (dep.status === 'completed') continue; // satisfied — not a culprit
      for (const d of dep.dependsOn ?? []) stack.push(d); // pending/in_progress → descend
    }
    return [...found].sort();
  };

  const liveBlocked: TaskRecord[] = [];
  const deadBlocked: DeadBlock[] = [];
  for (const task of Object.values(store.tasks)) {
    if (task.status !== 'pending') continue;
    const deps = task.dependsOn ?? [];
    if (deps.length === 0) continue; // ready (dep-free), not blocked
    if (deps.every((id) => satisfies(store.tasks[id]))) continue; // ready, not blocked
    if (deps.every((id) => canComplete(id))) liveBlocked.push(task);
    else deadBlocked.push({ task, rootCause: deadRoots(task) });
  }

  const all = Object.values(store.tasks);
  const anyPending = all.some((t) => t.status === 'pending');
  const anyInProgress = all.some((t) => t.status === 'in_progress');
  const deadlocked = anyPending && readyTasks(store).length === 0 && !anyInProgress;

  return { liveBlocked, deadBlocked, deadlocked };
}

const STATUS_MARK: Record<TaskRecord['status'], string> = {
  completed: '✔',
  in_progress: '▶',
  pending: '·',
  failed: '✗',
  cancelled: '⊘',
};

/**
 * Flat dependency view: one line per task, dependencies inline with their
 * states. A DAG has no single tree; a flat annotated list stays honest for
 * diamonds and shared dependencies.
 */
export function renderDepGraph(store: TaskStore): string[] {
  const lines: string[] = [];
  const tasks = Object.values(store.tasks);
  for (const t of tasks) {
    const deps = t.dependsOn ?? [];
    const depNote = deps.length
      ? `  ⇐ ${deps.map((id) => `${STATUS_MARK[store.tasks[id]?.status] ?? '?'} ${id}${store.tasks[id] ? '' : ' (missing)'}`).join(', ')}`
      : '';
    lines.push(`${STATUS_MARK[t.status]} ${t.taskId}  [${t.status}] ${t.description.slice(0, 60)}${depNote}`);
  }
  return lines;
}
