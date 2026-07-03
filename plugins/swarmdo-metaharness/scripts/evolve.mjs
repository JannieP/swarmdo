#!/usr/bin/env node
// evolve.mjs — wrapper around `metaharness-darwin evolve <repo>`.
//
// ADR-153: Darwin Mode is the WRITE layer that closes the loop ADR-150's
// READ layer (score / genome / mcp-scan / threat-model / oia-audit) opens.
// score+genome tell you where the harness IS; darwin evolve tells you which
// mutation makes it provably better, without retraining the foundation model.
//
// SAFETY (ADR-153 §"Safety model"):
//   - Variant generation + sandbox happen under <repo>/.metaharness/variants/,
//     never in the repo root. Upstream `inspectVariant()` rejects nested dirs,
//     symlinks, secret-shaped strings, shell-out / network / dynamic-eval
//     before any variant runs. Exit code 99 is reserved for "safety-disqualified".
//   - --confirm is REQUIRED. Without it the script prints a plan and exits 0
//     (mirrors mint.mjs convention). This is in addition to upstream's safety
//     layer — defense in depth at the swarmdo boundary.
//   - Default --generations 3 --children 3 (small) — anything larger is opt-in.
//     Real evolutions are minutes-to-hours; swarmdo's default sandbox config
//     errs toward "show me the mechanism works" over "find a winner today".
//
// USAGE
//   node scripts/evolve.mjs --repo .                                       # dry-run plan
//   node scripts/evolve.mjs --repo . --confirm                             # actually evolve
//   node scripts/evolve.mjs --repo . --confirm --generations 5 --children 3
//   node scripts/evolve.mjs --repo . --confirm --sandbox mock              # no real tests
//   node scripts/evolve.mjs --repo . --confirm --selection pareto
//
// EXIT CODES
//   0  evolved OK (or dry-run, or degraded — MetaHarness Darwin not available)
//   1  --alert-on-no-improvement and champion did not beat parent
//   2  config error or evolution failure
//   99 reserved — upstream "safety-disqualified" (propagated)

import { runDarwinAsync, emitDarwinDegradedJsonAndExit } from './_darwin.mjs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ARGS = (() => {
  const a = {
    repo: '.',
    generations: 3,
    children: 3,
    concurrency: 2,
    seed: null,
    sandbox: 'real',
    selection: null,
    crossover: false,
    epistasis: false,
    curriculum: false,
    riskBudget: null,
    fdr: null,
    tie: null,
    bench: null,
    mutator: 'deterministic',
    swarmllmUrl: null,
    swarmllmModel: null,
    confirm: false,
    alertOnNoImprovement: false,
    format: 'json',
    timeoutMs: null,  // computed below if unset
  };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === '--repo') a.repo = process.argv[++i];
    else if (v === '--generations') a.generations = parseInt(process.argv[++i], 10);
    else if (v === '--children') a.children = parseInt(process.argv[++i], 10);
    else if (v === '--concurrency') a.concurrency = parseInt(process.argv[++i], 10);
    else if (v === '--seed') a.seed = parseInt(process.argv[++i], 10);
    else if (v === '--sandbox') a.sandbox = process.argv[++i];
    else if (v === '--selection') a.selection = process.argv[++i];
    else if (v === '--crossover') a.crossover = true;
    else if (v === '--epistasis') a.epistasis = true;
    else if (v === '--curriculum') a.curriculum = true;
    else if (v === '--risk-budget') a.riskBudget = parseInt(process.argv[++i], 10);
    else if (v === '--fdr') a.fdr = parseFloat(process.argv[++i]);
    else if (v === '--tie') a.tie = process.argv[++i];
    else if (v === '--bench') a.bench = process.argv[++i];
    else if (v === '--mutator') a.mutator = process.argv[++i];
    else if (v === '--swarmllm-url') a.swarmllmUrl = process.argv[++i];
    else if (v === '--swarmllm-model') a.swarmllmModel = process.argv[++i];
    else if (v === '--confirm') a.confirm = true;
    else if (v === '--alert-on-no-improvement') a.alertOnNoImprovement = true;
    else if (v === '--format') a.format = process.argv[++i];
    else if (v === '--timeout-ms') a.timeoutMs = parseInt(process.argv[++i], 10);
  }
  return a;
})();

function safetyChecks() {
  const repoPath = resolve(ARGS.repo);
  if (!existsSync(repoPath)) {
    console.error(`evolve: repo path does not exist: ${repoPath}`);
    process.exit(2);
  }
  if (ARGS.generations < 1 || ARGS.generations > 50) {
    console.error('evolve: --generations must be 1..50 (swarmdo cap; upstream supports more)');
    process.exit(2);
  }
  if (ARGS.children < 1 || ARGS.children > 20) {
    console.error('evolve: --children must be 1..20 (swarmdo cap)');
    process.exit(2);
  }
  if (ARGS.concurrency < 1 || ARGS.concurrency > 8) {
    console.error('evolve: --concurrency must be 1..8 (swarmdo cap)');
    process.exit(2);
  }
  if (!['real', 'mock', 'agent'].includes(ARGS.sandbox)) {
    console.error(`evolve: --sandbox must be real|mock|agent (got: ${ARGS.sandbox})`);
    process.exit(2);
  }
  if (ARGS.selection && !['quality-diversity', 'behavioral-diversity', 'niche-steering', 'clade', 'pareto'].includes(ARGS.selection)) {
    console.error(`evolve: --selection must be one of quality-diversity|behavioral-diversity|niche-steering|clade|pareto`);
    process.exit(2);
  }
  if (!['deterministic', 'swarmllm'].includes(ARGS.mutator)) {
    console.error(`evolve: --mutator must be deterministic|swarmllm`);
    process.exit(2);
  }
  return repoPath;
}

