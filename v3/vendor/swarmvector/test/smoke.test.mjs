/**
 * swarmvector smoke test (node:test).
 * Vendored fork of the upstream `swarmvector` package (renamed swarm->ruf).
 * swarmdo loads it via `await import('swarmvector').catch(()=>null)`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rv = require('swarmvector');

test('package loads with a broad export surface', () => {
  assert.ok(rv && typeof rv === 'object', 'module loaded');
  assert.ok(Object.keys(rv).length > 100, 'exposes the full export surface (>100)');
});

test('key exports are constructable classes', () => {
  for (const name of ['AdaptiveEmbedder', 'CodeParser', 'ASTParser']) {
    assert.equal(typeof rv[name], 'function', `${name} exported as a class/function`);
  }
});

test('dynamic import (swarmdo usage) resolves', async () => {
  const mod = await import('swarmvector');
  const ns = mod.default ?? mod;
  assert.ok(ns && typeof ns === 'object', 'await import() resolves to the module');
});
