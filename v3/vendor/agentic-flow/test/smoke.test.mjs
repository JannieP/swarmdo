/**
 * agentic-flow smoke test (node:test).
 * Vendored fork of the upstream `agentic-flow@2.0.14` published tarball
 * (internal ruv->ruf sweep; name kept). rufflo imports these subpaths via
 * `await import('agentic-flow/<subpath>')` (all optional / safeImport).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The subpaths rufflo actually consumes. (agent-booster is intentionally
// omitted: its exports map entry points to a file the upstream tarball never
// shipped, so it fails against upstream too and rufflo uses safeImport.)
const SUBPATHS = [
  'agentic-flow/embeddings',
  'agentic-flow/reasoningbank',
  'agentic-flow/router',
  'agentic-flow/orchestration',
  'agentic-flow/transport/loader',
];

for (const sub of SUBPATHS) {
  test(`subpath loads: ${sub}`, async () => {
    const mod = await import(sub);
    assert.ok(mod && typeof mod === 'object', `${sub} resolves to a module`);
    assert.ok(Object.keys(mod).length > 0, `${sub} exposes exports`);
  });
}
