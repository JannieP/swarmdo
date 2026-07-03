import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));

// rufvector-onnx-embeddings-wasm — renamed fork of
// ruvector-onnx-embeddings-wasm@0.1.2 (agentic-flow optional dep).
//
// Upstream quirk preserved verbatim: the package declares "type": "module"
// but its wasm-bindgen glue is CJS, so the MAIN entry throws under ESM
// ("module is not defined"). agentic-flow's dynamic import always hit that
// and fell back — identical with the fork. The /loader subpath is real ESM.
test('ships the wasm binary', () => {
  assert.ok(existsSync(join(pkgDir, 'ruvector_onnx_embeddings_wasm_bg.wasm')));
});

test('loader subpath is importable ESM with model registry', async () => {
  const m = await import('../loader.js');
  assert.ok(m.MODELS && typeof m.MODELS === 'object');
  assert.ok('all-MiniLM-L6-v2' in m.MODELS);
});

test('main entry fails under ESM exactly like upstream (consumers fall back)', async () => {
  await assert.rejects(
    () => import('../ruvector_onnx_embeddings_wasm.js'),
    /module is not defined/
  );
});
