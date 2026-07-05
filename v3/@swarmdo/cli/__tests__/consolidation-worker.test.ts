/**
 * consolidation-worker — the daemon `consolidate` worker's real body.
 *
 * Fixture db replicates the memory-initializer schema slice this worker
 * touches: memory_entries (with the status CHECK and epoch-ms timestamps)
 * and the consolidation_runs ledger. Asserts the three passes do real,
 * idempotent work: TTL soft-expiry, EWC Fisher accumulation, ledger row.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMemoryConsolidation } from '../src/memory/consolidation-worker.js';

let root: string;
let dbPath: string;
let ewcPath: string;

const NOW = new Date('2026-07-06T12:00:00Z');
const PAST = NOW.getTime() - 60_000;
const FUTURE = NOW.getTime() + 60_000;

function embedding(dims: number, fill: number): string {
  return JSON.stringify(new Array(dims).fill(fill));
}

function makeDb(withLedger = true): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE memory_entries (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      content TEXT NOT NULL,
      type TEXT,
      embedding TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      expires_at INTEGER,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','deleted')),
      UNIQUE(key, namespace)
    );
  `);
  if (withLedger) {
    db.exec(`
      CREATE TABLE consolidation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT, records_processed INTEGER, records_created INTEGER,
        records_deleted INTEGER, duration_ms INTEGER, status TEXT, error TEXT,
        started_at INTEGER, completed_at INTEGER, metadata TEXT
      );
    `);
  }
  const put = db.prepare(
    'INSERT INTO memory_entries (id, key, namespace, content, type, embedding, expires_at, status) VALUES (?,?,?,?,?,?,?,?)',
  );
  put.run('e-expired', 'k1', 'default', 'ttl passed', 'semantic', null, PAST, 'active');
  put.run('e-live-ttl', 'k2', 'default', 'ttl in future', 'semantic', null, FUTURE, 'active');
  put.run('e-embedded', 'k3', 'default', 'has embedding', 'semantic', embedding(8, 0.5), null, 'active');
  put.run('e-embedded-2', 'k4', 'default', 'also embedded', 'pattern', embedding(8, 0.25), null, 'active');
  put.run('e-gone', 'k5', 'default', 'already deleted', 'semantic', embedding(8, 0.9), PAST, 'deleted');
  db.close();
}

function statuses(): Record<string, string> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT id, status FROM memory_entries').all() as Array<{ id: string; status: string }>;
    return Object.fromEntries(rows.map((r) => [r.id, r.status]));
  } finally {
    db.close();
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'swarmdo-consolidate-'));
  dbPath = path.join(root, 'memory.db');
  ewcPath = path.join(root, 'ewc-fisher.json');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('runMemoryConsolidation', () => {
  it('soft-expires only active entries whose TTL passed', async () => {
    makeDb();
    const outcome = await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    expect(outcome.engine).toBe('better-sqlite3');
    expect(outcome.entriesExpired).toBe(1);
    const s = statuses();
    expect(s['e-expired']).toBe('deleted');
    expect(s['e-live-ttl']).toBe('active'); // future TTL untouched
    expect(s['e-embedded']).toBe('active'); // no TTL untouched
    expect(s['e-gone']).toBe('deleted'); // not double-counted
  });

  it('is idempotent — a second run finds nothing left to expire', async () => {
    makeDb();
    await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    const second = await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    expect(second.entriesExpired).toBe(0);
  });

  it('feeds active embedded entries through EWC and persists Fisher state', async () => {
    makeDb();
    const outcome = await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    // e-embedded + e-embedded-2 are active with embeddings; e-gone is deleted
    expect(outcome.patternsConsolidated).toBe(2);
    expect(outcome.ewcPenalty).not.toBeNull();
    expect(existsSync(ewcPath)).toBe(true);
    const state = JSON.parse(readFileSync(ewcPath, 'utf8'));
    expect(state).toBeTruthy();
  });

  it('records the run in the consolidation_runs ledger', async () => {
    makeDb();
    const outcome = await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    expect(outcome.ledgerId).not.toBeNull();
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT * FROM consolidation_runs WHERE id = ?').get(outcome.ledgerId) as Record<string, unknown>;
    db.close();
    expect(row.job_type).toBe('daemon-consolidate');
    expect(row.records_deleted).toBe(1);
    expect(row.status).toBe('completed');
    expect(JSON.parse(String(row.metadata)).patternsConsolidated).toBe(2);
  });

  it('tolerates databases that predate the ledger table', async () => {
    makeDb(false);
    const outcome = await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    expect(outcome.entriesExpired).toBe(1);
    expect(outcome.ledgerId).toBeNull(); // no throw, work still done
  });

  it('reports honestly when there is no database', async () => {
    const outcome = await runMemoryConsolidation({ dbPath: path.join(root, 'missing.db'), now: NOW });
    expect(outcome.entriesExpired).toBe(0);
    expect(outcome.patternsConsolidated).toBe(0);
    expect(outcome.note).toMatch(/no memory database/);
  });

  it('skips malformed embeddings without failing the run', async () => {
    makeDb();
    const db = new Database(dbPath);
    db.prepare(
      'INSERT INTO memory_entries (id, key, namespace, content, embedding, status) VALUES (?,?,?,?,?,?)',
    ).run('e-bad-embed', 'k6', 'default', 'broken embedding', '{not json', 'active');
    db.close();
    const outcome = await runMemoryConsolidation({ dbPath, ewcStoragePath: ewcPath, now: NOW });
    expect(outcome.patternsConsolidated).toBe(2); // bad one skipped, run completed
  });
});
