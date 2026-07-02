/**
 * @rufvector/rufllm-wasm smoke test (node:test).
 * Fork of the upstream @ruvector/rufllm-wasm (prebuilt WASM/dist; package renamed
 * @ruvector/* -> @rufvector/*). rufflo loads it via optional `await import()`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('package loads via its published entry', async () => {
  const mod = await import('@rufvector/rufllm-wasm');
  assert.ok(mod && typeof mod === 'object', 'resolves to a module namespace');
  assert.ok(Object.keys(mod).length > 0, 'exposes at least one export');
});

test('package.json name is the @rufvector fork name', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), 'utf8'));
  assert.equal(pkg.name, '@rufvector/rufllm-wasm', 'name renamed to fork');
});
