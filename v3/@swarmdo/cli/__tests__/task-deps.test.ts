/**
 * Dependency-aware task graph (task-deps.ts) + dispatcher gating.
 *
 * Beads-style semantics under test:
 *   - only status 'completed' satisfies a dependency (failed does NOT)
 *   - ready = pending with every dependency satisfied
 *   - cycles and missing/self/duplicate deps are rejected with reasons
 *   - the dispatcher refuses blocked tasks and reports what a completion
 *     unblocked
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskTools, type TaskRecord, type TaskStore } from '../src/mcp-tools/task-tools.js';
import {
  validateDependencies,
  isReady,
  readyTasks,
  blockedTasks,
  unblockedBy,
  renderDepGraph,
} from '../src/mcp-tools/task-deps.js';
import { dispatchPendingTasks } from '../src/mcp-tools/task-dispatcher.js';

function task(id: string, over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: id,
    type: 'impl',
    description: `task ${id}`,
    priority: 'normal',
    status: 'pending',
    progress: 0,
    assignedTo: [],
    tags: [],
    createdAt: '2026-07-06T00:00:00Z',
    startedAt: null,
    completedAt: null,
    ...over,
  };
}

function storeOf(...tasks: TaskRecord[]): TaskStore {
  return { tasks: Object.fromEntries(tasks.map((t) => [t.taskId, t])), version: '3.0.0' };
}

describe('validateDependencies', () => {
  it('accepts existing ids and rejects missing, self, duplicate', () => {
    const s = storeOf(task('a'), task('b'));
    expect(validateDependencies(s, null, ['a', 'b']).ok).toBe(true);
    expect(validateDependencies(s, null, ['ghost']).error).toMatch(/does not exist/);
    expect(validateDependencies(s, 'a', ['a']).error).toMatch(/depend on itself/);
    expect(validateDependencies(s, null, ['a', 'a']).error).toMatch(/duplicate/);
  });

  it('rejects edits that would close a cycle, with the path', () => {
    // a → b → c ; adding c → a closes the loop
    const s = storeOf(task('a', { dependsOn: ['b'] }), task('b', { dependsOn: ['c'] }), task('c'));
    const res = validateDependencies(s, 'c', ['a']);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/cycle/);
    expect(res.error).toContain('c → a');
  });
});

describe('readiness semantics', () => {
  it('only completed satisfies — failed and cancelled still block', () => {
    const s = storeOf(
      task('done', { status: 'completed' }),
      task('bad', { status: 'failed' }),
      task('r1', { dependsOn: ['done'] }),
      task('b1', { dependsOn: ['bad'] }),
      task('b2', { dependsOn: ['done', 'bad'] }),
    );
    expect(isReady(s, s.tasks['r1'])).toBe(true);
    expect(isReady(s, s.tasks['b1'])).toBe(false);
    expect(isReady(s, s.tasks['b2'])).toBe(false);
    expect(readyTasks(s).map((t) => t.taskId)).toEqual(['r1']);
  });

  it('blockedTasks reports waiting-on and missing ids', () => {
    const s = storeOf(task('w', { dependsOn: ['ghost'] }));
    const blocked = blockedTasks(s);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].waitingOn).toEqual(['ghost']);
    expect(blocked[0].missing).toEqual(['ghost']);
  });

  it('unblockedBy returns exactly the tasks a completion released', () => {
    const s = storeOf(
      task('a', { status: 'completed' }),
      task('b', { status: 'completed' }),
      task('both', { dependsOn: ['a', 'b'] }),
      task('other', { dependsOn: ['a'] }),
      task('unrelated'),
    );
    // b just completed: 'both' becomes ready because a was already done
    expect(unblockedBy(s, 'b').map((t) => t.taskId)).toEqual(['both']);
  });

  it('renderDepGraph annotates dependency states inline', () => {
    const s = storeOf(task('a', { status: 'completed' }), task('c', { dependsOn: ['a', 'nope'] }));
    const lines = renderDepGraph(s).join('\n');
    expect(lines).toContain('✔ a');
    expect(lines).toContain('nope (missing)');
  });
});

describe('dispatcher dependency gate', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarmdo-deps-'));
    mkdirSync(join(dir, '.swarmdo', 'tasks'), { recursive: true });
    mkdirSync(join(dir, '.swarmdo', 'agents'), { recursive: true });
    writeFileSync(join(dir, '.swarmdo', 'agents', 'store.json'), JSON.stringify({ agents: {}, version: '3.0.0' }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function seed(store: TaskStore): void {
    writeFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), JSON.stringify(store));
  }

  it('refuses blocked tasks with a reason and counts them', async () => {
    seed(storeOf(task('first', { assignedTo: ['agent-1'] }), task('second', { dependsOn: ['first'] })));
    const summary = await dispatchPendingTasks({ cwd: dir, dryRun: true });
    expect(summary.blocked).toBe(1);
    const blockedOutcome = summary.outcomes.find((o) => o.taskId === 'second');
    expect(blockedOutcome?.status).toBe('skipped');
    expect(blockedOutcome?.reason).toMatch(/blocked by incomplete dependencies: first/);
    // 'first' itself is dispatchable (dry-run reports it as would-run)
    expect(summary.outcomes.find((o) => o.taskId === 'first')?.reason).toBe('dry-run');
  });

  it('reports what a completion unblocked', async () => {
    seed(storeOf(
      task('build', { assignedTo: ['agent-1'] }),
      task('deploy', { dependsOn: ['build'] }),
    ));
    const summary = await dispatchPendingTasks({
      cwd: dir,
      executor: async () => ({ success: true, agentId: 'agent-1', output: 'done' }),
    });
    expect(summary.completed).toBe(1);
    expect(summary.unblocked).toEqual(['deploy']);
  });

  it('dependency chain drains front-to-back across passes', async () => {
    seed(storeOf(
      task('t1', { assignedTo: ['agent-1'] }),
      task('t2', { dependsOn: ['t1'], assignedTo: ['agent-1'] }),
    ));
    const executor = async () => ({ success: true, agentId: 'agent-1', output: 'ok' });
    const pass1 = await dispatchPendingTasks({ cwd: dir, executor });
    expect(pass1.completed).toBe(1);
    expect(pass1.blocked).toBe(1);
    const pass2 = await dispatchPendingTasks({ cwd: dir, executor });
    expect(pass2.completed).toBe(1);
    expect(pass2.blocked).toBe(0);
  });
});

describe('task_retry preserves the dependency gate', () => {
  let dir: string;
  let prev: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarmdo-retry-'));
    prev = process.env.SWARMDO_CWD;
    process.env.SWARMDO_CWD = dir; // the retry handler's loadTaskStore() honors this
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SWARMDO_CWD; else process.env.SWARMDO_CWD = prev;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('a retried task keeps dependsOn and stays blocked on an unfinished prerequisite', async () => {
    mkdirSync(join(dir, '.swarmdo', 'tasks'), { recursive: true });
    const store = storeOf(task('setup', { status: 'failed' }), task('build', { status: 'failed', dependsOn: ['setup'] }));
    writeFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), JSON.stringify(store));

    const retry = taskTools.find((t) => t.name === 'task_retry')!;
    const res = (await retry.handler({ taskId: 'build' })) as { newTaskId: string };
    const after: TaskStore = JSON.parse(readFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), 'utf8'));
    const retried = after.tasks[res.newTaskId];

    expect(retried.dependsOn).toEqual(['setup']);  // was dropped (undefined) → immediately ready
    expect(isReady(after, retried)).toBe(false);    // still gated on the failed 'setup'
  });
});
