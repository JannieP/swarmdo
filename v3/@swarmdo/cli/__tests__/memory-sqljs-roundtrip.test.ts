/**
 * Guards the `sql.js` dependency declaration (#cli/package.json).
 *
 * The CLI's memory subsystem (`memory-initializer.ts`, `rabitq-index.ts`,
 * `embeddings.ts`) imports `sql.js` directly — the pure-WASM SQLite engine that
 * is the documented "no native compilation" fallback. It was NOT declared in
 * `@swarmdo/cli`'s package.json (only in sibling workspace packages), so under
 * pnpm's strict isolation a clean `npx swarmdo` install couldn't resolve it and
 * the WHOLE memory subsystem failed with `Cannot find package 'sql.js'` on any
 * box without a hoisted copy (edge/Pi, fresh CI, strict installs).
 *
 * This exercises the full init → store → list path through sql.js in an
 * isolated temp store, so if the declaration is ever dropped (or sql.js stops
 * resolving) the suite fails loudly instead of silently shipping broken memory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir: string;
let prev: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swarmdo-sqljs-'));
  prev = process.env.SWARMDO_MEMORY_PATH;
  process.env.SWARMDO_MEMORY_PATH = dir; // isolated, fresh store
});
afterEach(() => {
  if (prev === undefined) delete process.env.SWARMDO_MEMORY_PATH;
  else process.env.SWARMDO_MEMORY_PATH = prev;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('memory subsystem works via sql.js (dependency guard)', () => {
  it('sql.js resolves from the cli package', async () => {
    // The direct import the runtime relies on — must not throw "Cannot find
    // package 'sql.js'". If this throws, the dependency declaration regressed.
    await expect(import('sql.js')).resolves.toBeDefined();
  });

  it('init → store → list round-trips through the WASM engine', async () => {
    const m = await import('../src/memory/memory-initializer.js');
    const init = await m.initializeMemoryDatabase({}) as { success: boolean };
    expect(init.success).toBe(true);

    const stored = await m.storeEntry({
      key: 'auth-1',
      value: 'authentication pattern',
      namespace: 'default',
      generateEmbeddingFlag: false,
    }) as { success: boolean };
    expect(stored.success).toBe(true);

    const listed = await m.listEntries({ limit: 20, offset: 0 }) as { success: boolean; entries: unknown[] };
    expect(listed.success).toBe(true);
    expect(listed.entries.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
