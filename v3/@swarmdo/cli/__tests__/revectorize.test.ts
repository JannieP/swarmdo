/**
 * memory revectorize — repairs hash-era embeddings with real ONNX vectors.
 *
 * Injected embedders throughout: the rails under test are the refuse-on-
 * mock probe (never launder hash vectors), row updates with truthful
 * provenance, dry-run untouchedness, and deleted-row exclusion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { revectorizeMemory } from '../src/memory/revectorize.js';

let root: string;
let dbPath: string;

function makeDb(): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE memory_entries (
      id TEXT PRIMARY KEY, key TEXT, namespace TEXT DEFAULT 'default',
      content TEXT NOT NULL, embedding TEXT, embedding_model TEXT,
      embedding_dimensions INTEGER, updated_at INTEGER,
      status TEXT DEFAULT 'active'
    );
  `);
  const put = db.prepare(
    'INSERT INTO memory_entries (id, key, content, embedding, embedding_model, embedding_dimensions, status) VALUES (?,?,?,?,?,?,?)',
  );
  put.run('e1', 'k1', 'auth patterns doc', JSON.stringify([0.1, 0.2]), 'Xenova/all-MiniLM-L6-v2', 2, 'active');
  put.run('e2', 'k2', 'deployment runbook', JSON.stringify([0.3, 0.4]), 'Xenova/all-MiniLM-L6-v2', 2, 'active');
  put.run('e3', 'k3', 'no embedding row', null, null, null, 'active');
  put.run('e4', 'k4', 'deleted row', JSON.stringify([0.5, 0.5]), 'Xenova/all-MiniLM-L6-v2', 2, 'deleted');
  db.close();
}

function rowsById(): Record<string, { embedding: string | null; embedding_model: string | null; embedding_dimensions: number | null }> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT id, embedding, embedding_model, embedding_dimensions FROM memory_entries').all() as any[];
    return Object.fromEntries(rows.map((r) => [r.id, r]));
  } finally {
    db.close();
  }
}

const onnxEmbed = async (text: string) => ({
  embedding: new Array(8).fill(0).map((_, i) => (text.length + i) / 100),
  dimensions: 8,
  model: 'onnx',
  backend: 'onnx' as const,
});

const mockEmbed = async () => ({ embedding: [1, 2], dimensions: 2, model: 'hash-fallback', backend: 'mock' as const });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'swarmdo-revec-'));
  dbPath = path.join(root, 'memory.db');
  makeDb();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('revectorizeMemory', () => {
  it('re-embeds active embedded rows with truthful provenance', async () => {
    const result = await revectorizeMemory({ dbPath, embed: onnxEmbed });
    expect(result.backend).toBe('onnx');
    expect(result.scanned).toBe(2); // e1, e2 — not the null-embedding or deleted rows
    expect(result.revectorized).toBe(2);
    const rows = rowsById();
    expect(JSON.parse(rows.e1.embedding!)).toHaveLength(8);
    expect(rows.e1.embedding_model).toContain('revectorized');
    expect(rows.e1.embedding_dimensions).toBe(8);
    expect(rows.e3.embedding).toBeNull(); // untouched
    expect(rows.e4.embedding_model).toBe('Xenova/all-MiniLM-L6-v2'); // deleted row untouched
  });

  it('refuses outright when the probe reports mock — no laundering', async () => {
    const result = await revectorizeMemory({ dbPath, embed: mockEmbed });
    expect(result.backend).toBe('mock');
    expect(result.revectorized).toBe(0);
    expect(result.note).toMatch(/refusing/);
    const rows = rowsById();
    expect(rows.e1.embedding).toBe(JSON.stringify([0.1, 0.2])); // byte-untouched
  });

  it('dry-run counts without writing', async () => {
    const result = await revectorizeMemory({ dbPath, dryRun: true, embed: onnxEmbed });
    expect(result.dryRun).toBe(true);
    expect(result.scanned).toBe(2);
    expect(result.revectorized).toBe(0);
    expect(rowsById().e1.embedding).toBe(JSON.stringify([0.1, 0.2]));
  });

  it('counts per-row failures without aborting the run', async () => {
    let calls = 0;
    const flaky = async (text: string) => {
      calls++;
      if (text.includes('deployment')) throw new Error('boom');
      return onnxEmbed(text);
    };
    const result = await revectorizeMemory({ dbPath, embed: flaky });
    expect(result.revectorized).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('throws a clear error when the database is missing', async () => {
    await expect(revectorizeMemory({ dbPath: path.join(root, 'none.db'), embed: onnxEmbed })).rejects.toThrow(/not found/);
  });
});
