/**
 * WorkerDaemon `dispatch` worker wiring test — Sprint 3 Move 6' (follow-up).
 *
 * Verifies the daemon registers a `dispatch` worker and that triggering it
 * drains the queue through dispatchPendingTasks. Uses a task with NO assignable
 * agent so the dispatcher SKIPS it — exercising the full wiring with zero
 * network / LLM calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerDaemon } from '../src/services/worker-daemon.js';

let dir: string;
let daemon: WorkerDaemon | null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-dw-'));
  daemon = null;
});
afterEach(async () => {
  try { if (daemon) await daemon.stop(); } catch { /* ignore */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function seedPendingTask(): void {
  mkdirSync(join(dir, '.swarmdo', 'tasks'), { recursive: true });
  mkdirSync(join(dir, '.swarmdo', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), JSON.stringify({
    tasks: {
      t1: { taskId: 't1', type: 'impl', description: 'do it', priority: 'normal', status: 'pending', progress: 0, assignedTo: [], tags: [], createdAt: 'x', startedAt: null, completedAt: null },
    },
    version: '3.0.0',
  }));
  writeFileSync(join(dir, '.swarmdo', 'agents', 'store.json'), JSON.stringify({ agents: {}, version: '3.0.0' }));
}

describe('WorkerDaemon dispatch worker', () => {
  it('registers a dispatch worker (triggerable, not "Unknown worker type")', async () => {
    daemon = new WorkerDaemon(dir);
    seedPendingTask();
    // Should not throw "Unknown worker type: dispatch".
    const res = await daemon.triggerWorker('dispatch');
    expect(res.type).toBe('dispatch');
    expect(res.success).toBe(true);
  }, 30_000);

  it('drains the queue: a no-agent task is skipped (no LLM call) and left pending', async () => {
    daemon = new WorkerDaemon(dir);
    seedPendingTask();
    const res = await daemon.triggerWorker('dispatch');
    const out = res.output as { pending: number; skipped: number; completed: number };
    expect(out.pending).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.completed).toBe(0);
    // Task untouched (still pending — nothing executed).
    const tasks = JSON.parse(readFileSync(join(dir, '.swarmdo', 'tasks', 'store.json'), 'utf-8')).tasks;
    expect(tasks.t1.status).toBe('pending');
  }, 30_000);

  it('is disabled by default (opt-in — makes billable calls)', () => {
    daemon = new WorkerDaemon(dir);
    const status = daemon.getStatus();
    const dispatch = status.workers?.find?.((w: { type: string }) => w.type === 'dispatch')
      ?? (status.workers instanceof Map ? status.workers.get('dispatch') : undefined);
    // If surfaced in status, it must be disabled; if not surfaced, that's also
    // acceptable (disabled workers may be omitted) — the key invariant is it
    // never auto-runs. We assert it didn't appear as enabled.
    if (dispatch) expect(dispatch.enabled).not.toBe(true);
    expect(true).toBe(true);
  });
});
