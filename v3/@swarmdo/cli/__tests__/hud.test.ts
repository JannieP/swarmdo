/**
 * swarmdo hud — data collection (read-only, fixture dirs) and pure renderer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHudData } from '../src/hud/hud-data.js';
import { renderHud } from '../src/commands/hud.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-hud-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedTasks(): void {
  mkdirSync(join(dir, '.swarmdo', 'tasks'), { recursive: true });
  writeFileSync(
    join(dir, '.swarmdo', 'tasks', 'store.json'),
    JSON.stringify({
      tasks: {
        a: { taskId: 'a', type: 'impl', description: 'done', priority: 'normal', status: 'completed', progress: 100, assignedTo: [], tags: [], createdAt: 'x', startedAt: null, completedAt: 'x' },
        b: { taskId: 'b', type: 'impl', description: 'ready', priority: 'normal', status: 'pending', progress: 0, assignedTo: [], tags: [], createdAt: 'x', startedAt: null, completedAt: null, dependsOn: ['a'] },
        c: { taskId: 'c', type: 'impl', description: 'blocked', priority: 'normal', status: 'pending', progress: 0, assignedTo: [], tags: [], createdAt: 'x', startedAt: null, completedAt: null, dependsOn: ['b'] },
        d: { taskId: 'd', type: 'impl', description: 'running', priority: 'normal', status: 'in_progress', progress: 40, assignedTo: ['ag'], tags: [], createdAt: 'x', startedAt: 'x', completedAt: null },
      },
      version: '3.0.0',
    }),
  );
}

function seedDaemon(running: boolean): void {
  mkdirSync(join(dir, '.swarmdo'), { recursive: true });
  writeFileSync(
    join(dir, '.swarmdo', 'daemon-state.json'),
    JSON.stringify({
      running,
      workers: {
        backup: { runCount: 3, successCount: 3, failureCount: 0, isRunning: false },
        consolidate: { runCount: 7, successCount: 6, failureCount: 1, isRunning: true },
        map: { runCount: 0, successCount: 0, failureCount: 0, isRunning: false },
      },
    }),
  );
}

function seedMemory(): void {
  mkdirSync(join(dir, '.swarm', 'backups'), { recursive: true });
  writeFileSync(join(dir, '.swarm', 'memory.db'), 'x'.repeat(2048));
  writeFileSync(join(dir, '.swarm', 'backups', 'memory-20260706-010000.db'), 'x');
  writeFileSync(join(dir, '.swarm', 'backups', 'memory-20260706-020000.db'), 'x');
  writeFileSync(join(dir, '.swarm', 'backups', 'notes.txt'), 'not a snapshot');
}

describe('collectHudData', () => {
  it('reads tasks, daemon, and memory from a seeded project', () => {
    seedTasks();
    seedDaemon(true);
    seedMemory();
    const d = collectHudData({ cwd: dir, skipUsage: true });

    expect(d.tasks.total).toBe(4);
    expect(d.tasks.ready).toBe(1); // b (dep a completed)
    expect(d.tasks.blocked).toBe(1); // c (dep b pending)
    expect(d.tasks.inProgress).toEqual(['d']);

    expect(d.daemon?.running).toBe(true);
    const consolidate = d.daemon?.workers.find((w) => w.name === 'consolidate');
    expect(consolidate?.isRunning).toBe(true);
    expect(consolidate?.failureCount).toBe(1);

    expect(d.memory.dbBytes).toBe(2048);
    expect(d.memory.snapshots).toBe(2); // notes.txt ignored
    expect(d.memory.newestSnapshot).toBe('memory-20260706-020000.db');
  });

  it('degrades gracefully on an empty project', () => {
    const d = collectHudData({ cwd: dir, skipUsage: true });
    expect(d.tasks.total).toBe(0);
    expect(d.daemon).toBeNull();
    expect(d.memory.dbBytes).toBeNull();
    expect(d.memory.snapshots).toBe(0);
    expect(d.activeBlock).toBeNull();
  });

  it('computes active block + today cost from transcript fixtures', () => {
    // one assistant entry 10 minutes ago in a fixture projects dir
    const projects = join(dir, 'projects', '-Users-x-proj');
    mkdirSync(projects, { recursive: true });
    const now = Date.now();
    const ts = new Date(now - 10 * 60_000).toISOString();
    writeFileSync(
      join(projects, 's.jsonl'),
      JSON.stringify({
        type: 'assistant', timestamp: ts, sessionId: 's', requestId: 'r1', cwd: '/x',
        costUSD: 2.5,
        message: { id: 'm1', role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 5, output_tokens: 5 } },
      }) + '\n',
    );
    const d = collectHudData({ cwd: dir, usageDirs: [join(dir, 'projects')], nowMs: now });
    expect(d.activeBlock).not.toBeNull();
    expect(d.activeBlock!.block.totals.costUsd).toBeCloseTo(2.5, 10);
    expect(d.activeBlock!.remainingMin).toBeGreaterThan(0);
    expect(d.todayCostUsd).toBeCloseTo(2.5, 10);
  });
});

describe('renderHud', () => {
  it('renders every section with fixture data', () => {
    seedTasks();
    seedDaemon(true);
    seedMemory();
    const text = renderHud(collectHudData({ cwd: dir, skipUsage: true })).join('\n');
    expect(text).toContain('block   idle');
    expect(text).toContain('4 total · 1 ready · 1 blocked · 1 in progress');
    expect(text).toContain('▶ d');
    expect(text).toContain('daemon  running');
    expect(text).toContain('consolidate  runs 7 (1 failed)');
    expect(text).toContain('2 snapshot(s)');
  });

  it('renders sane empty states', () => {
    const text = renderHud(collectHudData({ cwd: dir, skipUsage: true })).join('\n');
    expect(text).toContain('never initialized');
    expect(text).toContain('0 total');
  });
});
