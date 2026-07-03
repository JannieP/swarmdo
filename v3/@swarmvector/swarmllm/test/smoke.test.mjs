/**
 * @swarmvector/swarmllm smoke test (node:test).
 *
 * Locks in the fork of the swarmllm hybrid package: the pure-TS SonaCoordinator /
 * ContrastiveTrainer that swarmdo actually uses (intelligence.ts,
 * sona-optimizer.ts), plus the bundled native binding (RufLlmEngine).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// swarmdo loads this package via CJS `requireCjs('@swarmvector/swarmllm')`
// (intelligence.ts / sona-optimizer.ts), so exercise the CJS entry (dist/cjs).
const require = createRequire(import.meta.url);
const swarmllm = require('@swarmvector/swarmllm');

test('exports the surface swarmdo depends on', () => {
  assert.equal(typeof swarmllm.SonaCoordinator, 'function', 'SonaCoordinator');
  assert.equal(typeof swarmllm.ContrastiveTrainer, 'function', 'ContrastiveTrainer');
  assert.ok(swarmllm.DEFAULT_SONA_CONFIG && typeof swarmllm.DEFAULT_SONA_CONFIG === 'object', 'DEFAULT_SONA_CONFIG');
});

test('SonaCoordinator constructs with DEFAULT_SONA_CONFIG (intelligence.ts usage)', () => {
  const sc = new swarmllm.SonaCoordinator(swarmllm.DEFAULT_SONA_CONFIG);
  assert.equal(typeof sc.recordSignal, 'function', 'has recordSignal');
  assert.equal(typeof sc.stats, 'function', 'has stats');
});

test('ContrastiveTrainer constructs (sona-optimizer.ts usage)', () => {
  const ct = new swarmllm.ContrastiveTrainer({ batchSize: 32, margin: 0.5 });
  assert.ok(ct, 'constructed');
});

test('bundled native binding loads (native version, not the JS fallback)', () => {
  // version() returns the native version when the bundled .node loads,
  // or "0.1.0-js" when it falls back to pure JS.
  const v = swarmllm.version();
  assert.equal(typeof v, 'string', 'version() returns a string');
  assert.notEqual(v, '0.1.0-js', 'native binding loaded (not the pure-JS fallback)');
  // hasSimdSupport() is true only when the native binary is present
  assert.equal(swarmllm.hasSimdSupport(), true, 'native SIMD support reported via bundled binary');
});
