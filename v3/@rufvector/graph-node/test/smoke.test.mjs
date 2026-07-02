/** @rufvector/graph-node smoke test — transitive dep; verify native binding loads + version. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const gn = await import('@rufvector/graph-node');
test('exposes GraphDatabase + version', () => {
  assert.equal(typeof gn.GraphDatabase, 'function', 'GraphDatabase');
  const v = typeof gn.version === 'function' ? gn.version() : gn.version;
  assert.ok(v != null, 'version reachable through native binding');
});
