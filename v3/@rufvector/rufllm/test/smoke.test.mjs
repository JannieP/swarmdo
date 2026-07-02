/**
 * @rufvector/rufllm smoke test (node:test).
 *
 * Locks in the fork of the ruvllm hybrid package: the pure-TS SonaCoordinator /
 * ContrastiveTrainer that rufflo actually uses (intelligence.ts,
 * sona-optimizer.ts), plus the bundled native binding (RufLlmEngine).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// rufflo loads this package via CJS `requireCjs('@rufvector/rufllm')`
// (intelligence.ts / sona-optimizer.ts), so exercise the CJS entry (dist/cjs).
const require = createRequire(import.meta.url);
const rufllm = require('@rufvector/rufllm');

test('exports the surface rufflo depends on', () => {
  assert.equal(typeof rufllm.SonaCoordinator, 'function', 'SonaCoordinator');
  assert.equal(typeof rufllm.ContrastiveTrainer, 'function', 'ContrastiveTrainer');
  assert.ok(rufllm.DEFAULT_SONA_CONFIG && typeof rufllm.DEFAULT_SONA_CONFIG === 'object', 'DEFAULT_SONA_CONFIG');
});

test('SonaCoordinator constructs with DEFAULT_SONA_CONFIG (intelligence.ts usage)', () => {
  const sc = new rufllm.SonaCoordinator(rufllm.DEFAULT_SONA_CONFIG);
  assert.equal(typeof sc.recordSignal, 'function', 'has recordSignal');
  assert.equal(typeof sc.stats, 'function', 'has stats');
});

test('ContrastiveTrainer constructs (sona-optimizer.ts usage)', () => {
  const ct = new rufllm.ContrastiveTrainer({ batchSize: 32, margin: 0.5 });
  assert.ok(ct, 'constructed');
});

test('bundled native binding loads (native version, not the JS fallback)', () => {
  // version() returns the native version when the bundled .node loads,
  // or "0.1.0-js" when it falls back to pure JS.
  const v = rufllm.version();
  assert.equal(typeof v, 'string', 'version() returns a string');
  assert.notEqual(v, '0.1.0-js', 'native binding loaded (not the pure-JS fallback)');
  // hasSimdSupport() is true only when the native binary is present
  assert.equal(rufllm.hasSimdSupport(), true, 'native SIMD support reported via bundled binary');
});
