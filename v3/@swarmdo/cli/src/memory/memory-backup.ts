/**
 * memory-backup.ts — WAL-safe snapshot, keep-N rotation and restore for the
 * SQLite memory database (`.swarm/memory.db`).
 *
 * Why this exists: #2431 documented real corruption of this exact file (a
 * sql.js whole-file flush overwriting live better-sqlite3 WAL writes), and
 * the only recovery path today is the manual, schema-lossy JSON export.
 * Capability ported from upstream claude-flow v3.23.0 (PR #2571): WAL-safe
 * online backup + rotation, minus the GCS offsite leg (local-first; add
 * offsite when someone actually configures it).
 *
 * Engine: better-sqlite3's online backup API when loadable — correct while
 * concurrent writers have the WAL open. Falls back to a best-effort copy of
 * the db + `-wal`/`-shm` siblings when the native module is unavailable
 * (same graceful-degradation posture as graph-edge-writer.ts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveDbPath } from './memory-initializer.js';

export type BackupEngine = 'better-sqlite3' | 'file-copy';

export interface BackupResult {
  dest: string;
  bytes: number;
  engine: BackupEngine;
  /** 'ok' from PRAGMA quick_check, 'skipped' when the native engine is absent */
  integrity: string;
  pruned: string[];
}

export interface BackupOptions {
  dbPath?: string;
  outDir?: string;
  /** newest snapshots to retain after this run; 0/undefined disables pruning */
  keep?: number;
  /** injectable clock for deterministic tests */
  now?: Date;
}

export interface BackupListing {
  file: string;
  bytes: number;
  mtimeMs: number;
}

export interface RestoreResult {
  dbPath: string;
  /** snapshot of the pre-restore state, taken before overwriting */
  safetySnapshot: string;
  integrity: string;
}

const BACKUP_NAME = /^memory-\d{8}-\d{6}(-\d+)?\.db$/;

export function backupDirFor(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'backups');
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/** memory-YYYYMMDD-HHMMSS.db in local time — lexicographic == chronological. */
export function backupFileName(now: Date): string {
  return (
    `memory-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}` +
    `-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}.db`
  );
}

/** Sibling WAL artifacts that must travel (or die) with a db file. */
function walSiblings(dbFile: string): string[] {
  return [`${dbFile}-wal`, `${dbFile}-shm`];
}

async function loadBetterSqlite(): Promise<any | null> {
  try {
    const mod = await import('better-sqlite3');
    return (mod as { default?: unknown }).default ?? mod;
  } catch {
    return null;
  }
}

/** PRAGMA quick_check via the native engine; 'skipped' when unavailable. */
async function quickCheck(file: string): Promise<string> {
  const Database = await loadBetterSqlite();
  if (!Database) return 'skipped';
  const db = new Database(file, { readonly: true });
  try {
    const row = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    return row?.quick_check ?? 'unknown';
  } finally {
    db.close();
  }
}

/**
 * Fallback engine: plain copy of the db plus any `-wal`/`-shm` siblings.
 * Not transactionally consistent under an active writer — documented
 * best-effort, only used when better-sqlite3 cannot load.
 */
export function fileCopyBackup(dbPath: string, dest: string): void {
  fs.copyFileSync(dbPath, dest);
  for (const sibling of walSiblings(dbPath)) {
    if (fs.existsSync(sibling)) {
      fs.copyFileSync(sibling, dest + sibling.slice(dbPath.length));
    }
  }
}

/** Next non-colliding destination for this timestamp (same-second runs). */
function uniqueDest(outDir: string, now: Date): string {
  const base = backupFileName(now);
  let dest = path.join(outDir, base);
  for (let i = 1; fs.existsSync(dest); i++) {
    dest = path.join(outDir, base.replace(/\.db$/, `-${i}.db`));
  }
  return dest;
}

