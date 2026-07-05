/**
 * WorkerDaemon `backup` worker wiring + `optimize` local-mode honesty.
 *
 * backup: default-on 24 h worker snapshotting .swarm/memory.db via the
 * memory-backup engine (WAL-safe, keep-N). Asserts real snapshots land and
 * the no-database case skips cleanly.
 *
 * optimize: until 2026-07-06 local mode wrote fabricated numbers
 * (cacheHitRate 0.78 / avgResponseTime 45 as literals). Locks in that the
 * metrics file now carries only process observables.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { WorkerDaemon } from '../src/services/worker-daemon.js';

let dir: string;
let daemon: WorkerDaemon | null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-bw-'));
  daemon = null;
  // Hard-forbid billable headless `claude --print` sweeps: this host may
  // have a real `claude` on PATH, and `optimize` is headless-eligible.
  process.env.SWARMDO_HEADLESS = '0';
});
afterEach(async () => {
  delete process.env.SWARMDO_HEADLESS;
  try { if (daemon) await daemon.stop(); } catch { /* ignore */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function seedMemoryDb(): void {
  mkdirSync(join(dir, '.swarm'), { recursive: true });
  const db = new Database(join(dir, '.swarm', 'memory.db'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO kv VALUES (?, ?)').run('a', '1');
  db.close();
}

describe('WorkerDaemon backup worker', () => {
  it('is registered and default-enabled', () => {
    daemon = new WorkerDaemon(dir);
    const cfg = daemon.getStatus().config.workers.find((w) => w.type === 'backup');
    expect(cfg).toBeTruthy();
    expect(cfg!.enabled).toBe(true);
    expect(cfg!.intervalMs).toBe(24 * 60 * 60 * 1000);
  });

  it('snapshots the memory db and writes real metrics', async () => {
    daemon = new WorkerDaemon(dir);
    seedMemoryDb();
    const res = await daemon.triggerWorker('backup');
    expect(res.success).toBe(true);
    const out = res.output as { status: string; dest: string; engine: string; integrity: string };
    expect(out.status).toBe('completed');
    expect(out.engine).toBe('better-sqlite3');
    expect(out.integrity).toBe('ok');
    const snaps = readdirSync(join(dir, '.swarm', 'backups')).filter((f) => f.endsWith('.db'));
    expect(snaps).toHaveLength(1);
    const metrics = JSON.parse(readFileSync(join(dir, '.swarmdo', 'metrics', 'backup.json'), 'utf-8'));
    expect(metrics.dest).toBe(out.dest);
  }, 30_000);

  it('skips cleanly when no memory database exists', async () => {
    daemon = new WorkerDaemon(dir);
    const res = await daemon.triggerWorker('backup');
    expect(res.success).toBe(true);
    const out = res.output as { status: string; reason: string };
    expect(out.status).toBe('skipped');
    expect(out.reason).toMatch(/no memory database/);
    expect(existsSync(join(dir, '.swarm', 'backups'))).toBe(false);
  }, 30_000);
});

describe('WorkerDaemon optimize worker (local mode honesty)', () => {
  it('reports only process observables — no fabricated cache/response metrics', async () => {
    daemon = new WorkerDaemon(dir);
    const res = await daemon.triggerWorker('optimize');
    expect(res.success).toBe(true);
    const metrics = JSON.parse(readFileSync(join(dir, '.swarmdo', 'metrics', 'performance.json'), 'utf-8'));
    expect(metrics.optimizations).toBeUndefined(); // the fabricated block is gone
    expect(metrics.memoryUsage.heapUsed).toBeGreaterThan(0);
    expect(metrics.heapUsedPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.cpuCount).toBeGreaterThan(0);
    expect(String(metrics.note)).toMatch(/observables only/);
  }, 30_000);
});
