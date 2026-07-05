/**
 * revectorize.ts — re-embed stored memory entries with the REAL local ONNX
 * chain, replacing vectors written while embeddings were silently hash-based.
 *
 * Why this exists: until the fix in 342ee8977, every embedding this CLI
 * wrote was a hash vector — and the rows are labeled
 * 'Xenova/all-MiniLM-L6-v2' anyway, because the bridge stamps that name
 * unconditionally (see the generateEmbedding docstring). Provenance is
 * therefore untrustworthy: the only safe repair is to re-embed every
 * embedded row. Mixed hash/ONNX vectors in one search space are worse than
 * either alone — cosine between the two families is noise.
 *
 * Safety: probes the local embedder FIRST and refuses to run when it
 * reports 'mock' — rewriting hash vectors with fresh hash vectors would
 * only launder the labels.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveDbPath, generateLocalEmbedding } from './memory-initializer.js';

export interface RevectorizeEmbedder {
  (text: string): Promise<{ embedding: number[]; dimensions: number; model: string; backend: 'onnx' | 'mock' }>;
}

export interface RevectorizeOptions {
  dbPath?: string;
  dryRun?: boolean;
  /** injectable embedder for tests; defaults to the real local chain */
  embed?: RevectorizeEmbedder;
  log?: (line: string) => void;
}

export interface RevectorizeResult {
  dbPath: string;
  scanned: number;
  revectorized: number;
  failed: number;
  /** what the probe reported; 'none' when there was nothing to do */
  backend: 'onnx' | 'mock' | 'none';
  dryRun: boolean;
  note?: string;
}

const REVECTORIZED_MODEL = 'all-MiniLM-L6-v2 (onnx, revectorized)';

export async function revectorizeMemory(opts: RevectorizeOptions = {}): Promise<RevectorizeResult> {
  const dbPath = opts.dbPath ? path.resolve(opts.dbPath) : resolveDbPath();
  const dryRun = opts.dryRun === true;
  const embed = opts.embed ?? (generateLocalEmbedding as RevectorizeEmbedder);
  const log = opts.log ?? (() => {});

  if (!fs.existsSync(dbPath)) {
    throw new Error(`memory database not found at ${dbPath}`);
  }

  const mod = await import('better-sqlite3');
  const Database = (mod as { default?: unknown }).default ?? mod;
  const db = new (Database as any)(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    const rows = db
      .prepare(
        `SELECT id, content FROM memory_entries
          WHERE embedding IS NOT NULL AND status != 'deleted'`,
      )
      .all() as Array<{ id: string; content: string }>;

    if (rows.length === 0) {
      return { dbPath, scanned: 0, revectorized: 0, failed: 0, backend: 'none', dryRun, note: 'no embedded entries to revectorize' };
    }

    // Probe BEFORE touching anything — refuse to launder hash vectors.
    const probe = await embed('revectorize backend probe');
    if (probe.backend !== 'onnx') {
      return {
        dbPath,
        scanned: rows.length,
        revectorized: 0,
        failed: 0,
        backend: probe.backend,
        dryRun,
        note: 'local ONNX embedder unavailable (backend=mock) — refusing to rewrite embeddings with hash vectors',
      };
    }

    if (dryRun) {
      return { dbPath, scanned: rows.length, revectorized: 0, failed: 0, backend: 'onnx', dryRun, note: `${rows.length} entries would be re-embedded` };
    }

    const update = db.prepare(
      `UPDATE memory_entries
          SET embedding = ?, embedding_model = ?, embedding_dimensions = ?, updated_at = ?
        WHERE id = ?`,
    );

    let revectorized = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const r = await embed(row.content);
        if (r.backend !== 'onnx' || r.embedding.length === 0) {
          failed++;
          continue;
        }
        update.run(JSON.stringify(r.embedding), REVECTORIZED_MODEL, r.embedding.length, Date.now(), row.id);
        revectorized++;
        log(`re-embedded ${row.id} (${r.embedding.length}d)`);
      } catch (err) {
        failed++;
        log(`failed ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { dbPath, scanned: rows.length, revectorized, failed, backend: 'onnx', dryRun };
  } finally {
    db.close();
  }
}