function pruneOld(outDir: string, keep: number): string[] {
  if (!keep || keep <= 0) return [];
  const snapshots = fs
    .readdirSync(outDir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort()
    .reverse(); // newest first (zero-padded timestamps sort lexicographically)
  const pruned: string[] = [];
  for (const victim of snapshots.slice(keep)) {
    const full = path.join(outDir, victim);
    fs.rmSync(full, { force: true });
    for (const sibling of walSiblings(full)) fs.rmSync(sibling, { force: true });
    pruned.push(full);
  }
  return pruned;
}

/** Snapshot the memory db into `<db dir>/backups/`, then rotate. */
export async function createBackup(opts: BackupOptions = {}): Promise<BackupResult> {
  const dbPath = opts.dbPath ? path.resolve(opts.dbPath) : resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`memory database not found at ${dbPath} — nothing to back up`);
  }
  const outDir = opts.outDir ? path.resolve(opts.outDir) : backupDirFor(dbPath);
  fs.mkdirSync(outDir, { recursive: true });
  const dest = uniqueDest(outDir, opts.now ?? new Date());

  const Database = await loadBetterSqlite();
  let engine: BackupEngine;
  let integrity: string;
  if (Database) {
    const db = new Database(dbPath, { readonly: true });
    try {
      await db.backup(dest); // online backup — consistent under live WAL writers
    } finally {
      db.close();
    }
    engine = 'better-sqlite3';
    integrity = await quickCheck(dest);
    // quickCheck's connection creates fresh -wal/-shm next to the snapshot
    // on WAL-mode files; sweep so the backups dir holds only .db snapshots.
    for (const sibling of walSiblings(dest)) fs.rmSync(sibling, { force: true });
  } else {
    fileCopyBackup(dbPath, dest);
    engine = 'file-copy';
    integrity = 'skipped';
  }

  const pruned = pruneOld(outDir, opts.keep ?? 7).filter((p) => p !== dest);
  return { dest, bytes: fs.statSync(dest).size, engine, integrity, pruned };
}

/** Snapshots in `<db dir>/backups/`, newest first. */
export function listBackups(opts: Pick<BackupOptions, 'dbPath' | 'outDir'> = {}): BackupListing[] {
  const dbPath = opts.dbPath ? path.resolve(opts.dbPath) : resolveDbPath();
  const outDir = opts.outDir ? path.resolve(opts.outDir) : backupDirFor(dbPath);
  if (!fs.existsSync(outDir)) return [];
  return fs
    .readdirSync(outDir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const full = path.join(outDir, f);
      const st = fs.statSync(full);
      return { file: full, bytes: st.size, mtimeMs: st.mtimeMs };
    });
}

export interface RestoreOptions {
  dbPath?: string;
  /** required when the live db exists — restore is destructive */
  force?: boolean;
  now?: Date;
}

/**
 * Replace the live db with a snapshot. Always captures a safety snapshot of
 * the current state first (never pruned by this call), and removes stale
 * `-wal`/`-shm` siblings so SQLite cannot replay a WAL from the old file
 * over the restored bytes.
 */
export async function restoreBackup(backupFile: string, opts: RestoreOptions = {}): Promise<RestoreResult> {
  const source = path.resolve(backupFile);
  if (!fs.existsSync(source)) {
    throw new Error(`backup file not found: ${source}`);
  }
  const dbPath = opts.dbPath ? path.resolve(opts.dbPath) : resolveDbPath();

  let safetySnapshot = '(none — no live db existed)';
  if (fs.existsSync(dbPath)) {
    if (!opts.force) {
      throw new Error(`refusing to overwrite existing ${dbPath} — pass --force to restore`);
    }
    const safety = await createBackup({ dbPath, keep: 0, now: opts.now });
    safetySnapshot = safety.dest;
  }

  for (const sibling of walSiblings(dbPath)) fs.rmSync(sibling, { force: true });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(source, dbPath);
  const integrity = await quickCheck(dbPath);
  // quickCheck's own connection recreates fresh (empty) -wal/-shm on a
  // WAL-mode file; sweep again so a restore leaves a pristine tree.
  for (const sibling of walSiblings(dbPath)) fs.rmSync(sibling, { force: true });
  return { dbPath, safetySnapshot, integrity };
}
