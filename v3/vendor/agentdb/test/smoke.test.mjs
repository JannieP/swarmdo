/**
 * agentdb smoke test (node:test).
 * Vendored fork of the upstream `agentdb` (internal ruv->ruf sweep; name kept).
 * swarmdo loads it via `await import('agentdb')`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const agentdb = await import('agentdb');
const ns = agentdb.default ?? agentdb;

test('package loads with a broad export surface', () => {
  assert.ok(Object.keys(agentdb).length > 30, 'exposes many named exports');
});

test('core classes/functions are exported', () => {
  const AgentDB = agentdb.AgentDB ?? ns.AgentDB;
  assert.equal(typeof AgentDB, 'function', 'AgentDB class');
  assert.equal(typeof (agentdb.HNSWIndex ?? ns.HNSWIndex), 'function', 'HNSWIndex class');
  assert.equal(typeof (agentdb.isHnswlibAvailable ?? ns.isHnswlibAvailable), 'function', 'isHnswlibAvailable fn');
});

test('isHnswlibAvailable() is callable and resolves to a boolean', async () => {
  const fn = agentdb.isHnswlibAvailable ?? ns.isHnswlibAvailable;
  const v = await fn();
  assert.equal(typeof v, 'boolean', 'resolves to a boolean');
});
