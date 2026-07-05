/**
 * memory-backup — WAL-safe snapshot, rotation, restore.
 *
 * Uses a REAL better-sqlite3 database in WAL mode with the writer connection
 * still open during backup — the exact condition that corrupted memory.db in
 * #2431 — and asserts the snapshot is a valid, readable database.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  backupFileName,
  createBackup,
  fileCopyBackup,
  listBackups,
  restoreBackup,
} from '../src/memory/memory-backup.js';

let root: string;
let dbPath: string;

function makeDb(rows: string[]): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
  const put = db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)');
  for (const r of rows) put.run(r, `value-${r}`);
  db.close();
}

function readKeys(file: string): string[] {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare('SELECT k FROM kv ORDER BY k').all() as Array<{ k: string }>).map((r) => r.k);
  } finally {
    db.close();
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'swarmdo-backup-'));
  dbPath = path.join(root, 'memory.db');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createBackup', () => {
  it('snapshots a live WAL database consistently while a writer is open', async () => {
    makeDb(['a', 'b']);
    const writer = new Database(dbPath);
    writer.pragma('journal_mode = WAL');
    writer.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run('c', 'value-c');
    // writer intentionally still open — online backup must cope
    const result = await createBackup({ dbPath, now: new Date('2026-07-06T10:00:00') });
    writer.close();

    expect(result.engine).toBe('better-sqlite3');
    expect(result.integrity).toBe('ok');
    expect(existsSync(result.dest)).toBe(true);
    expect(result.dest).toContain(path.join(root, 'backups'));
    expect(readKeys(result.dest)).toEqual(['a', 'b', 'c']);
  });

  it('names snapshots by timestamp and disambiguates same-second runs', async () => {
    makeDb(['a']);
    const now = new Date('2026-07-06T10:00:00');
    expect(backupFileName(now)).toBe('memory-20260706-100000.db');
    const first = await createBackup({ dbPath, now });
    const second = await createBackup({ dbPath, now });
    expect(path.basename(first.dest)).toBe('memory-20260706-100000.db');
    expect(path.basename(second.dest)).toBe('memory-20260706-100000-1.db');
  });

  it('prunes to keep-N, never the snapshot it just wrote', async () => {
    makeDb(['a']);
    const t = (h: number) => new Date(2026, 6, 6, h, 0, 0);
    await createBackup({ dbPath, keep: 0, now: t(1) });
    await createBackup({ dbPath, keep: 0, now: t(2) });
    const third = await createBackup({ dbPath, keep: 2, now: t(3) });
    expect(third.pruned).toHaveLength(1);
    expect(path.basename(third.pruned[0])).toBe('memory-20260706-010000.db');
    const remaining = listBackups({ dbPath }).map((b) => path.basename(b.file));
    expect(remaining).toEqual(['memory-20260706-030000.db', 'memory-20260706-020000.db']);
  });

  it('throws a clear error when there is no database', async () => {
    await expect(createBackup({ dbPath })).rejects.toThrow(/nothing to back up/);
  });
});

describe('fileCopyBackup (fallback engine)', () => {
  it('copies the db and its -wal/-shm siblings', () => {
    makeDb(['a']);
    writeFileSync(`${dbPath}-wal`, 'wal-bytes');
    writeFileSync(`${dbPath}-shm`, 'shm-bytes');
    const dest = path.join(root, 'copy.db');
    fileCopyBackup(dbPath, dest);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(`${dest}-wal`)).toBe(true);
    expect(existsSync(`${dest}-shm`)).toBe(true);
  });
});

describe('listBackups', () => {
  it('returns newest first and ignores foreign files', async () => {
    makeDb(['a']);
    await createBackup({ dbPath, now: new Date(2026, 6, 6, 1, 0, 0) });
    await createBackup({ dbPath, now: new Date(2026, 6, 6, 2, 0, 0) });
    writeFileSync(path.join(root, 'backups', 'notes.txt'), 'not a snapshot');
    const names = listBackups({ dbPath }).map((b) => path.basename(b.file));
    expect(names).toEqual(['memory-20260706-020000.db', 'memory-20260706-010000.db']);
  });
});

describe('restoreBackup', () => {
  it('refuses to overwrite a live db without force', async () => {
    makeDb(['a']);
    const snap = await createBackup({ dbPath });
    await expect(restoreBackup(snap.dest, { dbPath })).rejects.toThrow(/--force/);
  });

  it('rolls back to the snapshot, takes a safety snapshot, clears stale WAL', async () => {
    makeDb(['a']);
    const snap = await createBackup({ dbPath, now: new Date(2026, 6, 6, 1, 0, 0) });
    makeDb(['a', 'z']); // diverge after the snapshot
    writeFileSync(`${dbPath}-wal`, 'stale'); // must not survive the restore

    const result = await restoreBackup(snap.dest, { dbPath, force: true, now: new Date(2026, 6, 6, 2, 0, 0) });

    // WAL assertions FIRST — any subsequent connection (readKeys) recreates
    // a fresh empty -wal on a WAL-mode file; the contract is that restore
    // itself returns a pristine tree with the stale one gone.
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    expect(result.integrity).toBe('ok');
    expect(readKeys(dbPath)).toEqual(['a']);
    expect(existsSync(result.safetySnapshot)).toBe(true);
    expect(readKeys(result.safetySnapshot)).toEqual(['a', 'z']); // pre-restore state preserved
  });

  it('errors on a missing snapshot file', async () => {
    await expect(restoreBackup(path.join(root, 'nope.db'), { dbPath })).rejects.toThrow(/not found/);
  });
});

describe('rotation safety', () => {
  it('backups dir contents never include the live db path', async () => {
    makeDb(['a']);
    await createBackup({ dbPath, keep: 1 });
    const files = readdirSync(path.join(root, 'backups'));
    expect(files.every((f) => f.startsWith('memory-') && f.endsWith('.db'))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });
});
