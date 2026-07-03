/**
 * @swarmvector/diskann smoke test (node:test).
 * Mirrors swarmdo usage (diskann-backend.ts): construct, insert, build, search.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DiskAnn } = await import('@swarmvector/diskann');

test('exports DiskAnn', () => {
  assert.equal(typeof DiskAnn, 'function', 'DiskAnn constructor');
});

test('insert + build + search round-trip', () => {
  const dim = 4;
  const index = new DiskAnn({ dim, maxDegree: 16, buildBeam: 32, searchBeam: 16 });
  index.insert('a', new Float32Array([1, 0, 0, 0]));
  index.insert('b', new Float32Array([0, 1, 0, 0]));
  index.insert('c', new Float32Array([0, 0, 1, 0]));
  if (typeof index.build === 'function') index.build();
  const res = index.search(new Float32Array([1, 0, 0, 0]), 1);
  assert.ok(Array.isArray(res) && res.length >= 1, 'search returns at least one result');
});
