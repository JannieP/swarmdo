import { test } from 'node:test';
import assert from 'node:assert/strict';

// rufvector-graph-transformer-wasm — renamed fork of
// ruvector-graph-transformer-wasm@2.0.4 (agentdb optional dep).
test('exposes JsGraphTransformer', async () => {
  const m = await import('../ruvector_graph_transformer_wasm.js');
  assert.equal(typeof m.JsGraphTransformer, 'function');
  assert.equal(typeof m.default, 'function');
});
