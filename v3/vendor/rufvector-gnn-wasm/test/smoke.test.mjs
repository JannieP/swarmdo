import { test } from 'node:test';
import assert from 'node:assert/strict';

// rufvector-gnn-wasm — renamed fork of ruvector-gnn-wasm@2.1.0. Note: its
// default export is a wasm-bindgen init fn, NOT a path string — consumers
// (healthcare gnn-bridge) guard on that before adopting.
test('exposes the gnn surface; default is an init function', async () => {
  const m = await import('../ruvector_gnn_wasm.js');
  assert.equal(typeof m.JsRuvectorLayer, 'function');
  assert.equal(typeof m.cosineSimilarity, 'function');
  assert.equal(typeof m.default, 'function');
  assert.notEqual(typeof m.default, 'string');
});
