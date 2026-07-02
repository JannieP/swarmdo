/** @rufvector/graph-transformer smoke test — transitive dep; verify native binding loads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const gt = await import('@rufvector/graph-transformer');
test('exposes GraphTransformer + version', () => {
  assert.equal(typeof gt.GraphTransformer, 'function', 'GraphTransformer');
  const v = typeof gt.version === 'function' ? gt.version() : gt.version;
  assert.ok(v != null, 'version reachable through native binding');
});
