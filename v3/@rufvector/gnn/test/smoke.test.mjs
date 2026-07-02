/** @rufvector/gnn smoke test — transitive dep of ruvector/agentdb; verify the native binding loads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const gnn = await import('@rufvector/gnn');
test('exposes GNN surface', () => {
  assert.equal(typeof gnn.RufvectorLayer, 'function', 'RufvectorLayer');
  assert.equal(typeof gnn.TensorCompress, 'function', 'TensorCompress');
  assert.equal(typeof gnn.differentiableSearch, 'function', 'differentiableSearch');
});
