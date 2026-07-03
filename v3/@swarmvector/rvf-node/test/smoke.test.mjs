/**
 * @swarmvector/rvf-node smoke test (node:test).
 * Exercises the RvfDatabase lifecycle: create -> ingestBatch -> query -> close.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { RvfDatabase } = await import('@swarmvector/rvf-node');

test('exports RvfDatabase', () => {
  assert.equal(typeof RvfDatabase, 'function', 'RvfDatabase constructor');
  assert.equal(typeof RvfDatabase.create, 'function', 'static create');
});

test('create + ingestBatch + query round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rufrvf-'));
  try {
    const db = RvfDatabase.create(join(dir, 'index.rvf'), { dimension: 4 });
    // two vectors, flat Float32Array of length N*dim
    const vectors = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0]);
    const ids = [10, 20];
    const ingest = db.ingestBatch(vectors, ids);
    assert.equal(ingest.accepted, 2, 'both vectors accepted');

    const hits = db.query(new Float32Array([1, 0, 0, 0]), 1);
    assert.ok(Array.isArray(hits), 'query returns an array');
    if (hits.length > 0) {
      assert.equal(hits[0].id, 10, 'nearest to [1,0,0,0] is id 10');
      assert.equal(typeof hits[0].distance, 'number', 'result has a distance');
    }
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
