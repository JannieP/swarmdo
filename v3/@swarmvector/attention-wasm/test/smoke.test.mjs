/**
 * @swarmvector/attention-wasm smoke test (node:test).
 * Fork of upstream @swarmvector/attention-wasm (prebuilt WASM; renamed @swarmvector/* -> @swarmvector/*).
 * Declared by swarmdo plugins; loaded via optional import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('package loads via its published entry', async () => {
  const mod = await import('@swarmvector/attention-wasm');
  assert.ok(mod && typeof mod === 'object', 'resolves to a module namespace');
  assert.ok(Object.keys(mod).length > 0, 'exposes at least one export');
});

test('package.json name is the @swarmvector fork name', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.equal(pkg.name, '@swarmvector/attention-wasm', 'name renamed to fork');
});
