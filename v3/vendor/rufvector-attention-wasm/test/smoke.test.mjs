import { test } from 'node:test';
import assert from 'node:assert/strict';

// rufvector-attention-wasm — renamed fork of ruvector-attention-wasm@0.1.32,
// the version agentdb's AttentionWASM controller runs against.
test('exposes the attention classes agentdb uses', async () => {
  const m = await import('../ruvector_attention_wasm.js');
  assert.equal(typeof m.WasmFlashAttention, 'function');
  assert.equal(typeof m.WasmHyperbolicAttention, 'function');
  assert.ok(Object.keys(m).length >= 20, 'full attention surface present');
});
