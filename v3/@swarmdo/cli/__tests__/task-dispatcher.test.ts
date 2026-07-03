/**
 * task-dispatcher tests — Sprint 3 Move 6'.
 *
 * Drives the dispatcher with an INJECTED fake executor (no network) against a
 * temp `.swarmdo/` store, proving the audit's "no worker picks up tasks" gap is
 * closed: a pending task runs and lands `completed` with a result; failures
 * land `failed`; unassignable tasks are honestly `skipped`; dry-run mutates
 * nothing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatchPendingTasks } from '../src/mcp-tools/task-dispatcher.js';

let dir: string;
let prevCwd: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-disp-'));
  prevCwd = process.env.SWARMDO_CWD;
  process.env.SWARMDO_CWD = dir; // getProjectCwd() honors this
});
afterEach(() => {
  if (prevCwd === undefined) delete process.env.SWARMDO_CWD; else process.env.SWARMDO_CWD = prevCwd;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function seed(tasks: Record<string, unknown>, agents: Record<string, unknown> = {}): void {
  mkdirSync(join(dir, '.swarmdo', 'tasks'), { recursive: true });
  mkdirSync(join(dir, '.swarmdo', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), JSON.stringify({ tasks, version: '3.0.0' }));
  writeFileSync(join(dir, '.swarmdo', 'agents', 'store.json'), JSON.stringify({ agents, version: '3.0.0' }));
}
function readTasks(): Record<string, any> {
  return JSON.parse(readFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), 'utf-8')).tasks;
}
function task(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { taskId: 't1', type: 'impl', description: 'do the thing', priority: 'normal', status: 'pending', progress: 0, assignedTo: ['a1'], tags: [], createdAt: 'x', startedAt: null, completedAt: null, ...over };
}

const okExecutor = async ({ agentId }: { agentId: string }) => ({ success: true, agentId, output: 'done', model: 'haiku', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
const failExecutor = async ({ agentId }: { agentId: string }) => ({ success: false, agentId, error: 'Anthropic API error 429' });

describe('dispatchPendingTasks', () => {
  it('executes a pending task and writes back completed + result', async () => {
    seed({ t1: task() }, { a1: { agentId: 'a1', status: 'idle' } });
    const s = await dispatchPendingTasks({ executor: okExecutor });
    expect(s.completed).toBe(1);
    expect(s.failed).toBe(0);
    const t = readTasks().t1;
    expect(t.status).toBe('completed');
    expect(t.progress).toBe(100);
    expect(t.result.output).toBe('done');
    expect(t.completedAt).toBeTruthy();
  });

  it('marks a task failed (honestly) when the executor fails', async () => {
    seed({ t1: task() }, { a1: { agentId: 'a1', status: 'idle' } });
    const s = await dispatchPendingTasks({ executor: failExecutor });
    expect(s.failed).toBe(1);
    const t = readTasks().t1;
    expect(t.status).toBe('failed');
    expect(t.result.error).toMatch(/429/);
  });

  it('skips a task with no assignable agent (auto-assign off, empty assignee)', async () => {
    seed({ t1: task({ assignedTo: [] }) }, {});
    const s = await dispatchPendingTasks({ executor: okExecutor, autoAssign: false });
    expect(s.skipped).toBe(1);
    expect(s.completed).toBe(0);
    expect(readTasks().t1.status).toBe('pending'); // untouched
  });

  it('auto-assigns an unassigned task to a spawned agent', async () => {
    seed({ t1: task({ assignedTo: [] }) }, { ax: { agentId: 'ax', status: 'idle' } });
    const s = await dispatchPendingTasks({ executor: okExecutor });
    expect(s.completed).toBe(1);
    expect(readTasks().t1.assignedTo).toContain('ax');
  });

  it('dry-run mutates nothing', async () => {
    seed({ t1: task() }, { a1: { agentId: 'a1', status: 'idle' } });
    const s = await dispatchPendingTasks({ executor: okExecutor, dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(readTasks().t1.status).toBe('pending');
  });

  it('honors max and leaves the rest pending', async () => {
    seed({ t1: task({ taskId: 't1' }), t2: task({ taskId: 't2' }) }, { a1: { agentId: 'a1', status: 'idle' } });
    const s = await dispatchPendingTasks({ executor: okExecutor, max: 1 });
    expect(s.dispatched).toBe(1);
    const tasks = readTasks();
    const completed = Object.values(tasks).filter((t: any) => t.status === 'completed').length;
    const pending = Object.values(tasks).filter((t: any) => t.status === 'pending').length;
    expect(completed).toBe(1);
    expect(pending).toBe(1);
  });
});
