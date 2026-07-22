/**
 * MetaHarness MCP Tools — ADR-150 Phase-2 deep-integration surface.
 *
 * Exposes the static-analysis MetaHarness CLIs as first-class MCP tools
 * so Claude Code agents can call them programmatically without shelling
 * out themselves. Five tools, all read-only / subprocess-isolated:
 *
 *   - metaharness_score          5-dim readiness scorecard
 *   - metaharness_genome         7-section categorical report
 *   - metaharness_mcp_scan       static MCP security findings
 *   - metaharness_threat_model   enterprise-grade threat model
 *   - metaharness_oia_audit      composite audit (score + threat + mcp) → memory
 *
 * ADR-153 Darwin Mode integration adds three additional tools that target
 * the separate `@metaharness/darwin` npm package (not the umbrella):
 *
 *   - metaharness_evolve         mutate harness policy surfaces, sandbox-score, promote
 *   - metaharness_security_bench upstream's "Darwin Shield" (their own ADR-155)
 *   - metaharness_bench          create/verify bench suites used by evolve --bench
 *
 * Every tool resolves the corresponding plugin script
 * (`plugins/swarmdo-metaharness/scripts/<X>.mjs`) via the same locator
 * the commands/metaharness.ts dispatcher uses, then spawns it with
 * `--format json` and parses the response.
 *
 * ADR-150 ARCHITECTURAL CONSTRAINT
 * --------------------------------
 * This file has ZERO static `@metaharness/*` imports. All metaharness
 * invocation stays in the plugin scripts behind the `_harness.mjs`
 * subprocess bridge. When the plugin scripts aren't reachable at
 * runtime, each tool returns a structured `{ degraded: true }` payload
 * — never throws.
 *
 * @module @swarmdo/cli/mcp-tools/metaharness
 */

import type { MCPTool, getProjectCwd as _ } from './types.js';
import { getProjectCwd } from './types.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from this module to find plugins/swarmdo-metaharness/scripts/.
 * Handles three install layouts (mirrors commands/metaharness.ts).
 */
function locatePluginScripts(): string | null {
  const candidates: string[] = [];
  let p = resolve(__dirname);
  for (let i = 0; i < 8; i++) {
    candidates.push(join(p, 'plugins', 'swarmdo-metaharness', 'scripts'));
    candidates.push(join(p, '..', 'plugins', 'swarmdo-metaharness', 'scripts'));
    p = dirname(p);
  }
  const cwd = getProjectCwd();
  candidates.push(join(cwd, 'plugins', 'swarmdo-metaharness', 'scripts'));
  candidates.push(join(cwd, 'node_modules', '@swarmdo', 'cli', 'plugins', 'swarmdo-metaharness', 'scripts'));
  for (const c of candidates) {
    if (existsSync(join(c, '_harness.mjs'))) return c;
  }
  return null;
}

/**
 * Result of running a metaharness plugin script.
 *
 * SUCCESS SEMANTICS (iter 44 — fix for iter-43-flagged bug)
 * `success` is computed from the canonical signal: exitCode === 0.
 *
 * Three observable cases:
 *   1. exitCode 0 + valid JSON          → success: true, degraded: false
 *      (happy path; data is the script's JSON output)
 *
 *   2. exitCode 0 + degraded payload    → success: true, degraded: true
 *      (ADR-150 constraint #3 — upstream `@metaharness/*` absent, script
 *      emits `{degraded:true, reason:"metaharness-not-available"}` and
 *      exits 0 so swarmdo stays operational. `success: true` because the
 *      script DID run as designed; the agent reads `degraded: true` to
 *      know the dep was missing.)
 *
 *   3. exitCode != 0                    → success: false
 *      Two sub-cases:
 *        a. exitCode 1 with alert.triggered JSON  → intentional alert
 *           failure (e.g. --alert-on-fit-below 70). Agents read
 *           `data.alert.triggered` for the reason.
 *        b. exitCode 2 with stderr-only           → user error (bad arg).
 *           `data` is null because no JSON was on stdout.
 *
 * BEFORE iter 44 `success` was computed as `!degraded`, which collapsed
 * case 3b into success: true / exitCode: 2 — contradictory.
 */
