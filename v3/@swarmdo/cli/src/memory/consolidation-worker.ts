/**
 * consolidation-worker.ts — the REAL body of the daemon's `consolidate`
 * worker (30-min cadence).
 *
 * Before this module, runConsolidateWorker() wrote
 * `{patternsConsolidated: 0, memoryCleaned: 0, duplicatesRemoved: 0}` to a
 * metrics file and touched nothing — while the schema shipped a
 * `consolidation_runs` job ledger and the EWC++ consolidator
 * (ewc-consolidation.ts) sat fully implemented with zero callers. Upstream
 * hit the identical stub (claude-flow v3.22.0 / ADR-174); this wires
 * swarmdo's OWN machinery instead of porting theirs.
 *
 * What a run does — real work only, no invented numbers:
 *   1. TTL pass — flip `active` entries whose `expires_at` (epoch ms) has
 *      passed to `deleted` (the status CHECK allows active|archived|deleted;
 *      hard purge stays with the user-invoked `memory cleanup`).
 *   2. EWC pass — feed active entries that carry embeddings through
 *      EWCConsolidator so Fisher importance actually accumulates
 *      (.swarm/ewc-fisher.json).
 *   3. Ledger — record the run in `consolidation_runs`, the table built for
 *      exactly this and empty since its creation.
 *
 * Degradation posture matches graph-edge-writer.ts: no better-sqlite3 (or no
 * database) → report honestly and do nothing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EWCConsolidator } from './ewc-consolidation.js';

export interface ConsolidationOutcome {
  engine: 'better-sqlite3' | 'unavailable';
  /** active entries whose TTL had passed, flipped to status='deleted' */
  entriesExpired: number;
  /** active embedded entries fed through the EWC consolidator */
  patternsConsolidated: number;
  ewcPenalty: number | null;
  /** consolidation_runs rowid, null when the ledger table is absent */
  ledgerId: number | bigint | null;
  durationMs: number;
  dbPath: string;
  note?: string;
}

export interface ConsolidationOptions {
  /** explicit db file; defaults to <projectRoot>/.swarm/memory.db */
  dbPath?: string;
  projectRoot?: string;
  /** EWC Fisher-state file; defaults next to the db */
  ewcStoragePath?: string;
  /** injectable clock for deterministic tests */
  now?: Date;
  /** cap on embedded entries per run (newest first) */
  maxPatterns?: number;
}

function zeroOutcome(dbPath: string, engine: ConsolidationOutcome['engine'], note: string): ConsolidationOutcome {
  return {
    engine,
    entriesExpired: 0,
    patternsConsolidated: 0,
    ewcPenalty: null,
    ledgerId: null,
    durationMs: 0,
    dbPath,
    note,
  };
}

/** Embeddings are stored as JSON text (see memory-initializer storeEntry). */
function parseEmbedding(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'number' ? (arr as number[]) : null;
  } catch {
    return null;
  }
}

export async function runMemoryConsolidation(opts: ConsolidationOptions = {}): Promise<ConsolidationOutcome> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const dbPath = opts.dbPath ? path.resolve(opts.dbPath) : path.join(projectRoot, '.swarm', 'memory.db');
  const started = Date.now();
  const nowMs = (opts.now ?? new Date()).getTime();

  if (!fs.existsSync(dbPath)) {
    return zeroOutcome(dbPath, 'better-sqlite3', 'no memory database — nothing to consolidate');
  }

  let Database: any;
  try {
    const mod = await import('better-sqlite3');
    Database = (mod as { default?: unknown }).default ?? mod;
  } catch {
    return zeroOutcome(dbPath, 'unavailable', 'better-sqlite3 not loadable — consolidation skipped');
  }

  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    // 1. TTL pass — soft-expire, reversible, respects the status CHECK.
    const expired = db
      .prepare(
        `UPDATE memory_entries
            SET status = 'deleted', updated_at = ?
          WHERE status = 'active'
            AND expires_at IS NOT NULL AND expires_at > 0
            AND expires_at <= ?`,
      )
      .run(nowMs, nowMs);
    const entriesExpired = expired.changes as number;

    // 2. EWC pass — accumulate Fisher importance over what survived.
    const rows = db
      .prepare(
        `SELECT id, type, embedding FROM memory_entries
          WHERE status = 'active' AND embedding IS NOT NULL
          ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(opts.maxPatterns ?? 256) as Array<{ id: string; type: string | null; embedding: unknown }>;

    const patterns = rows
      .map((r) => ({ id: r.id, type: r.type ?? 'memory', embedding: parseEmbedding(r.embedding) }))
      .filter((p): p is { id: string; type: string; embedding: number[] } => p.embedding !== null);

    let patternsConsolidated = 0;
    let ewcPenalty: number | null = null;
    if (patterns.length > 0) {
      const consolidator = new EWCConsolidator({
        storagePath: opts.ewcStoragePath ?? path.join(path.dirname(dbPath), 'ewc-fisher.json'),
        dimensions: patterns[0].embedding.length,
      });
      await consolidator.initialize();
      const result = consolidator.consolidate(patterns);
      patternsConsolidated = result.patternsConsolidated;
      ewcPenalty = result.totalPenalty;
    }

    // 3. Ledger — tolerate older databases that predate the table.
    let ledgerId: number | bigint | null = null;
    try {
      const insert = db
        .prepare(
          `INSERT INTO consolidation_runs
             (job_type, records_processed, records_created, records_deleted,
              duration_ms, status, started_at, completed_at, metadata)
           VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
        )
        .run(
          'daemon-consolidate',
          patterns.length + entriesExpired,
          0,
          entriesExpired,
          Date.now() - started,
          started,
          Date.now(),
          JSON.stringify({ patternsConsolidated, ewcPenalty }),
        );
      ledgerId = insert.lastInsertRowid;
    } catch {
      // consolidation_runs absent in this db generation — outcome still real
    }

    return {
      engine: 'better-sqlite3',
      entriesExpired,
      patternsConsolidated,
      ewcPenalty,
      ledgerId,
      durationMs: Date.now() - started,
      dbPath,
    };
  } finally {
    db.close();
  }
}
