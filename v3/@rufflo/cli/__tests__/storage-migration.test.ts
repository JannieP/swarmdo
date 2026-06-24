/**
 * storage-migration tests — clean-break rename (.claude-flow -> .rufflo).
 *
 * Uses a real temp dir (the module does plain fs ops; mocking fs adds no value
 * and the ops are fast + isolated).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateStorageDir } from '../src/storage-migration.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rufflo-mig-'));
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('migrateStorageDir', () => {
  it('returns noop when neither directory exists', () => {
    expect(migrateStorageDir(dir)).toBe('noop');
    expect(existsSync(join(dir, '.rufflo'))).toBe(false);
  });

  it('renames .claude-flow -> .rufflo and preserves contents', () => {
    const old = join(dir, '.claude-flow');
    mkdirSync(join(old, 'agents'), { recursive: true });
    writeFileSync(join(old, 'agents', 'store.json'), '{"agents":{"a1":{}},"version":"3.0.0"}');

    const result = migrateStorageDir(dir);

    expect(result).toBe('migrated');
    expect(existsSync(old)).toBe(false);
    const moved = join(dir, '.rufflo', 'agents', 'store.json');
    expect(existsSync(moved)).toBe(true);
    expect(JSON.parse(readFileSync(moved, 'utf8')).agents.a1).toBeDefined();
  });

  it('is a noop when .rufflo already exists (does not clobber)', () => {
    mkdirSync(join(dir, '.claude-flow'), { recursive: true });
    mkdirSync(join(dir, '.rufflo'), { recursive: true });
    writeFileSync(join(dir, '.rufflo', 'keep.txt'), 'new-data');

    // Fresh module guard would block a second call in-process, but each test
    // dir is distinct; the guard only prevents repeat work within one run, so
    // assert the *outcome* (no clobber) rather than the return value here.
    migrateStorageDir(dir);

    expect(readFileSync(join(dir, '.rufflo', 'keep.txt'), 'utf8')).toBe('new-data');
    expect(existsSync(join(dir, '.claude-flow'))).toBe(true); // left untouched
  });
});
