#!/usr/bin/env node
// oia-audit.mjs — composite Phase-2 worker (ADR-150).
//
// Bundles three MetaHarness static-analysis surfaces into one timestamped
// audit record:
//   - harness oia-manifest   (Open Infrastructure Architecture L1-L9 alignment)
//   - harness threat-model   (categorized MCP-surface threat report)
//   - harness mcp-scan       (per-server/tool policy + permissions + deps)
//
// The combined record is stored in the `metaharness-audit` memory
// namespace, keyed by ISO timestamp. Designed to be invoked on a cron
// schedule (e.g. weekly) so audit drift is visible over time.
//
// USAGE
//   node scripts/oia-audit.mjs                      # run + store
//   node scripts/oia-audit.mjs --path <dir>         # audit specific dir
//   node scripts/oia-audit.mjs --dry-run            # don't write to memory
//   node scripts/oia-audit.mjs --alert-on-worst high
//                                                  # exit 1 if threat-model worst >= high
//   node scripts/oia-audit.mjs --format json
//
// EXIT CODES
//   0  audit OK (or degraded)
//   1  --alert-on-worst threshold exceeded
//   2  config error or audit failure

import { spawnSync } from 'node:child_process';
import { runHarness, emitDegradedJsonAndExit } from './_harness.mjs';

const SEVERITY_RANK = { clean: 0, low: 1, medium: 2, high: 3 };
const NS = process.env.OIA_AUDIT_NAMESPACE || 'metaharness-audit';
const CLI_PKG = process.env.CLI_CORE === '1'
  ? '@claude-flow/cli-core@alpha'
  : '@claude-flow/cli@latest';

const ARGS = (() => {
  const a = { path: '.', format: 'json', dryRun: false, alertWorst: null };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === '--path') a.path = process.argv[++i];
    else if (v === '--dry-run') a.dryRun = true;
    else if (v === '--alert-on-worst') a.alertWorst = String(process.argv[++i] || '').toLowerCase();
    else if (v === '--format') a.format = process.argv[++i];
  }
  return a;
})();

function runOne(args, label) {
  const r = runHarness(args);
  return {
    label,
    exitCode: r.exitCode,
    degraded: r.degraded,
    reason: r.degraded ? r.reason : null,
    json: r.json,
    durationMs: r.durationMs,
    stderrTail: r.degraded ? (r.stderr || '').slice(-200) : null,
  };
}

function persist(payload) {
  const key = `audit-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const r = spawnSync('npx', [
    CLI_PKG, 'memory', 'store',
    '--namespace', NS,
    '--key', key,
    '--value', JSON.stringify(payload),
  ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', shell: process.platform === 'win32' });
  return {
    ok: r.status === 0,
    namespace: NS,
    key,
    error: r.status === 0 ? null : (r.stderr || '').slice(0, 200),
  };
}

function main() {
  if (ARGS.alertWorst !== null && !SEVERITY_RANK.hasOwnProperty(ARGS.alertWorst)) {
    console.error(`oia-audit: --alert-on-worst must be one of clean|low|medium|high; got ${ARGS.alertWorst}`);
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const oia = runOne(['oia-manifest', ARGS.path], 'oia-manifest');
  const tm = runOne(['threat-model', ARGS.path], 'threat-model');
  const mcp = runOne(['mcp-scan', ARGS.path], 'mcp-scan');

  // If all three say "metaharness not available", surface the degraded
  // payload exactly once and exit 0 (architectural constraint #3).
  if (oia.degraded && tm.degraded && mcp.degraded) {
    emitDegradedJsonAndExit('metaharness-not-available');
    return;
  }

  // Aggregate the worst-severity signal across mcp-scan + threat-model.
  const tmWorst = String(tm.json?.worst || 'clean').toLowerCase();
  const mcpFindings = Array.isArray(mcp.json?.findings) ? mcp.json.findings : [];
  const mcpWorst = mcpFindings.reduce((acc, f) => {
    const s = String(f.severity || 'low').toLowerCase();
    return SEVERITY_RANK[s] > SEVERITY_RANK[acc] ? s : acc;
  }, 'clean');
  const compositeWorst = SEVERITY_RANK[tmWorst] > SEVERITY_RANK[mcpWorst] ? tmWorst : mcpWorst;

  let alertTriggered = false;
  let alertReason = null;
  if (ARGS.alertWorst !== null) {
    const threshold = SEVERITY_RANK[ARGS.alertWorst];
    if (SEVERITY_RANK[compositeWorst] >= threshold && threshold > 0) {
      alertTriggered = true;
      alertReason = `composite worst=${compositeWorst} ≥ ${ARGS.alertWorst}`;
    }
  }

  const payload = {
    path: ARGS.path,
    startedAt,
    finishedAt: new Date().toISOString(),
    composite: { worst: compositeWorst, threatModelWorst: tmWorst, mcpScanWorst: mcpWorst },
    components: { oiaManifest: oia, threatModel: tm, mcpScan: mcp },
    alert: ARGS.alertWorst !== null ? {
      threshold: ARGS.alertWorst,
      triggered: alertTriggered,
      reason: alertReason || `composite worst=${compositeWorst} < ${ARGS.alertWorst} — OK`,
    } : null,
    persisted: null,
  };

  if (!ARGS.dryRun) {
    payload.persisted = persist(payload);
  }

  if (ARGS.format === 'json') {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`# oia-audit — ${ARGS.path}`);
    console.log('');
    console.log(`| Component | Exit | Degraded | Duration |`);
    console.log(`|---|---:|:---:|---:|`);
    console.log(`| oia-manifest | ${oia.exitCode} | ${oia.degraded ? '⚠' : '✓'} | ${oia.durationMs}ms |`);
    console.log(`| threat-model | ${tm.exitCode} | ${tm.degraded ? '⚠' : '✓'} | ${tm.durationMs}ms |`);
    console.log(`| mcp-scan | ${mcp.exitCode} | ${mcp.degraded ? '⚠' : '✓'} | ${mcp.durationMs}ms |`);
    console.log('');
    console.log(`Composite worst severity: **${compositeWorst}** (tm=${tmWorst}, mcp=${mcpWorst})`);
    if (payload.persisted) {
      console.log(`Persisted: ${payload.persisted.ok ? `${payload.persisted.namespace}:${payload.persisted.key}` : `FAILED: ${payload.persisted.error}`}`);
    }
    if (payload.alert) {
      console.log('');
      console.log(payload.alert.triggered ? `⚠ **ALERT**: ${payload.alert.reason}` : `✓ ${payload.alert.reason}`);
    }
  }

  if (alertTriggered) process.exit(1);
}

main();
