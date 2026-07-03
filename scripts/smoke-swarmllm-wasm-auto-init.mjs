#!/usr/bin/env node
/**
 * Regression guard for #2086 — swarmllm WASM auto-init via MCP tools.
 *
 * Reported by @seo-yas: every `swarmllm_*` MCP tool that touches the WASM
 * runtime requires `initSwarmllmWasm()` to have run first, but no MCP tool
 * exposed that bootstrap call and `loadSwarmllmWasm()` didn't trigger it.
 * Result: `swarmllm_status` reported `wasm.initialized=false` even after
 * calling `swarmllm_sona_create` / `swarmllm_microlora_create` / `swarmllm_hnsw_create`.
 *
 * Fix: `loadSwarmllmWasm()` now calls `mod.initSwarmllmWasm()` after import.
 * `swarmllm_status` deliberately keeps using the un-init loader so it can
 * report a non-initialized state for diagnostics.
 *
 * This smoke verifies:
 *   1. The `loadSwarmllmWasm` helper exists AND calls `initSwarmllmWasm`
 *      (regression catch — easy to delete the await in a refactor).
 *   2. The `swarmllm_status` handler does NOT call `initSwarmllmWasm`
 *      (it must remain a pure diagnostic).
 *   3. The set of WASM-touching tools is exactly the expected list —
 *      adding a new swarmllm_* tool that talks to WASM without going
 *      through `loadSwarmllmWasm()` is a regression of #2086.
 *
 * Run: `node scripts/smoke-swarmllm-wasm-auto-init.mjs`
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../v3/@swarmdo/cli/src/mcp-tools/swarmllm-tools.ts');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

const src = readFileSync(SOURCE, 'utf8');

// Check 1: loadSwarmllmWasm awaits mod.initSwarmllmWasm()
const loaderBlock = src.match(/async function loadSwarmllmWasm\(\)[\s\S]*?\n\}/);
if (!loaderBlock) {
  fail('loadSwarmllmWasm() helper not found in swarmllm-tools.ts');
} else if (!/await\s+mod\.initSwarmllmWasm\(\)/.test(loaderBlock[0])) {
  fail('loadSwarmllmWasm() does NOT call `await mod.initSwarmllmWasm()` — #2086 regression');
} else {
  pass('loadSwarmllmWasm() invokes mod.initSwarmllmWasm()');
}

// Check 2: loadSwarmllmWasmModule helper exists (the un-init variant for status)
const moduleBlock = src.match(/async function loadSwarmllmWasmModule\(\)[\s\S]*?\n\}/);
if (!moduleBlock) {
  fail('loadSwarmllmWasmModule() helper missing — #2086 fix removed the diagnostic path');
} else if (/initSwarmllmWasm/.test(moduleBlock[0])) {
  fail('loadSwarmllmWasmModule() should NOT init — its purpose is to report uninitialized state');
} else {
  pass('loadSwarmllmWasmModule() preserves un-initialized diagnostic path');
}

// Check 3: swarmllm_status handler uses the un-init loader
const statusHandler = src.match(/name:\s*'swarmllm_status'[\s\S]*?handler:\s*async[\s\S]*?\n\s{4,6}\},?\n/);
if (!statusHandler) {
  fail('Could not locate swarmllm_status handler in swarmllm-tools.ts');
} else if (/await\s+loadSwarmllmWasm\(\)/.test(statusHandler[0])) {
  fail('swarmllm_status handler uses loadSwarmllmWasm() — would auto-init, losing diagnostic value');
} else if (!/await\s+loadSwarmllmWasmModule\(\)/.test(statusHandler[0])) {
  fail('swarmllm_status handler does not use loadSwarmllmWasmModule()');
} else {
  pass('swarmllm_status handler uses loadSwarmllmWasmModule() (no auto-init)');
}

// Check 4: every other WASM-touching tool routes through loadSwarmllmWasm()
const wasmTouchingTools = [
  'swarmllm_hnsw_create',
  'swarmllm_hnsw_add',
  'swarmllm_hnsw_route',
  'swarmllm_sona_create',
  'swarmllm_sona_adapt',
  'swarmllm_microlora_create',
  'swarmllm_microlora_adapt',
  'swarmllm_chat_format',
];

for (const name of wasmTouchingTools) {
  const re = new RegExp(`name:\\s*'${name}'[\\s\\S]*?handler:\\s*async[\\s\\S]*?\\n\\s{4,6}\\},?\\n`);
  const block = src.match(re);
  if (!block) {
    fail(`Could not locate ${name} handler`);
    continue;
  }
  // Either it routes through loadSwarmllmWasm (auto-init path) OR it uses
  // a previously created instance (sonaInstances / hnswRouters) where the
  // create handler already did the init.
  const usesAutoInit = /await\s+loadSwarmllmWasm\(\)/.test(block[0]);
  const usesInstanceLookup = /(?:sonaInstances|hnswRouters|loraInstances)\.get/.test(block[0]);
  if (!usesAutoInit && !usesInstanceLookup) {
    fail(`${name} bypasses loadSwarmllmWasm() AND has no instance lookup — #2086 regression`);
  } else {
    pass(`${name} ${usesAutoInit ? 'auto-inits via loadSwarmllmWasm()' : 'uses prior instance from create handler'}`);
  }
}

// Check 5: swarmllm_generate_config is the only tool that legitimately
// doesn't touch the runtime (it just composes a config object). Verify
// we haven't added a new tool that bypasses loadSwarmllmWasm by accident.
const allToolNames = [...src.matchAll(/name:\s*'(swarmllm_[a-z_]+)'/g)].map((m) => m[1]);
const expectedUnique = new Set([...wasmTouchingTools, 'swarmllm_status', 'swarmllm_generate_config']);
const unexpected = allToolNames.filter((n) => !expectedUnique.has(n));
if (unexpected.length > 0) {
  fail(
    `New swarmllm_* tools found that this smoke does not classify: ${unexpected.join(', ')}. ` +
      `If they touch WASM, ensure they call loadSwarmllmWasm(); then add them to this smoke.`,
  );
} else {
  pass(`Tool surface = expected ${allToolNames.length} (${[...allToolNames].sort().join(', ')})`);
}

if (process.exitCode) {
  console.error('\n#2086 regression smoke FAILED');
} else {
  console.log('\n#2086 regression smoke PASS');
}
