/**
 * @swarmvector/attention smoke test (node:test).
 * Mirrors swarmdo usage: construct an attention mechanism and call computeRaw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const attn = await import('@swarmvector/attention');

test('exports attention mechanisms', () => {
  assert.equal(typeof attn.DotProductAttention, 'function', 'DotProductAttention');
  assert.equal(typeof attn.FlashAttention, 'function', 'FlashAttention');
  assert.equal(typeof attn.MultiHeadAttention, 'function', 'MultiHeadAttention');
});

test('compute + computeRaw shim return the same dim-length vector', () => {
  const dim = 4;
  const a = new attn.DotProductAttention(dim);
  const query = new Float32Array([1, 0, 0, 0]);
  const keys = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0])];
  const values = [new Float32Array([1, 1, 1, 1]), new Float32Array([2, 2, 2, 2])];

  // native method
  const out = a.compute(query, keys, values);
  assert.ok(out && typeof out.length === 'number', 'compute returns an array-like');
  assert.equal(out.length, dim, 'output dimensionality matches input dim');

  // compatibility shim: swarmdo calls computeRaw, which the fork aliases to compute
  assert.equal(typeof a.computeRaw, 'function', 'computeRaw alias present (swarmdo compat)');
  const outRaw = a.computeRaw(query, keys, values);
  assert.deepEqual(Array.from(outRaw), Array.from(out), 'computeRaw === compute');
});
