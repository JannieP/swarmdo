/**
 * @rufvector/tiny-dancer smoke test (node:test).
 * tiny-dancer is a declared (gated) optional dep; verify the native binding
 * loads and exposes its router surface.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const td = await import('@rufvector/tiny-dancer');

test('exposes router surface', () => {
  assert.equal(typeof td.Router, 'function', 'Router class exported');
  assert.equal(typeof td.trainRouter, 'function', 'trainRouter function exported');
});

test('version is reachable through the native binding', () => {
  const v = typeof td.version === 'function' ? td.version() : td.version;
  assert.ok(v != null, 'version present');
});