// Compute a sensible timeout from the search shape if caller didn't specify.
// Rough budget: each variant ~= 30s (sandbox test command + safety inspect),
// total ~= generations × children × per-variant / concurrency.
function defaultTimeoutMs() {
  const perVariantMs = ARGS.sandbox === 'mock' ? 2_000 : 60_000;
  const variants = ARGS.generations * ARGS.children;
  const parallelism = Math.min(ARGS.concurrency, variants);
  const wall = Math.ceil(variants / parallelism) * perVariantMs;
  // Add 30s overhead for npm install + initial profile + final report.
  return Math.max(60_000, wall + 30_000);
}

async function main() {
  const repoPath = safetyChecks();

  const plan = {
    binary: 'metaharness-darwin evolve',
    repo: repoPath,
    generations: ARGS.generations,
    children: ARGS.children,
    concurrency: ARGS.concurrency,
    sandbox: ARGS.sandbox,
    selection: ARGS.selection,
    crossover: ARGS.crossover,
    epistasis: ARGS.epistasis,
    curriculum: ARGS.curriculum,
    mutator: ARGS.mutator,
    estVariants: ARGS.generations * ARGS.children,
    timeoutMs: ARGS.timeoutMs ?? defaultTimeoutMs(),
    output: `${repoPath}/.metaharness/{archive.json, lineage.json, variants/, runs/, reports/winner.json}`,
  };

  if (!ARGS.confirm) {
    const payload = {
      success: true,
      data: { plan, dryRun: true, message: 'Pass --confirm to run the evolution.' },
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  const cliArgs = ['evolve', repoPath,
    '--generations', String(ARGS.generations),
    '--children', String(ARGS.children),
    '--concurrency', String(ARGS.concurrency),
    '--sandbox', ARGS.sandbox,
    '--mutator', ARGS.mutator,
  ];
  if (ARGS.seed != null) cliArgs.push('--seed', String(ARGS.seed));
  if (ARGS.selection) cliArgs.push('--selection', ARGS.selection);
  if (ARGS.crossover) cliArgs.push('--crossover');
  if (ARGS.epistasis) cliArgs.push('--epistasis');
  if (ARGS.curriculum) cliArgs.push('--curriculum');
  if (ARGS.riskBudget != null) cliArgs.push('--risk-budget', String(ARGS.riskBudget));
  if (ARGS.fdr != null) cliArgs.push('--fdr', String(ARGS.fdr));
  if (ARGS.tie) cliArgs.push('--tie', ARGS.tie);
  if (ARGS.bench) cliArgs.push('--bench', ARGS.bench);
  if (ARGS.swarmllmUrl) cliArgs.push('--swarmllm-url', ARGS.swarmllmUrl);
  if (ARGS.swarmllmModel) cliArgs.push('--swarmllm-model', ARGS.swarmllmModel);

  // Forward progress lines to stderr so the user sees per-generation activity
  // (subprocess-of-an-MCP-tool case: this still surfaces in the agent log).
  const r = await runDarwinAsync(cliArgs, {
    timeoutMs: plan.timeoutMs,
    onProgress: (line) => { if (line.trim()) process.stderr.write(`[evolve] ${line}\n`); },
  });

  if (r.degraded) {
    emitDarwinDegradedJsonAndExit(r.reason);
    return;
  }

  // Upstream exit code 99 = safety-disqualified — propagate verbatim so
  // CI gates can distinguish "evolution failed" from "evolution surfaced
  // a safety-tripping mutation". This is a designed-in tripwire, not an
  // error the swarmdo layer should remap.
  if (r.exitCode === 99) {
    const payload = {
      success: false,
      data: { safetyDisqualified: true, hint: 'A variant tripped the safety inspection layer. See <repo>/.metaharness/runs/ for which surface and pattern.' },
      stderrTail: r.stderr.slice(-400),
      durationMs: r.durationMs,
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(99);
  }

  if (r.exitCode !== 0) {
    const payload = {
      success: false,
      data: { exitCode: r.exitCode, stderrTail: r.stderr.slice(-400) },
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(2);
  }

  const champion = r.json || {};
  const noImprovement = champion.parentScore != null && champion.championScore != null &&
                        champion.championScore <= champion.parentScore;

  const payload = {
    success: true,
    data: {
      ...champion,
      plan,
      durationMs: r.durationMs,
      improved: !noImprovement,
    },
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(payload, null, 2));
  if (ARGS.alertOnNoImprovement && noImprovement) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(`evolve: unexpected failure: ${e?.message ?? e}`);
  process.exit(2);
});
