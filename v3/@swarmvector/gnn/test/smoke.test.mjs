/** @swarmvector/gnn smoke test — transitive dep of swarmvector/agentdb; verify the native binding loads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const gnn = await import('@swarmvector/gnn');
test('exposes GNN surface', () => {
  assert.equal(typeof gnn.SwarmvectorLayer, 'function', 'SwarmvectorLayer');
  assert.equal(typeof gnn.TensorCompress, 'function', 'TensorCompress');
  assert.equal(typeof gnn.differentiableSearch, 'function', 'differentiableSearch');
});
