// _harness.mjs — shared invocation helper for the metaharness/harness CLIs.
//
// All rufflo-metaharness skills shell out to the upstream CLI rather than
// linking the library — this honors ADR-150's architectural constraint
// (MetaHarness must remain a removable augmentation, never a required
// runtime dep) while still giving us "deep integration" through a single
// vetted bridge that every skill imports from.
//
// CONTRACT
//   - `runMetaharness(args, opts)` — invoke `npx metaharness <args>`
//   - `runHarness(args, opts)`     — invoke `npx -p metaharness harness <args>`
//   - both return `{ stdout, stderr, exitCode, json|null, durationMs }`
//   - `--json` flag is appended automatically when `opts.json !== false`
//   - subprocess hard timeout (default 60s) — captured in opts.timeoutMs
//   - on MODULE_NOT_FOUND or "not installed", returns degraded result with
//     `degraded: true, reason: 'metaharness-not-available'` — never throws
//     (ADR-150 graceful-degradation rule #3)

import { spawnSync, spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * iter 56 — async variant of execCli. Used by oia-audit.mjs to parallelize
 * its 5 subprocess calls, dropping worst-case wall-clock from 5×TIMEOUT
 * (sequential) to 1×TIMEOUT (parallel). Identical return shape to the
 * sync execCli so callers can swap without ceremony.
 */
function execCliAsync(npxArgs, opts = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const wantJson = opts.json !== false;
    const argv = wantJson && !npxArgs.includes('--json') ? [...npxArgs, '--json'] : [...npxArgs];
    const p = spawn('npx', argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      shell: process.platform === 'win32',
    });
    let stdout = '', stderr = '';
    p.stdout?.on('data', (d) => { stdout += d.toString(); });
    p.stderr?.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { p.kill('SIGTERM'); } catch { /* ignore */ }
    }, timeoutMs);
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        stdout, stderr: stderr + String(e?.message ?? e),
        exitCode: 127, json: null, durationMs: Date.now() - start,
        degraded: true, reason: 'metaharness-not-available',
      });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      if (code === null || /could not determine executable|404|not installed|MODULE_NOT_FOUND|ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT/i.test(stderr)) {
        resolve({
          stdout, stderr,
          exitCode: code ?? 127, json: null, durationMs,
          degraded: true, reason: 'metaharness-not-available',
        });
        return;
      }
      let json = null;
      if (wantJson) {
        const m = /\{[\s\S]*\}/.exec(stdout);
        if (m) { try { json = JSON.parse(m[0]); } catch { /* leave null */ } }
      }
      resolve({ stdout, stderr, exitCode: code ?? 0, json, durationMs, degraded: false });
    });
  });
}

export function runMetaharnessAsync(args, opts) {
  return execCliAsync(['-y', 'metaharness@latest', ...args], opts);
}

export function runHarnessAsync(args, opts) {
  return execCliAsync(['-y', '-p', 'metaharness@latest', 'harness', ...args], opts);
}

// ITER 27 — npx invocation hardening.
// The pre-iter-27 implementation passed `'-y metaharness@latest'` as a
// SINGLE argv element to npx (`spawnSync('npx', [bin, ...argv])` where
// bin contained two whitespace-separated tokens). spawnSync with
// shell:false does no word-splitting, so npx received a literal string
// with an embedded space and either failed silently or treated the
// whole thing as a package name. The graceful-degradation path then
// reported `degraded: true` for every skill — masking the bug. Every
// argv token must now be its own array element.
function execCli(npxArgs, opts = {}) {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wantJson = opts.json !== false;
  const argv = wantJson && !npxArgs.includes('--json') ? [...npxArgs, '--json'] : [...npxArgs];
  const r = spawnSync('npx', argv, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: timeoutMs,
    cwd: opts.cwd,  // iter 27 — let callers redirect $CWD (mint.mjs needs this)
    env: { ...process.env, ...(opts.env || {}) },
    shell: process.platform === 'win32',
  });
  const durationMs = Date.now() - start;
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  // Graceful degradation — npx couldn't find the binary.
  if (r.status === null || /could not determine executable|404|not installed|MODULE_NOT_FOUND|ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT/i.test(stderr)) {
    return {
      stdout, stderr,
      exitCode: r.status ?? 127,
      json: null,
      durationMs,
      degraded: true,
      reason: 'metaharness-not-available',
    };
  }
  let json = null;
  if (wantJson) {
    const m = /\{[\s\S]*\}/.exec(stdout);
    if (m) { try { json = JSON.parse(m[0]); } catch { /* leave null */ } }
  }
  return { stdout, stderr, exitCode: r.status ?? 0, json, durationMs, degraded: false };
}

export function runMetaharness(args, opts) {
  // iter 27 — explicit argv tokens (was: '-y metaharness@latest' as one
  // string, which silently degraded every skill).
  return execCli(['-y', 'metaharness@latest', ...args], opts);
}

