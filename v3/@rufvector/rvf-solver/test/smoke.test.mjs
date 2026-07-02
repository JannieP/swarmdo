/**
 * @rufvector/rvf-solver smoke test (node:test).
 * Fork of upstream @ruvector/rvf-solver (package renamed @ruvector/* -> @rufvector/*).
 * Part of the rvf family; rufflo loads the rvf umbrella via optional import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('package loads via its published entry', async () => {
  const mod = await import('@rufvector/rvf-solver');
  assert.ok(mod && typeof mod === 'object', 'resolves to a module namespace');
  assert.ok(Object.keys(mod).length > 0, 'exposes at least one export');
});

test('package.json name is the @rufvector fork name', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.equal(pkg.name, '@rufvector/rvf-solver', 'name renamed to fork');
});
