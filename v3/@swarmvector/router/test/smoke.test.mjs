/**
 * @swarmvector/router smoke test (node:test).
 *
 * Locks in the fork and mirrors swarmdo's usage (diskann-backend.ts /
 * hooks-tools.ts): construct the HNSW VectorDb with DistanceMetric.Cosine,
 * insert, and search.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const router = await import('@swarmvector/router');
const { VectorDb, DistanceMetric } = router;

test('exports VectorDb + DistanceMetric', () => {
  assert.equal(typeof VectorDb, 'function', 'VectorDb exported');
  assert.equal(DistanceMetric.Cosine, 1, 'DistanceMetric.Cosine enum value');
});

test('HNSW construct + insert + search (swarmdo usage shape)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rufrouter-'));
  try {
    const db = new VectorDb({
      dimensions: 8,
      distanceMetric: DistanceMetric.Cosine,
      hnswM: 16,
      hnswEfConstruction: 200,
      hnswEfSearch: 100,
      storagePath: join(dir, 'vector.db'), // explicit path avoids shared-file lock contention
    });
    db.insert('a', new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]));
    db.insert('b', new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]));
    assert.equal(db.count(), 2, 'two vectors indexed');
    const res = db.search(new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]), 1);
    assert.ok(Array.isArray(res) && res.length === 1, 'search returns one hit');
    assert.equal(res[0].id, 'a', 'nearest to [1,0,...] is "a"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
