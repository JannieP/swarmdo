#!/usr/bin/env node
// test-pipeline-roundtrip.mjs — end-to-end test of the ADR-152 §3.1
// cross-pipeline integration shipped iters 36→46.
//
// THE GAP THIS CLOSES
//   Every prior iter test exercised ONE surface in isolation:
//     iter 35: spike — synthetic LEGAL/SUPPORT/DEVOPS fixtures
//     iter 37: MCP runtime test — fake mem keys
//     iter 38: audit-trend — hand-written audit JSON
//     iter 39: unit tests — pure-function arithmetic
//     iter 41: bench — synthetic payloads
//     iter 43: Phase 4 — file-path fixtures
//     iter 46: audit_trend file inputs — same fixtures
//
//   None of these proved the FULL chain works end-to-end with no
//   synthetic data. This test does.
//
// THE PIPELINE BEING TESTED
//   1. oia-audit --dry-run --path .         (real run against ruflo)
//   2. The audit record's fingerprint{score,genome}
//   3. audit-trend --baseline {same-record} --current {same-record}
//   4. delta.structuralDistance.verdict === 'near-identical'
//   5. delta.structuralDistance.overall === 1
//
// USAGE
//   node scripts/test-pipeline-roundtrip.mjs
//   node scripts/test-pipeline-roundtrip.mjs --format json
//
// EXIT CODES
//   0  full chain works
//   1  some assertion failed
//   2  oia-audit degraded (upstream metaharness absent — test cannot run)
//
// ADR-150 ARCHITECTURAL CONSTRAINT BEHAVIOR
//   If oia-audit returns {degraded:true} (no upstream metaharness), the
//   test exits 2 with a clear message — this is the "test cannot run"
//   case, NOT a "test failed" case. CI infrastructure can distinguish.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(dirname(SCRIPTS_DIR))); // up out of plugins/ruflo-metaharness/scripts

const ARGS = (() => {
  const a = { format: 'table' };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--format') a.format = process.argv[++i];
  }
  return a;
})();

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}`); failures.push(label); failed++; }
}

function runNode(scriptName, args, timeoutMs = 60_000) {
  const p = spawnSync('node', [join(SCRIPTS_DIR, scriptName), ...args], {
    encoding: 'utf-8',
    timeout: timeoutMs,
    cwd: REPO_ROOT,
  });
  return { stdout: p.stdout || '', stderr: p.stderr || '', status: p.status ?? -1 };
}

// ──────────────────────────────────────────────────────────────────
console.log(`# test-pipeline-roundtrip — ADR-152 §3.1 end-to-end (iter 47)\n`);

const tmp = mkdtempSync(join(tmpdir(), 'pipeline-roundtrip-'));