function runScript(scriptName: string, args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  json: unknown;
  degraded: boolean;
  success: boolean;
}> {
  return new Promise((resolve) => {
    const dir = locatePluginScripts();
    if (!dir) {
      resolve({
        exitCode: 0, stdout: '', json: { degraded: true, reason: 'plugin-not-found' },
        degraded: true, success: true,  // plugin absent → equivalent to case 2
      });
      return;
    }
    const scriptPath = join(dir, scriptName);
    const argv = [...args];
    if (!argv.includes('--format')) argv.push('--format', 'json');
    const p = spawn('node', [scriptPath, ...argv], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    p.stdout?.on('data', (d) => { stdout += d.toString(); });
    p.stderr?.on('data', () => { /* swallow — graceful */ });
    const timer = setTimeout(() => { try { p.kill('SIGTERM'); } catch { /* ignore */ } }, 120_000);
    p.on('close', (code) => {
      clearTimeout(timer);
      let json: unknown = null;
      const m = /\{[\s\S]*\}/.exec(stdout);
      if (m) { try { json = JSON.parse(m[0]); } catch { /* leave null */ } }
      const looksDegraded = !!(json && typeof json === 'object' && (json as { degraded?: unknown }).degraded === true);
      const exitCode = code ?? 0;
      // iter 44 — success now reflects exit code, not the degraded marker.
      // exit 0 = script ran as designed (whether the result was happy
      // data or a graceful-degradation payload). exit != 0 = something
      // went wrong (intentional alert OR user/system error).
      const success = exitCode === 0;
      resolve({ exitCode, stdout, json, degraded: looksDegraded, success });
    });
    p.on('error', () => {
      clearTimeout(timer);
      resolve({
        exitCode: 127, stdout, json: { degraded: true, reason: 'spawn-failed' },
        degraded: true, success: false,
      });
    });
  });
}

/**
 * iter 46 — success-semantic footnote appended to every tool description
 * so agents reading the registry know how to interpret the return shape.
 * Reflects the iter-44 fix: `success` derives from exitCode, not from the
 * degraded marker. Three observable cases an agent can branch on.
 */
const MCP_SUCCESS_SEMANTIC =
  '[Return shape: {success, data, degraded, exitCode}. success===true iff exitCode===0 ' +
  '(includes graceful-degradation path where dep is absent — check degraded for that). ' +
  'success===false with exitCode===1 = intentional alert exit (read data.alert.triggered). ' +
  'success===false with exitCode===2 = input error (data is null).]';

export const metaharnessTools: MCPTool[] = [
  {
    name: 'metaharness_score',
    description: 'ADR-150 — 5-dimension readiness scorecard (harnessFit / compileConfidence / taskCoverage / toolSafety / memoryUsefulness + estCostPerRunUsd) via `metaharness score <path>`. Use before recommending `swarmdo metaharness mint`; its cost-per-run and MCP-surface signals aren\'t obvious from source. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path to score (default: cwd)', default: '.' },
        alertOnFitBelow: { type: 'number', description: 'Set to make the tool flag harnessFit < N (informational only; tool result has alert.triggered field)' },
      },
    },
    handler: async (input) => {
      const path = (input.path as string) || '.';
      const args = ['--path', path];
      if (input.alertOnFitBelow !== undefined) args.push('--alert-on-fit-below', String(input.alertOnFitBelow));
      const r = await runScript('score.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_genome',
    description: 'ADR-150 — 7-section categorical readiness report (repo_type / agent_topology / risk_score / mcp_surface / test_confidence / publish_readiness) via `metaharness genome <path>`. Pair with metaharness_score — same harnessFit can hide different agent_topology and mcp_surface. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path to analyze (default: cwd)', default: '.' },
        alertOnRiskAbove: { type: 'number', description: 'Set to flag risk_score > N' },
      },
    },
    handler: async (input) => {
      const path = (input.path as string) || '.';
      const args = ['--path', path];
      if (input.alertOnRiskAbove !== undefined) args.push('--alert-on-risk-above', String(input.alertOnRiskAbove));
      const r = await runScript('genome.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_mcp_scan',
    description: 'ADR-150 — static security scan of `.mcp/servers.json` + `.harness/claims.json` via `harness mcp-scan <path>`. Run before exposing a new MCP server config; eyeballing the JSON misses policy regressions like capability grants and audit gaps. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path with .mcp/servers.json (default: cwd)', default: '.' },
        failOn: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Severity floor for tool.alert.triggered (default: high)', default: 'high' },
      },
    },
    handler: async (input) => {
      const path = (input.path as string) || '.';
      const failOn = (input.failOn as string) || 'high';
      const r = await runScript('mcp-scan.mjs', ['--path', path, '--fail-on', failOn]);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_threat_model',
    description: 'ADR-150 — enterprise-grade threat model via `harness threat-model <path>`: worst-severity verdict (clean/low/medium/high) + categorized findings to share with infosec. A one-line summary won\'t do — reviewers want the per-category breakdown. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path (default: cwd)', default: '.' },
        failOn: { type: 'string', enum: ['clean', 'low', 'medium', 'high'], description: 'Severity floor for tool.alert.triggered (default: high)', default: 'high' },
      },
    },
    handler: async (input) => {
      const path = (input.path as string) || '.';
      const failOn = (input.failOn as string) || 'high';
      const r = await runScript('threat-model.mjs', ['--path', path, '--fail-on', failOn]);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_oia_audit',
    description: 'ADR-150 — weekly audit bundling oia-manifest + threat-model + mcp-scan into one timestamped `metaharness-audit` record (--dry-run skips it). Seeds drift detection (pair with metaharness_drift_from_history); running the 3 separately loses the composite worst-severity rollup. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path (default: cwd)', default: '.' },
        dryRun: { type: 'boolean', description: 'Skip memory persistence — local-only run', default: false },
        alertOnWorst: { type: 'string', enum: ['clean', 'low', 'medium', 'high'], description: 'Composite worst-severity floor for tool.alert.triggered' },
      },
    },
    handler: async (input) => {
      const path = (input.path as string) || '.';
      const args = ['--path', path];
      if (input.dryRun === true) args.push('--dry-run');
      if (input.alertOnWorst !== undefined) args.push('--alert-on-worst', String(input.alertOnWorst));
      const r = await runScript('oia-audit.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_audit_list',
    description: 'ADR-150 — list timestamped records in the `metaharness-audit` memory namespace to find audit keys before running metaharness_audit_trend. Guessing keys fails (sub-second timestamps); pass a returned key to metaharness_audit_trend. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records to return, newest first (default: 20)', default: 20 },
        since: { type: 'string', description: 'Filter to last N(h|d|w|m), e.g. "30d" for last 30 days' },
      },
    },
    handler: async (input) => {
      const args: string[] = [];
      if (input.limit !== undefined) args.push('--limit', String(input.limit));
      if (input.since !== undefined) args.push('--since', String(input.since));
      const r = await runScript('audit-list.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_similarity',
    description: 'ADR-152 §3.1 — weighted similarity of two harness fingerprints (genome + score JSON): overall ∈ [0,1] plus per-component (cosine/categorical/jaccard) breakdown. Use to rank templates, pick fork-vs-scaffold, or feed Recommender/Drift; hand-comparing fields misses the weighted blend. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        aFile: { type: 'string', description: 'Path to harness A genome+score JSON file (mutually exclusive with aKey)' },
        bFile: { type: 'string', description: 'Path to harness B genome+score JSON file (mutually exclusive with bKey)' },
        aKey: { type: 'string', description: 'Memory key for harness A in `metaharness-audit` namespace (mutually exclusive with aFile)' },
        bKey: { type: 'string', description: 'Memory key for harness B in `metaharness-audit` namespace (mutually exclusive with bFile)' },
        perDimension: { type: 'boolean', description: 'Include per-dimension contribution breakdown (used by ADR-151 §3.2 Recommender)', default: false },
        alertBelow: { type: 'number', description: 'Set tool.alert.triggered when overall < N (used by ADR-151 §3.3 Drift Detection)' },
      },
    },
    handler: async (input) => {
      const args: string[] = [];
      if (input.aFile) args.push('--a', String(input.aFile));
      if (input.bFile) args.push('--b', String(input.bFile));
      if (input.aKey) args.push('--a-key', String(input.aKey));
      if (input.bKey) args.push('--b-key', String(input.bKey));
      if (input.perDimension === true) args.push('--per-dimension');
      if (input.alertBelow !== undefined) args.push('--alert-below', String(input.alertBelow));
      const r = await runScript('similarity.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_drift_from_history',
    description: 'iter 53 — one-command drift detection composing audit-list/oia-audit/audit-trend: finds the newest `metaharness-audit` record (or `baselineKey`/`baselineFile`), diffs a fresh audit via §3.1 similarity, alerts below `threshold`. Doing the 3 by hand loses the alert ladder and the fastpath (`baselineKey` ~14x faster, `baselineFile` ~19x faster). ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path to audit (default: cwd)', default: '.' },
        baselineSince: { type: 'string', description: 'Use a baseline at least N(h|d|w) old, e.g. "7d" — skips drift against ultra-recent audits' },
        baselineKey: { type: 'string', description: 'iter 66 — explicit memory key for the baseline audit. Skips audit-list (no ONNX warmup). Get from `metaharness_audit_list` first.' },
        baselineFile: { type: 'string', description: 'iter 67 — file path to a saved oia-audit JSON. Skips audit-list AND memory roundtrip. Ideal for CI artifact pipelines (e.g., comparing this run vs a downloaded prior-run artifact).' },
        threshold: { type: 'number', description: 'Alert when structural similarity < N. Default 0.95.', default: 0.95 },
        alertOnNewSeverity: { type: 'string', enum: ['info', 'low', 'medium', 'warn', 'high', 'error', 'critical'], description: 'iter 78 — ALSO alert when any introduced finding meets or exceeds this severity. Orthogonal to `threshold`: a CRITICAL finding triggers even if structural similarity > threshold.' },
        dryRun: { type: 'boolean', description: 'Skip persisting the fresh audit to memory', default: false },
      },
    },
    handler: async (input) => {
      const args: string[] = [];
      args.push('--path', String(input.path ?? '.'));
      if (input.baselineSince) args.push('--baseline-since', String(input.baselineSince));
      if (input.baselineKey) args.push('--baseline-key', String(input.baselineKey));
      if (input.baselineFile) args.push('--baseline-file', String(input.baselineFile));
      if (input.threshold !== undefined) args.push('--threshold', String(input.threshold));
      if (input.alertOnNewSeverity) args.push('--alert-on-new-severity', String(input.alertOnNewSeverity));
      if (input.dryRun === true) args.push('--dry-run');
      const r = await runScript('drift-from-history.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_audit_trend',
    description: 'ADR-150 — diff two oia-audit records (drift) by memory keys (discover via metaharness_audit_list) or file paths (CI artifacts): worst-severity delta, per-component change, finding deltas, §3.1 structural distance. Eyeballing two JSONs misses the distance verdict (near-identical/minor/moderate/major). ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        baselineKey: { type: 'string', description: 'Memory key for the older audit (mutually exclusive with baselineFile)' },
        currentKey: { type: 'string', description: 'Memory key for the newer audit (mutually exclusive with currentFile)' },
        baselineFile: { type: 'string', description: 'iter 46 — file path to older audit JSON (mutually exclusive with baselineKey)' },
        currentFile: { type: 'string', description: 'iter 46 — file path to newer audit JSON (mutually exclusive with currentKey)' },
        alertOnWorsening: { type: 'boolean', description: 'Set tool.alert.triggered when composite worst severity worsened', default: false },
        alertOnDistanceBelow: { type: 'number', description: 'iter 38 — set tool.alert.triggered when structural similarity falls below N (uses fingerprint field added in iter 38; older records emit verdict=unavailable)' },
      },
      // No required[] — caller picks key OR file inputs. The script
      // emits a graceful degraded payload if neither is supplied.
    },
    handler: async (input) => {
      const args: string[] = [];
      if (input.baselineKey) args.push('--baseline-key', String(input.baselineKey));
      if (input.currentKey) args.push('--current-key', String(input.currentKey));
      if (input.baselineFile) args.push('--baseline', String(input.baselineFile));
      if (input.currentFile) args.push('--current', String(input.currentFile));
      if (input.alertOnWorsening === true) args.push('--alert-on-worsening');
      if (input.alertOnDistanceBelow !== undefined) args.push('--alert-on-distance-below', String(input.alertOnDistanceBelow));
      const r = await runScript('audit-trend.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  // ───────────────────────────────────────────────────────────────────────
  // ADR-153 — @metaharness/darwin integration (3 tools).
  // Backed by the separate `@metaharness/darwin@~0.3.1` npm package, NOT
  // the umbrella `metaharness`. Plugin scripts shell out via _darwin.mjs.
  // Same {success, data, degraded, exitCode} contract.
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'metaharness_evolve',
    description: 'ADR-153 Darwin Mode — mutate one of seven harness policy surfaces, sandbox-score variants, promote only measured wins; the WRITE counterpart to read-only score/genome. Use when scores are flat; hand-tuning loses single-DOF attribution and the safety gate (exit 99). REQUIRES --confirm (else dry-run); long-running. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repo path to evolve (default: cwd)', default: '.' },
        generations: { type: 'number', description: '1..50 (swarmdo cap)', default: 3 },
        children: { type: 'number', description: '1..20 (swarmdo cap) — variants per generation', default: 3 },
        concurrency: { type: 'number', description: '1..8 (swarmdo cap)', default: 2 },
        seed: { type: 'number', description: 'PRNG seed for reproducibility' },
        sandbox: { type: 'string', enum: ['real', 'mock', 'agent'], description: 'real = run npm test; mock = scoring stub; agent = LLM judge', default: 'real' },
        selection: { type: 'string', enum: ['quality-diversity', 'behavioral-diversity', 'niche-steering', 'clade', 'pareto'], description: 'Next-generation sampling strategy from the archive tree' },
        crossover: { type: 'boolean', description: 'Enable crossover (2-parent) mutations alongside the default 1-parent path', default: false },
        epistasis: { type: 'boolean', description: 'Detect epistatic surface interactions before mutating', default: false },
        curriculum: { type: 'boolean', description: 'Schedule increasing-difficulty bench tasks across generations', default: false },
        riskBudget: { type: 'number', description: 'Max number of safety-near-miss variants allowed before halting' },
        fdr: { type: 'number', description: 'Benjamini-Hochberg FDR threshold for accepting variant fitness as significant' },
        tie: { type: 'string', enum: ['faster'], description: 'Tiebreaker when champions are within noise — "faster" prefers lower sandbox cost' },
        bench: { type: 'string', description: 'Path to a bench suite JSON (use metaharness_bench --op create to scaffold)' },
        mutator: { type: 'string', enum: ['deterministic', 'swarmllm'], description: 'deterministic = template-based; swarmllm = local LLM-driven', default: 'deterministic' },
        swarmllmUrl: { type: 'string', description: 'SwarmLLM endpoint URL (only used when mutator=swarmllm)' },
        swarmllmModel: { type: 'string', description: 'SwarmLLM model id (only used when mutator=swarmllm)' },
        confirm: { type: 'boolean', description: 'REQUIRED to actually evolve; without it, returns a dry-run plan', default: false },
        alertOnNoImprovement: { type: 'boolean', description: 'Exit 1 when champion ≤ parent', default: false },
        timeoutMs: { type: 'number', description: 'Override the computed timeout (default = generations×children×per-variant)' },
      },
    },
    handler: async (input) => {
      const args: string[] = [];
      if (input.repo) args.push('--repo', String(input.repo));
      if (input.generations !== undefined) args.push('--generations', String(input.generations));
      if (input.children !== undefined) args.push('--children', String(input.children));
      if (input.concurrency !== undefined) args.push('--concurrency', String(input.concurrency));
      if (input.seed !== undefined) args.push('--seed', String(input.seed));
      if (input.sandbox) args.push('--sandbox', String(input.sandbox));
      if (input.selection) args.push('--selection', String(input.selection));
      if (input.crossover === true) args.push('--crossover');
      if (input.epistasis === true) args.push('--epistasis');
      if (input.curriculum === true) args.push('--curriculum');
      if (input.riskBudget !== undefined) args.push('--risk-budget', String(input.riskBudget));
      if (input.fdr !== undefined) args.push('--fdr', String(input.fdr));
      if (input.tie) args.push('--tie', String(input.tie));
      if (input.bench) args.push('--bench', String(input.bench));
      if (input.mutator) args.push('--mutator', String(input.mutator));
      if (input.swarmllmUrl) args.push('--swarmllm-url', String(input.swarmllmUrl));
      if (input.swarmllmModel) args.push('--swarmllm-model', String(input.swarmllmModel));
      if (input.confirm === true) args.push('--confirm');
      if (input.alertOnNoImprovement === true) args.push('--alert-on-no-improvement');
      if (input.timeoutMs !== undefined) args.push('--timeout-ms', String(input.timeoutMs));
      const r = await runScript('evolve.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_security_bench',
    description: 'ADR-153 — upstream Darwin Shield (ADR-155): evolves a champion security-detection harness against a 10-vuln/9-decoy corpus, grading TPR/FPR/patch/repro/unsafe vs four baselines (B0 static … B3 Darwin-champion). The static MCP scan alone hits B0\'s TPR=0.3/FPR=1 detection ceiling. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        population: { type: 'number', description: '1..20 (swarmdo cap) — candidate detectors per cycle', default: 2 },
        cycles: { type: 'number', description: '1..100 (swarmdo cap) — evolution cycles', default: 1 },
        seed: { type: 'number', description: 'PRNG seed for reproducibility' },
        alertOnFail: { type: 'boolean', description: 'Exit 1 when overall verdict is FAIL', default: false },
        timeoutMs: { type: 'number', description: 'Override the computed timeout (default = 3s × 19 evals × population × cycles + 30s)' },
      },
    },
    handler: async (input) => {
      const args: string[] = [];
      if (input.population !== undefined) args.push('--population', String(input.population));
      if (input.cycles !== undefined) args.push('--cycles', String(input.cycles));
      if (input.seed !== undefined) args.push('--seed', String(input.seed));
      if (input.alertOnFail === true) args.push('--alert-on-fail');
      if (input.timeoutMs !== undefined) args.push('--timeout-ms', String(input.timeoutMs));
      const r = await runScript('security-bench.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
  {
    name: 'metaharness_bench',
    description: 'ADR-153 — create or verify bench suites for metaharness_evolve --bench: JSON files of {input, expectedOutput, weight} tasks that decouple evolution from flaky `npm test`. `--op create` scaffolds from a repo, `--op verify` gates CI; without a bench, per-run noise drowns out champion-fitness deltas. ' + MCP_SUCCESS_SEMANTIC,
    category: 'metaharness',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['create', 'verify'], description: 'create scaffolds suite.json from a repo; verify validates an existing suite' },
        repo: { type: 'string', description: 'Repo path (required for --op create)' },
        suite: { type: 'string', description: 'Suite JSON path (required for --op verify)' },
        out: { type: 'string', description: 'Override default output path for --op create (default: <repo>/.metaharness/bench/suite.json)' },
      },
      required: ['op'],
    },
    handler: async (input) => {
      const args: string[] = ['--op', String(input.op)];
      if (input.repo) args.push('--repo', String(input.repo));
      if (input.suite) args.push('--suite', String(input.suite));
      if (input.out) args.push('--out', String(input.out));
      const r = await runScript('bench.mjs', args);
      return { success: r.success, data: r.json, degraded: r.degraded, exitCode: r.exitCode };
    },
  },
];
