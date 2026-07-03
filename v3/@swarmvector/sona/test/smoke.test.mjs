/**
 * @swarmvector/sona smoke test (node:test).
 *
 * Locks in the fork: the package loads its bundled native binding and the
 * SonaEngine napi round-trip works (construct + trajectory recording).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sona = await import('@swarmvector/sona');
const SonaEngine = sona.SonaEngine || sona.default?.SonaEngine;

test('package exposes SonaEngine', () => {
  assert.equal(typeof SonaEngine, 'function', 'SonaEngine constructor exported');
});

test('construct + trajectory round-trip through the native binding', () => {
  const engine = new SonaEngine(64); // hidden_dim
  const query = Array.from({ length: 64 }, (_, i) => (i % 7) / 7);
  const tid = engine.beginTrajectory(query);
  assert.equal(typeof tid, 'number', 'beginTrajectory returns a numeric id');

  const activations = Array.from({ length: 64 }, () => 0.01);
  const attention = Array.from({ length: 64 }, () => 0.02);
  // Should not throw across the napi boundary.
  engine.addTrajectoryStep(tid, activations, attention, 1.0);
  engine.setTrajectoryRoute(tid, 'sonnet');
  assert.ok(true, 'trajectory steps recorded without error');
});
