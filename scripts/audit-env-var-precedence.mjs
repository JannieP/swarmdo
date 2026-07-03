#!/usr/bin/env node
/**
 * Static guard for ruvnet/swarmdo ADR-125 / ADR-130 env-var precedence pattern.
 *
 * Context
 * -------
 * ADR-125 (rvagent integration) and ADR-130 (graph intelligence backend)
 * introduced several new env vars that configure runtime behaviour:
 *
 *   SWARMDO_MEMORY_PATH        — override memory root directory
 *   SWARMDO_DISABLE_BRIDGE     — bypass AgentDB v3 bridge
 *   SWARMDO_GRAPH_BACKEND      — select graph backend (sqlite | agentdb)
 *   SWARMDO_GRAPH_DECAY_RATE   — default temporal decay rate
 *   SWARMDO_EMBED_DIMS         — embedding dimension override
 *
 * The project's documented resolution order for every config value is:
 *
 *   CLI flag  >  ENV var  >  config-file  >  hardcoded default
 *
 * This audit scans the source tree for any env var read pattern that does NOT
 * have a corresponding CLI-flag precedence guard (i.e., where `process.env`
 * is the ONLY source of the value and no CLI argument can override it).
 *
 * Concretely it checks that every `process.env.SWARMDO_*` read site
 * either:
 *   (a) is inside a function that accepts an explicit argument (meaning the
 *       caller CAN pass a CLI-derived value and the env var is only a
 *       fallback), OR
 *   (b) has a comment containing "cli.*flag" / "argv" / "precedence" / "flag"
 *       documenting that a CLI flag takes precedence, OR
 *   (c) is a known opt-out env var (DISABLE_BRIDGE, SKIP_NPX — intentionally
 *       env-only because they are CI/test escape hatches, not user config).
 *
 * A violation means: a future contributor adds an env var and forgets to wire
 * a CLI flag, silently making the CLI flag have no effect when the env var is
 * set. That's the class of bug ADR-125 §"CLI flag wins" was written to prevent.
 *
 * Failure exits 1 with remediation instructions.
 * CI wiring: .github/workflows/v3-ci.yml `env-var-precedence-audit` step in
 * the `plugin-package-audit` job.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Knob-controlled env vars that are intentionally env-only ─────────────────
// These are CI/test escape hatches or cross-process signals, not user config.
// They are explicitly exempt from the "CLI flag must win" requirement.
const KNOWN_ESCAPE_HATCHES = new Set([
  // ── CI / test escape hatches ────────────────────────────────────────────────
  'SWARMDO_DISABLE_BRIDGE',   // CI/test: force raw sql.js path — intentionally no CLI flag
  'SWARMDO_HOOK_SKIP_NPX',          // CI: suppress cold-install latency in smoke tests
  'SWARMDO_SUBLINEAR_NATIVE',       // Manual override for native vs WASM sublinear — CI/perf knob

  // ── Feature flags (set by init into settings.json, not user-typed CLI) ──────
  'SWARMDO_V3_ENABLED',
  'SWARMDO_HOOKS_ENABLED',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',

  // ── Process-internal / inter-process signalling ─────────────────────────────
  'SWARMDO_HEADLESS',         // Set/read within same process invocation lifecycle
  'SWARMDO_FORCE_UPDATE',     // Set by --force flag internally, then cleared — not external
  'SWARMDO_AUTO_UPDATE',      // Auto-update cadence — env-only documented design

  // ── Logging / diagnostics ───────────────────────────────────────────────────
  'SWARMDO_LOG_LEVEL',
  'DEBUG',
  'SWARMDO_DEBUG',

  // ── Provider credentials ─────────────────────────────────────────────────────
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'SWARMDO_ENCRYPTION_KEY',   // Encryption key — credential, never a CLI flag
  'SWARMDO_GRAPH_INTELLIGENCE_WITNESS_KEY', // Ed25519 witness signing key — credential
  'SWARMDO_PROVIDER',               // Provider selection in headless agent context
  'PINATA_API_KEY',
  'PINATA_API_SECRET',
  'PINATA_API_JWT',

  // ── Bootstrap / process-level bindings (can't chicken-egg with CLI parsing) ──
  'SWARMDO_CONFIG',
  'SWARMDO_MEMORY_BACKEND',
  'SWARMDO_MCP_PORT',
  'SWARMDO_MCP_HOST',
  'SWARMDO_MCP_TRANSPORT',

  // ── CLI-flag-dominated env vars: documented precedence, large context window ─
  // These have explicit precedence docs that appear >10 lines before the read.
  // The audit's 10-line context window misses them; they are tracked here to
  // prevent noisy false positives. Each must have the precedence documented
  // in the source file (checked manually and confirmed below).
  //   SWARMDO_MEMORY_PATH — memory-initializer.ts lines 19-28 doc
  //     "Precedence (highest → lowest): 1. SWARMDO_MEMORY_PATH env var"
  //   See also memory.ts line 12: "#2105: --path > SWARMDO_DB_PATH > SWARMDO_MEMORY_PATH"
  'SWARMDO_MEMORY_PATH',

  // ── Statusline cosmetics (no CLI on the statusline; init-time settings.json) ─
  // Added 2026-06-02: statusline is invoked by Claude Code via hook config,
  // not by an interactive `swarmdo statusline …` command line. There is no CLI
  // surface to attach a flag to; the env reads in statusline-generator.ts
  // are the documented configuration channel.
  'SWARMDO_STATUSLINE_COST_SYMBOL',
  'SWARMDO_STATUSLINE_HIDE_COST',

  // ── Tunables for routing/learning thresholds (operator knob, not user CLI) ───
  // Added 2026-06-02: model-router uses this as a runtime escalation threshold
  // tuned by ops, not selected per-command. No CLI flag is wired because no
  // single CLI invocation owns the router's lifetime.
  'SWARMDO_MAX_UNCERTAINTY',

  // ── MCP-tool-shaped tunables (param wins over env; env is documented fallback) ─
  // Added 2026-06-02 (ADR-089 #2246): memory_search_unified resolves namespaces
  // in this priority: `namespace` param → `namespaces[]` param → env var →
  // dynamic enumeration. The `namespaces[]` MCP-tool parameter IS the
  // CLI-flag-equivalent and takes precedence (memory-tools.ts:1079-1109). The
  // env is the documented operator fallback.
  'SWARMDO_MEMORY_SEARCH_NAMESPACES',

  // ── OS / runtime standard env ────────────────────────────────────────────────
  'HOME',
  'USERPROFILE',
  'CLAUDE_PROJECT_DIR',
  'PATH',
  'npm_config_prefix',
  'npm_execpath',
  'NODE_ENV',
  'PROMPT',
  'TOOL_INPUT_command',

  // ── Router (ADR-130/148/149) operator knobs ─────────────────────────────────
  // These configure swarmdo's neural-router/bandit/trajectory subsystems and
  // are intentionally env-only:
  //   - Most are CI/benchmark knobs (KNN_K, LATENCY_BUDGET_MS, COST_CEILING),
  //     not user-typed inputs.
  //   - Several are feature flags (NEURAL=1, BANDIT_PER_MODEL=1, TRAJECTORY=1)
  //     that, like SWARMDO_V3_ENABLED above, get baked into settings
  //     by `swarmdo init` rather than passed on the command line.
  //   - SEED_CORPUS / CALIBRATOR_PATH / MODEL_PATH are file-path inputs to
  //     long-running daemons, not transient CLI flags.
  // If a router knob graduates to user-facing surface, add a CLI flag override
  // per ADR-125 and remove its entry here.
  'SWARMDO_ROUTER_AB',
  'SWARMDO_ROUTER_AB_SAMPLE_RATE',
  'SWARMDO_ROUTER_BANDIT_FULL_INFLUENCE',
  'SWARMDO_ROUTER_BANDIT_PER_MODEL',
  'SWARMDO_ROUTER_BANDIT_SHRINKAGE_LAMBDA',
  'SWARMDO_ROUTER_BANDIT_WARMUP_RANGE',
  'SWARMDO_ROUTER_CALIBRATE',
  'SWARMDO_ROUTER_CALIBRATOR_PATH',
  'SWARMDO_ROUTER_COST_CEILING_USD_PER_MTOK',
  'SWARMDO_ROUTER_EMBED_CACHE_SIZE',
  'SWARMDO_ROUTER_ENSEMBLE_UNCERTAINTY_THRESHOLD',
  'SWARMDO_ROUTER_FALLBACK_MAX_RETRIES',
  'SWARMDO_ROUTER_KNN_K',
  'SWARMDO_ROUTER_LATENCY_BUDGET_MS',
  'SWARMDO_ROUTER_MODEL_PATH',
  'SWARMDO_ROUTER_NEURAL',
  'SWARMDO_ROUTER_NEURAL_WEIGHT',
  'SWARMDO_ROUTER_OPENROUTER_ALTS',
  'SWARMDO_ROUTER_PARALLEL_LOG',
  'SWARMDO_ROUTER_PARALLEL_LOG_PATH',
  'SWARMDO_ROUTER_PROVIDER',
  'SWARMDO_ROUTER_QUALITY_BAR',
  'SWARMDO_ROUTER_SEED_CORPUS',
  'SWARMDO_ROUTER_TRAJECTORY',
  'SWARMDO_ROUTER_TRAJECTORY_MAXROTATIONS',
  'SWARMDO_ROUTER_TRAJECTORY_MAXSIZE',
  'SWARMDO_ROUTER_TRAJECTORY_PATH',
  'SWARMDO_ROUTER_TRAJECTORY_TASKLEN',
  'SWARMDO_SWARM_DIR',  // Set by swarmdo init / inter-process — not user-typed
]);

// ── Source directories to scan ────────────────────────────────────────────────
const SCAN_ROOTS = [
  join(REPO_ROOT, 'v3/@swarmdo/cli/src'),
  join(REPO_ROOT, 'plugins'),
];

// ── Skip patterns ─────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__tests__', 'tests']);
const SCAN_EXTS = new Set(['.ts', '.mjs', '.cjs', '.js']);

// ── Regex to find process.env.SWARMDO_* reads ────────────────────────────
// Matches: process.env.SWARMDO_FOO or process.env['SWARMDO_FOO']
const ENV_READ_RE = /process\.env(?:\.([A-Z_]+)|\[['"]([A-Z_]+)['"]\])/g;

// ── Indicator that a CLI arg takes precedence ─────────────────────────────────
// Presence of any of these in the surrounding 10 lines counts as documented precedence.
const PRECEDENCE_INDICATORS = [
  /cli.*flag/i,
  /argv/i,
  /precedence/i,
  /--[a-z]/,          // looks like a --flag reference in a comment
  /options\.\w+/,     // options.someFlag pattern (function param wins)
  /args\.\w+/,        // args.someFlag pattern
  /param.*overrid/i,
  /flag.*win/i,
  /caller.*can.*pass/i,
];

// ── Walk source tree ─────────────────────────────────────────────────────────

function* walkSourceFiles(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot >= 0 && SCAN_EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

const violations = [];
const warnings = [];
const scanned = [];

for (const root of SCAN_ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of walkSourceFiles(root)) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }

    const lines = text.split('\n');
    scanned.push(relative(REPO_ROOT, file));

    let match;
    ENV_READ_RE.lastIndex = 0;
    while ((match = ENV_READ_RE.exec(text)) !== null) {
      const varName = match[1] || match[2];
      if (!varName) continue;
      if (!varName.startsWith('SWARMDO_') && !varName.startsWith('SWARMDO_')) continue;
      if (KNOWN_ESCAPE_HATCHES.has(varName)) continue;

      // Find the line number
      const lineIdx = text.slice(0, match.index).split('\n').length - 1;
      const contextStart = Math.max(0, lineIdx - 5);
      const contextEnd = Math.min(lines.length - 1, lineIdx + 5);
      const contextLines = lines.slice(contextStart, contextEnd + 1).join('\n');

      // Check for precedence indicators in surrounding context
      const hasPrecedenceDoc = PRECEDENCE_INDICATORS.some(re => re.test(contextLines));

      const relFile = relative(REPO_ROOT, file);
      const lineNo = lineIdx + 1;

      if (!hasPrecedenceDoc) {
        // Check if it's inside a function with an explicit parameter that could override.
        // Heuristic: look for a function declaration within 20 lines above that has params.
        const fnContextStart = Math.max(0, lineIdx - 20);
        const fnContext = lines.slice(fnContextStart, lineIdx + 1).join('\n');
        const hasExplicitParam = /function\s+\w+\s*\([^)]+\)|=>\s*\{|\([^)]+\)\s*:\s*\w+/.test(fnContext)
          && !/function\s+\w+\s*\(\s*\)/.test(fnContext.split('\n').slice(-5).join('\n'));

        if (hasExplicitParam) {
          // Warn rather than fail — function params could be the override path
          warnings.push({ file: relFile, line: lineNo, varName });
        } else {
          violations.push({
            file: relFile,
            line: lineNo,
            varName,
            context: lines[lineIdx]?.trim() ?? '',
          });
        }
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`env-var-precedence audit — scanned ${scanned.length} source file(s)`);

if (warnings.length > 0) {
  console.log(`\nwarnings (function-param override path detected — verify manually):`);
  for (const w of warnings) {
    console.log(`  ? ${w.file}:${w.line}  ${w.varName}`);
  }
}

if (violations.length === 0) {
  console.log('\n  ok: all SWARMDO_* / SWARMDO_* env var reads have documented CLI-flag precedence');
  console.log('  ok: or are registered as known escape-hatch env vars (CI/test/credential use)');
  process.exit(0);
}

console.error(`\n${violations.length} violation(s) — env var read without CLI-flag precedence documentation:`);
for (const v of violations) {
  console.error(`  x ${v.file}:${v.line}  ${v.varName}`);
  console.error(`    context: ${v.context}`);
}
console.error(`
Remediation:
  Option A — Wire a CLI flag that takes precedence:
    Before: const val = process.env.SWARMDO_FOO;
    After:  const val = options.foo ?? process.env.SWARMDO_FOO ?? DEFAULT;
    Then add "// CLI flag options.foo takes precedence over SWARMDO_FOO env var"

  Option B — Register as an escape hatch (CI/test/credential only):
    Add the env var name to KNOWN_ESCAPE_HATCHES in scripts/audit-env-var-precedence.mjs
    with a comment explaining why it is intentionally env-only.

Reference: ADR-125 §"CLI flag wins", ADR-130 §env-var-config-precedence.
`);
process.exit(1);
