#!/usr/bin/env node
/**
 * Smoke test for upstream/swarmdo#2132 — swarmdo-hook.cjs cross-platform shim.
 *
 * Verifies that plugins/swarmdo-core/scripts/swarmdo-hook.cjs:
 *   1. Can be invoked via `node swarmdo-hook.cjs <subcommand>`
 *   2. Always exits 0 (even when swarmdo binary is not installed)
 *   3. Accepts stdin JSON input without crashing
 *   4. Works with all the common hook subcommands
 *
 * Runs on: ubuntu-latest, macos-latest, windows-latest (CI matrix)
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SHIM_PATH = resolve(REPO_ROOT, 'plugins', 'swarmdo-core', 'scripts', 'swarmdo-hook.cjs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  pass: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function runShim(subcommand, extraArgs = [], stdinInput = '') {
  return spawnSync(
    process.execPath,
    [SHIM_PATH, subcommand, ...extraArgs],
    {
      input: stdinInput,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
      // Skip the npx fallback — we're testing the shim's control flow, not the
      // CLI dispatch. npx --prefer-offline can take 30+s on a cold CI runner
      // (no warm cache, registry resolve), which exceeds our timeout above.
      // The CLI dispatch path is covered by the agent-execute smoke separately.
      env: { ...process.env, SWARMDO_HOOK_SKIP_NPX: '1' },
    }
  );
}

console.log(`Testing swarmdo-hook.cjs on ${process.platform}`);
console.log(`Shim path: ${SHIM_PATH}\n`);

// Test 1: No arguments → exit 0
{
  const r = spawnSync(process.execPath, [SHIM_PATH], {
    encoding: 'utf8', stdio: 'pipe', timeout: 10_000,
  });
  assert(r.status === 0, 'No-arg invocation exits 0');
}

// Test 2: post-edit subcommand with stdin JSON
{
  const stdin = JSON.stringify({ tool_input: { file_path: 'test.ts' } });
  const r = runShim('post-edit', ['--file', 'test.ts'], stdin);
  assert(r.status === 0, 'post-edit subcommand exits 0');
  assert(!r.stderr.includes('cannot execute'), 'No "cannot execute binary file" error');
}

// Test 3: post-command subcommand
{
  const stdin = JSON.stringify({ tool_input: { command: 'echo hello' }, tool_response: { exit_code: 0 } });
  const r = runShim('post-command', ['--command', 'echo hello'], stdin);
  assert(r.status === 0, 'post-command subcommand exits 0');
}

// Test 4: session-end subcommand
{
  const r = runShim('session-end', ['--generate-summary', 'true'], '{}');
  assert(r.status === 0, 'session-end subcommand exits 0');
}

// Test 5: pre-edit subcommand
{
  const stdin = JSON.stringify({ tool_input: { file_path: 'src/index.ts' } });
  const r = runShim('pre-edit', ['--file', 'src/index.ts'], stdin);
  assert(r.status === 0, 'pre-edit subcommand exits 0');
}

// Test 6: route subcommand
{
  const r = runShim('route', ['--task', 'implement feature'], '{}');
  assert(r.status === 0, 'route subcommand exits 0');
}

// Test 7: Invalid JSON stdin → still exits 0 (graceful degradation)
{
  const r = runShim('post-edit', ['--file', 'x.ts'], 'not-valid-json');
  assert(r.status === 0, 'Invalid stdin JSON does not crash (exits 0)');
}

// Test 8: Empty stdin → still exits 0
{
  const r = runShim('post-edit', ['--file', 'x.ts'], '');
  assert(r.status === 0, 'Empty stdin does not crash (exits 0)');
}

// Test 9: Verify shim spawns without "Error:" prefix on stderr (internal errors swallowed)
{
  const r = runShim('post-edit', ['--file', 'nonexistent.ts'], '{}');
  assert(r.status === 0, 'Non-existent file arg still exits 0');
  // stderr may contain npx fallback output — but must not be a Node.js Error
  const hasNodeError = r.stderr && /^Error:/m.test(r.stderr);
  assert(!hasNodeError, 'No unhandled Node.js error on stderr');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log('ok: smoke-swarmdo-hook-cjs passed');
