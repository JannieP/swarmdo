/**
 * A fresh project (no memory.db yet) must treat list/search as EMPTY, not an
 * error — `rufflo memory list` / `memory search` on first run should succeed
 * with zero results instead of "Database not found". An explicit `--path` that
 * is missing still errors (likely a typo). Exercises the no-db branch, which
 * returns BEFORE any SQLite engine (sql.js/better-sqlite3) is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
let prev: string | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rufflo-empty-'));
  prev = process.env.RUFFLO_MEMORY_PATH;
  process.env.RUFFLO_MEMORY_PATH = dir; // fresh, no memory.db
});
afterEach(() => {
  if (prev === undefined) delete process.env.RUFFLO_MEMORY_PATH; else process.env.RUFFLO_MEMORY_PATH = prev;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('memory on a fresh project (no db)', () => {
  it('listEntries returns empty success, not an error', async () => {
    const m = await import('../src/memory/memory-initializer.js');
    const r: any = await m.listEntries({ limit: 20, offset: 0 });
    expect(r.success).toBe(true);
    expect(Array.isArray(r.entries)).toBe(true);
    expect(r.entries.length).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it('searchEntries returns empty success, not an error', async () => {
    const m = await import('../src/memory/memory-initializer.js');
    const r: any = await m.searchEntries({ query: 'anything', limit: 10 });
    expect(r.success).toBe(true);
    expect(Array.isArray(r.results)).toBe(true);
    expect(r.results.length).toBe(0);
  });

  it('a missing db at an explicit --path is also empty, not an error', async () => {
    // The CLI always resolves+passes a concrete dbPath, so a missing store must
    // read as empty regardless of how the path was supplied.
    const m = await import('../src/memory/memory-initializer.js');
    const r: any = await m.listEntries({ limit: 20, offset: 0, dbPath: join(dir, 'nope', 'missing.db') });
    expect(r.success).toBe(true);
    expect(r.entries.length).toBe(0);
  });
});