try {
  // ──────────────────────────────────────────────────────────────
  // STAGE 1: oia-audit --dry-run against ruflo repo itself
  // ──────────────────────────────────────────────────────────────
  console.log('Stage 1 — oia-audit --dry-run against ruflo repo');
  const auditRun = runNode('oia-audit.mjs', ['--path', REPO_ROOT, '--dry-run', '--format', 'json'], 90_000);

  // Extract the JSON object from stdout (script may emit some prelude)
  const auditMatch = /\{[\s\S]*\}/.exec(auditRun.stdout);
  if (!auditMatch) {
    console.log(`  ✗ oia-audit produced no JSON; stderr:\n${auditRun.stderr.slice(0, 500)}`);
    process.exit(1);
  }
  const audit = JSON.parse(auditMatch[0]);

  // If oia-audit reports degraded (no upstream metaharness installed), skip
  // — this test cannot run without real score/genome output.
  if (audit.degraded === true) {
    console.log(`  ⊘ oia-audit reports degraded — upstream metaharness absent`);
    console.log(`     This test exercises real metaharness output; cannot run.`);
    console.log(`     reason: ${audit.reason}`);
    process.exit(2);
  }

  assert(typeof audit === 'object' && audit !== null,
    'oia-audit produced a JSON object');
  assert(typeof audit.composite === 'object',
    'oia-audit has composite worst-severity');
  assert(typeof audit.components === 'object',
    'oia-audit has components bundle');

  // iter 38 — fingerprint must be present
  assert(typeof audit.fingerprint === 'object' && audit.fingerprint !== null,
    'oia-audit emits fingerprint field (iter 38)');
  if (!audit.fingerprint?.score || !audit.fingerprint?.genome) {
    console.log(`  ⊘ fingerprint partial; score+genome may have degraded individually`);
    console.log(`     fingerprint: ${JSON.stringify(audit.fingerprint).slice(0, 200)}`);
    process.exit(2);
  }
  assert(typeof audit.fingerprint.score?.harnessFit === 'number',
    'fingerprint.score has harnessFit');
  assert(Array.isArray(audit.fingerprint.genome?.agent_topology),
    'fingerprint.genome has agent_topology array');

  // ──────────────────────────────────────────────────────────────
  // STAGE 2: persist the audit record as both baseline and current
  // ──────────────────────────────────────────────────────────────
  console.log('\nStage 2 — write audit record to baseline + current paths');
  const basePath = join(tmp, 'baseline.json');
  const currPath = join(tmp, 'current.json');
  writeFileSync(basePath, JSON.stringify(audit));
  writeFileSync(currPath, JSON.stringify(audit));
  assert(readFileSync(basePath, 'utf-8').length > 100, 'baseline file written');
  assert(readFileSync(currPath, 'utf-8').length > 100, 'current file written');

  // ──────────────────────────────────────────────────────────────
  // STAGE 3: audit-trend reading the same audit twice
  // ──────────────────────────────────────────────────────────────
  console.log('\nStage 3 — audit-trend against self (must report near-identical)');
  const trendRun = runNode('audit-trend.mjs', [
    '--baseline', basePath,
    '--current', currPath,
    '--format', 'json',
  ]);

  const trendMatch = /\{[\s\S]*\}/.exec(trendRun.stdout);
  assert(trendMatch !== null, 'audit-trend produced JSON');
  const trend = JSON.parse(trendMatch[0]);

  assert(typeof trend.delta?.structuralDistance === 'object',
    'trend exposes delta.structuralDistance');
  const sd = trend.delta.structuralDistance;
  assert(sd.verdict === 'near-identical',
    `self-roundtrip verdict === near-identical (got ${sd.verdict})`);
  assert(sd.overall === 1,
    `self-roundtrip overall === 1 (got ${sd.overall})`);
  assert(sd.distance === 0,
    `self-roundtrip distance === 0 (got ${sd.distance})`);

  // ──────────────────────────────────────────────────────────────
  // STAGE 4: alert-on-distance-below should NOT trigger on self-match
  // ──────────────────────────────────────────────────────────────
  console.log('\nStage 4 — distance alert does not trigger on self-match');
  const noAlertRun = runNode('audit-trend.mjs', [
    '--baseline', basePath,
    '--current', currPath,
    '--alert-on-distance-below', '0.5',
    '--format', 'json',
  ]);
  assert(noAlertRun.status === 0,
    `alert at threshold 0.5 does NOT fire on self-match (exit 0, got ${noAlertRun.status})`);

  // Now flip: any threshold above 1 must trigger
  console.log('\nStage 5 — distance alert triggers when threshold > self-match');
  const alertRun = runNode('audit-trend.mjs', [
    '--baseline', basePath,
    '--current', currPath,
    '--alert-on-distance-below', '1.01',
    '--format', 'json',
  ]);
  assert(alertRun.status === 1,
    `alert at threshold 1.01 fires on self-match (exit 1, got ${alertRun.status})`);

} finally {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────────
const summary = { passed, failed, total: passed + failed, failures };

console.log(`\n${passed} passed, ${failed} failed`);
if (ARGS.format === 'json') console.log(JSON.stringify(summary, null, 2));
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\n✓ Full ADR-152 §3.1 pipeline works end-to-end with real metaharness output.');
