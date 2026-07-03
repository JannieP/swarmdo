import { test } from 'node:test';
import assert from 'node:assert/strict';

// @rufnet/bmssp — renamed fork of @ruvnet/bmssp@1.0.0 (prebuilt wasm-bindgen).
// teammate-plugin's semantic-router/topology-optimizer call default() then
// use WasmNeuralBMSSP, so those exports are the contract.
test('exposes the API teammate-plugin adopts', async () => {
  const m = await import('../bmssp_rust.js');
  assert.equal(typeof m.default, 'function');
  assert.equal(typeof m.WasmNeuralBMSSP, 'function');
  assert.equal(typeof m.WasmGraph, 'function');
});
