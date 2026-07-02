/**
 * @rufvector/core smoke test (node:test — no extra deps).
 *
 * Locks in the fork's load-bearing guarantees:
 *   1. the package loads its bundled native binding,
 *   2. the DB engine functions (construct / insert / search / len),
 *   3. the default on-disk store is `vector.db` (NOT the legacy `ruvector.db`) —
 *      i.e. the baked-in Rust literal rename compiled in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const core = await import('@rufvector/core');
const VectorDb = core.VectorDb || core.default?.VectorDb;

test('package exposes the engine API', () => {
  assert.equal(typeof VectorDb, 'function', 'VectorDb constructor exported');
  assert.equal(typeof core.version, 'function', 'version() exported');
  assert.match(String(core.version()), /^\d+\.\d+\.\d+/, 'version is semver-ish');
});

test('construct / insert / search / len', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rufvector-'));
  try {
    const db = new VectorDb({ dimensions: 8, distanceMetric: 'Cosine', storagePath: join(dir, 'vector.db') });
    await db.insert({ id: 'a', vector: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]) });
    await db.insert({ id: 'b', vector: new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]) });
    assert.equal(await db.len(), 2, 'two vectors stored');
    const res = await db.search({ vector: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]), k: 1 });
    assert.ok(Array.isArray(res) && res.length === 1, 'search returns one hit');
    assert.equal(res[0].id, 'a', 'nearest to [1,0,...] is "a"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default on-disk store is vector.db, never ruvector.db', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rufvector-default-'));
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    const db = new VectorDb({ dimensions: 3 }); // no storagePath -> baked-in default
    await db.insert({ id: 'x', vector: new Float32Array([1, 0, 0]) });
    assert.ok(existsSync(join(dir, 'vector.db')), 'default store is vector.db');
    assert.ok(!existsSync(join(dir, 'ruvector.db')), 'legacy ruvector.db must NOT appear');
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
