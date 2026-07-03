/**
 * @swarmvector/rvf-solver smoke test (node:test).
 * Fork of upstream @swarmvector/rvf-solver (package renamed @swarmvector/* -> @swarmvector/*).
 * Part of the rvf family; swarmdo loads the rvf umbrella via optional import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('package loads via its published entry', async () => {
  const mod = await import('@swarmvector/rvf-solver');
  assert.ok(mod && typeof mod === 'object', 'resolves to a module namespace');
  assert.ok(Object.keys(mod).length > 0, 'exposes at least one export');
});

test('package.json name is the @swarmvector fork name', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.equal(pkg.name, '@swarmvector/rvf-solver', 'name renamed to fork');
});
