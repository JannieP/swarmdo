#!/usr/bin/env node
/**
 * Regression guard for #2086 — rufllm WASM auto-init via MCP tools.
 *
 * Reported by @seo-yas: every `rufllm_*` MCP tool that touches the WASM
 * runtime requires `initRufllmWasm()` to have run first, but no MCP tool
 * exposed that bootstrap call and `loadRufllmWasm()` didn't trigger it.
 * Result: `rufllm_status` reported `wasm.initialized=false` even after
 * calling `rufllm_sona_create` / `rufllm_microlora_create` / `rufllm_hnsw_create`.
 *
 * Fix: `loadRufllmWasm()` now calls `mod.initRufllmWasm()` after import.
 * `rufllm_status` deliberately keeps using the un-init loader so it can
 * report a non-initialized state for diagnostics.
 *
 * This smoke verifies:
 *   1. The `loadRufllmWasm` helper exists AND calls `initRufllmWasm`
 *      (regression catch — easy to delete the await in a refactor).
 *   2. The `rufllm_status` handler does NOT call `initRufllmWasm`
 *      (it must remain a pure diagnostic).
 *   3. The set of WASM-touching tools is exactly the expected list —
 *      adding a new rufllm_* tool that talks to WASM without going
 *      through `loadRufllmWasm()` is a regression of #2086.
 *
 * Run: `node scripts/smoke-rufllm-wasm-auto-init.mjs`
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../v3/@rufflo/cli/src/mcp-tools/rufllm-tools.ts');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

const src = readFileSync(SOURCE, 'utf8');

// Check 1: loadRufllmWasm awaits mod.initRufllmWasm()
const loaderBlock = src.match(/async function loadRufllmWasm\(\)[\s\S]*?\n\}/);
if (!loaderBlock) {
  fail('loadRufllmWasm() helper not found in rufllm-tools.ts');
} else if (!/await\s+mod\.initRufllmWasm\(\)/.test(loaderBlock[0])) {
  fail('loadRufllmWasm() does NOT call `await mod.initRufllmWasm()` — #2086 regression');
} else {
  pass('loadRufllmWasm() invokes mod.initRufllmWasm()');
}

// Check 2: loadRufllmWasmModule helper exists (the un-init variant for status)
const moduleBlock = src.match(/async function loadRufllmWasmModule\(\)[\s\S]*?\n\}/);
if (!moduleBlock) {
  fail('loadRufllmWasmModule() helper missing — #2086 fix removed the diagnostic path');
} else if (/initRufllmWasm/.test(moduleBlock[0])) {
  fail('loadRufllmWasmModule() should NOT init — its purpose is to report uninitialized state');
} else {
  pass('loadRufllmWasmModule() preserves un-initialized diagnostic path');
}

// Check 3: rufllm_status handler uses the un-init loader
const statusHandler = src.match(/name:\s*'rufllm_status'[\s\S]*?handler:\s*async[\s\S]*?\n\s{4,6}\},?\n/);
if (!statusHandler) {
  fail('Could not locate rufllm_status handler in rufllm-tools.ts');
} else if (/await\s+loadRufllmWasm\(\)/.test(statusHandler[0])) {
  fail('rufllm_status handler uses loadRufllmWasm() — would auto-init, losing diagnostic value');
} else if (!/await\s+loadRufllmWasmModule\(\)/.test(statusHandler[0])) {
  fail('rufllm_status handler does not use loadRufllmWasmModule()');
} else {
  pass('rufllm_status handler uses loadRufllmWasmModule() (no auto-init)');
}

// Check 4: every other WASM-touching tool routes through loadRufllmWasm()
const wasmTouchingTools = [
  'rufllm_hnsw_create',
  'rufllm_hnsw_add',
  'rufllm_hnsw_route',
  'rufllm_sona_create',
  'rufllm_sona_adapt',
  'rufllm_microlora_create',
  'rufllm_microlora_adapt',
  'rufllm_chat_format',
];

for (const name of wasmTouchingTools) {
  const re = new RegExp(`name:\\s*'${name}'[\\s\\S]*?handler:\\s*async[\\s\\S]*?\\n\\s{4,6}\\},?\\n`);
  const block = src.match(re);
  if (!block) {
    fail(`Could not locate ${name} handler`);
    continue;
  }
  // Either it routes through loadRufllmWasm (auto-init path) OR it uses
  // a previously created instance (sonaInstances / hnswRouters) where the
  // create handler already did the init.
  const usesAutoInit = /await\s+loadRufllmWasm\(\)/.test(block[0]);
  const usesInstanceLookup = /(?:sonaInstances|hnswRouters|loraInstances)\.get/.test(block[0]);
  if (!usesAutoInit && !usesInstanceLookup) {
    fail(`${name} bypasses loadRufllmWasm() AND has no instance lookup — #2086 regression`);
  } else {
    pass(`${name} ${usesAutoInit ? 'auto-inits via loadRufllmWasm()' : 'uses prior instance from create handler'}`);
  }
}

// Check 5: rufllm_generate_config is the only tool that legitimately
// doesn't touch the runtime (it just composes a config object). Verify
// we haven't added a new tool that bypasses loadRufllmWasm by accident.
const allToolNames = [...src.matchAll(/name:\s*'(rufllm_[a-z_]+)'/g)].map((m) => m[1]);
const expectedUnique = new Set([...wasmTouchingTools, 'rufllm_status', 'rufllm_generate_config']);
const unexpected = allToolNames.filter((n) => !expectedUnique.has(n));
if (unexpected.length > 0) {
  fail(
    `New rufllm_* tools found that this smoke does not classify: ${unexpected.join(', ')}. ` +
      `If they touch WASM, ensure they call loadRufllmWasm(); then add them to this smoke.`,
  );
} else {
  pass(`Tool surface = expected ${allToolNames.length} (${[...allToolNames].sort().join(', ')})`);
}

if (process.exitCode) {
  console.error('\n#2086 regression smoke FAILED');
} else {
  console.log('\n#2086 regression smoke PASS');
}
