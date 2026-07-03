/**
 * One-time storage-directory migration: `.claude-flow/` -> `.swarmdo/`.
 *
 * The clean-break rename (chore/rename-to-swarmdo) changed every STORAGE_DIR
 * constant and path join from `.claude-flow` to `.swarmdo`. Existing users
 * have their agent registry, swarm state, task store, sessions, and
 * bench-results under the OLD `.claude-flow/` directory. Without this shim
 * they would silently start from an empty store after upgrading.
 *
 * Behavior (idempotent, best-effort, never throws into the CLI):
 *   - If `.swarmdo/` already exists -> do nothing (already migrated, or fresh).
 *   - Else if `.claude-flow/` exists -> rename it to `.swarmdo/`.
 *   - On a cross-device or permission error, fall back to a recursive copy
 *     and leave the original in place (so no data is lost).
 *   - Idempotent by STATE (presence of `.swarmdo/`), not a process flag — so a
 *     second call after a successful migration is a cheap single existsSync.
 */

import { existsSync, renameSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const OLD_DIR = '.claude-flow';
const NEW_DIR = '.swarmdo';

/**
 * Migrate `<cwd>/.claude-flow` to `<cwd>/.swarmdo` if needed.
 * @returns `'migrated' | 'copied' | 'noop'` describing what happened.
 */
export function migrateStorageDir(cwd: string = process.cwd()): 'migrated' | 'copied' | 'noop' {
  try {
    const newPath = join(cwd, NEW_DIR);
    const oldPath = join(cwd, OLD_DIR);

    // Already on the new layout (or a fresh project): nothing to do.
    if (existsSync(newPath)) return 'noop';
    // No legacy data to migrate.
    if (!existsSync(oldPath)) return 'noop';

    try {
      renameSync(oldPath, newPath);
      logMigration(`Migrated ${OLD_DIR}/ -> ${NEW_DIR}/ (rename)`);
      return 'migrated';
    } catch {
      // Cross-device or locked: copy non-destructively, keep the original.
      cpSync(oldPath, newPath, { recursive: true });
      logMigration(`Copied ${OLD_DIR}/ -> ${NEW_DIR}/ (original left in place)`);
      return 'copied';
    }
  } catch {
    // Never let a storage-migration hiccup break the CLI.
    return 'noop';
  }
}

function logMigration(msg: string): void {
  // stderr only — never pollutes MCP JSON-RPC stdout. Silent unless it acted.
  if (process.env.SWARMDO_QUIET_MIGRATION === '1') return;
  try {
    process.stderr.write(`[swarmdo] ${msg}\n`);
  } catch {
    /* ignore */
  }
}