export function runHarness(args, opts) {
  // The `harness` binary ships inside the `metaharness` package, so we
  // need `npx -p metaharness@latest harness <args>`. spawnSync receives
  // a single argv array, so encode the `-p` flag as its own argument.
  const start = Date.now();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wantJson = opts?.json !== false;
  const argv = wantJson && !args.includes('--json') ? [...args, '--json'] : [...args];
  const r = spawnSync('npx', ['-y', '-p', 'metaharness@latest', 'harness', ...argv], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: timeoutMs,
    cwd: opts?.cwd,  // iter 27 — same cwd-redirect support as runMetaharness
    env: { ...process.env, ...(opts?.env || {}) },
    shell: process.platform === 'win32',
  });
  const durationMs = Date.now() - start;
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  if (r.status === null || /could not determine executable|404|not installed|MODULE_NOT_FOUND|ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT/i.test(stderr)) {
    return {
      stdout, stderr,
      exitCode: r.status ?? 127,
      json: null,
      durationMs,
      degraded: true,
      reason: 'metaharness-not-available',
    };
  }
  let json = null;
  if (wantJson) {
    const m = /\{[\s\S]*\}/.exec(stdout);
    if (m) { try { json = JSON.parse(m[0]); } catch { /* leave null */ } }
  }
  return { stdout, stderr, exitCode: r.status ?? 0, json, durationMs, degraded: false };
}

/**
 * iter 63 — single source of truth for severity ranks across the
 * metaharness plugin family. Pre-iter-63, three scripts (oia-audit,
 * audit-trend, mcp-scan) maintained their own SEVERITY_RANK literal,
 * each missing different keys, each producing different NaN-compare
 * behavior on unknown severities. Iter 62 fixed oia-audit; iter 63
 * propagates the fix and consolidates.
 *
 * Mapping rationale:
 *   clean / info     → 0  (no harm)
 *   low              → 1
 *   medium / warn    → 2
 *   high / error     → 3
 *   critical         → 4  (explicit elevation above high)
 *
 * `rankSeverity(s)` is the safe accessor — returns 0 for any unknown
 * string instead of `undefined`, eliminating the NaN-compare hazard
 * (`undefined > 3` evaluates to false → unknown severities silently
 * ignored in reduce expressions).
 */
export const SEVERITY_RANK = Object.freeze({
  clean: 0, info: 0,
  low: 1,
  medium: 2, warn: 2,
  high: 3, error: 3,
  critical: 4,
});

export function rankSeverity(s) {
  if (s == null) return 0;
  return SEVERITY_RANK[String(s).toLowerCase()] ?? 0;
}

/**
 * iter 50 — parse `harness mcp-scan` text output into structured findings.
 *
 * Upstream `harness mcp-scan` emits plain text even with --json:
 *
 *     harness mcp-scan — <path>
 *
 *       [INFO] No MCP security issues found
 *              Policy is default-deny with safe capability grants and an audit log.
 *
 *     Result: INFO (1 finding, 0 high)
 *
 * Closes the iter-49-flagged gap where audit-trend.mjs reads
 * `json.findings` expecting an array, but mcp-scan's r.json was null.
 * Used by BOTH mcp-scan.mjs (the wrapper) and oia-audit.mjs (composite
 * audit) so the structured-findings invariant holds across the pipeline.
 */
export function parseMcpScanText(stdout) {
  const findings = [];
  const lines = (stdout || '').split('\n');
  let current = null;
  for (const line of lines) {
    const m = /^\s*\[([A-Z]+)\]\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) findings.push(current);
      current = { severity: m[1].toLowerCase(), message: m[2] };
    } else if (current && /^\s{6,}\S/.test(line)) {
      const cont = line.trim();
      if (cont) current.message += ' ' + cont;
    } else if (current && line.trim() === '') {
      findings.push(current);
      current = null;
    }
  }
  if (current) findings.push(current);
  const resultMatch = /Result:\s+([A-Z]+)\s+\((\d+)\s+finding/i.exec(stdout);
  const summary = resultMatch ? {
    overallSeverity: resultMatch[1].toLowerCase(),
    totalCount: parseInt(resultMatch[2], 10),
  } : null;
  return { findings, summary };
}

// Convenience emitters for skill scripts — keep the boilerplate out of
// each skill so they focus on argument parsing + exit-code semantics.
export function emitDegradedJsonAndExit(reason) {
  const payload = {
    degraded: true,
    reason,
    hint: 'Install metaharness manually with `npm i -D metaharness` or run `npx metaharness@latest --version` to verify network access.',
    generatedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(payload, null, 2));
  // Exit 0 — ADR-150 architectural constraint says rufflo continues to
  // function when MetaHarness is absent. Skills emit a structured
  // degraded payload rather than failing.
  process.exit(0);
}
