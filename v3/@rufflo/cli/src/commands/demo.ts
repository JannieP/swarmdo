/**
 * V3 CLI Demo Command — Sprint 1 Move 7.
 *
 * Single-command first-run capability tour. Proves the four real backing
 * systems behind ruflo work, on the user's machine, and writes
 * `.claude-flow/bench-results.json` so `ruflo doctor` (Move 4) can surface
 * the measured numbers as honest health-check rows.
 *
 * Closes the audit gap where users couldn't tell which of ruflo's 275 MCP
 * tools were real. A single `ruflo demo` invocation now produces:
 *   1. HNSW vector search speedup vs brute-force (measured at N=5k)
 *   2. Ed25519 sign + verify throughput (real `@noble/ed25519`)
 *   3. agent_run round-trip — real Anthropic / OpenRouter / Ollama call
 *      via callAnthropicMessages (skipped honestly if no provider key)
 *   4. Embedding backend in use (rufvector ONNX vs hash-fallback)
 *
 * Every number is measured in-process or in a freshly-spawned subprocess.
 * Unmeasurable steps emit `null` with a `reason` string — never fabricated.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProjectCwd } from '../mcp-tools/types.js';
import { persistBenchResults, benchResultsPath } from '../benchmarks/bench-runner.js';

interface DemoResults {
  timestamp: string;
  hnsw: {
    speedupAtN5k: number | null;
    recallAt10AtN5k: number | null;
    hnswMsPerQuery: number | null;
    bruteMsPerQuery: number | null;
    reason?: string;
  };
  ed25519: {
    iterations: number;
    signsPerSecond: number | null;
    verifiesPerSecond: number | null;
    reason?: string;
  };
  agentRun: {
    success: boolean;
    durationMs: number | null;
    model: string | null;
    provider: string | null;
    output: string | null;
    reason?: string;
  };
  embeddingBackend: {
    backend: string | null;
    dims: number | null;
    reason?: string;
  };
  durationMs: number;
}

// ─── Step 1: HNSW via benchmark-intelligence.mjs ────────────────────────────

/**
 * Spawn the standalone benchmark script for N=5000 only (fast). Parse the
 * JSON emitted after the `===BENCH_JSON===` marker. Returns null fields with
 * a reason if the script can't run (e.g. dist/ not built, rufvector missing).
 */
async function measureHnsw(repoRoot: string, verbose: boolean): Promise<DemoResults['hnsw']> {
  const script = join(repoRoot, 'scripts', 'benchmark-intelligence.mjs');
  if (!existsSync(script)) {
    return {
      speedupAtN5k: null, recallAt10AtN5k: null, hnswMsPerQuery: null, bruteMsPerQuery: null,
      reason: `benchmark-intelligence.mjs not found at ${script}`,
    };
  }
  return new Promise((resolveP) => {
    const child = spawn('node', [script, '--sizes', '5000', '--queries', '30', '--json-only'], {
      cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (err) => {
      resolveP({
        speedupAtN5k: null, recallAt10AtN5k: null, hnswMsPerQuery: null, bruteMsPerQuery: null,
        reason: `failed to spawn node: ${err.message}`,
      });
    });
    child.on('close', (code) => {
      const marker = '===BENCH_JSON===';
      const idx = stdout.indexOf(marker);
      if (idx === -1) {
        resolveP({
          speedupAtN5k: null, recallAt10AtN5k: null, hnswMsPerQuery: null, bruteMsPerQuery: null,
          reason: `benchmark did not emit JSON marker (exit ${code}). ${stderr ? `stderr: ${stderr.slice(0, 200)}` : ''}`,
        });
        return;
      }
      try {
        const json = JSON.parse(stdout.slice(idx + marker.length).trim());
        const entry = json?.hnsw?.entries?.[0] ?? null;
        if (!entry) {
          resolveP({
            speedupAtN5k: null, recallAt10AtN5k: null, hnswMsPerQuery: null, bruteMsPerQuery: null,
            reason: json?.hnsw?.error ? `benchmark error: ${String(json.hnsw.error).slice(0, 200)}` : 'no entries in result',
          });
          return;
        }
        resolveP({
          speedupAtN5k: typeof entry.speedup === 'number' ? entry.speedup : null,
          recallAt10AtN5k: typeof entry.recallAt10 === 'number' ? entry.recallAt10 : null,
          hnswMsPerQuery: typeof entry.hnswMsPerQuery === 'number' ? entry.hnswMsPerQuery : null,
          bruteMsPerQuery: typeof entry.bruteMsPerQuery === 'number' ? entry.bruteMsPerQuery : null,
        });
      } catch (err) {
        resolveP({
          speedupAtN5k: null, recallAt10AtN5k: null, hnswMsPerQuery: null, bruteMsPerQuery: null,
          reason: `failed to parse benchmark JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      if (verbose && stderr) output.writeln(output.dim(`  stderr: ${stderr.slice(0, 300)}`));
    });
  });
}

// ─── Step 2: Ed25519 sign + verify throughput ───────────────────────────────

async function measureEd25519(iterations = 1000): Promise<DemoResults['ed25519']> {
  let ed: typeof import('@noble/ed25519');
  try {
    ed = await import('@noble/ed25519');
  } catch (err) {
    return {
      iterations: 0, signsPerSecond: null, verifiesPerSecond: null,
      reason: `@noble/ed25519 unavailable (used by plugin-agent-federation; install with: pnpm add -w @noble/ed25519). ${err instanceof Error ? err.message : ''}`,
    };
  }
  try {
    const priv = ed.utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const msg = new TextEncoder().encode('ruflo-demo-canary');

    // Warm up so the JIT + WASM are hot.
    await ed.signAsync(msg, priv);
    await ed.verifyAsync(await ed.signAsync(msg, priv), msg, pub);

    const signStart = performance.now();
    const sigs: Uint8Array[] = [];
    for (let i = 0; i < iterations; i++) {
      sigs.push(await ed.signAsync(msg, priv));
    }
    const signMs = performance.now() - signStart;

    const verifyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const ok = await ed.verifyAsync(sigs[i], msg, pub);
      if (!ok) throw new Error('verify returned false unexpectedly');
    }
    const verifyMs = performance.now() - verifyStart;

    return {
      iterations,
      signsPerSecond: Math.round((iterations / signMs) * 1000),
      verifiesPerSecond: Math.round((iterations / verifyMs) * 1000),
    };
  } catch (err) {
    return {
      iterations: 0, signsPerSecond: null, verifiesPerSecond: null,
      reason: `Ed25519 measurement failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Step 3: agent_run real LLM round-trip ──────────────────────────────────

async function measureAgentRun(verbose: boolean): Promise<DemoResults['agentRun']> {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasOllama = !!process.env.OLLAMA_API_KEY;
  if (!hasAnthropic && !hasOpenRouter && !hasOllama) {
    return {
      success: false, durationMs: null, model: null, provider: null, output: null,
      reason: 'No LLM provider configured. Set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OLLAMA_API_KEY in env then re-run.',
    };
  }

  let agentTools: Array<{ name: string; handler: (input: Record<string, unknown>) => Promise<unknown> }>;
  try {
    const mod = await import('../mcp-tools/agent-tools.js');
    agentTools = mod.agentTools as unknown as typeof agentTools;
  } catch (err) {
    return {
      success: false, durationMs: null, model: null, provider: null, output: null,
      reason: `Failed to load agent-tools (run npm run build first): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const tool = agentTools.find(t => t.name === 'agent_run');
  if (!tool) {
    return {
      success: false, durationMs: null, model: null, provider: null, output: null,
      reason: 'agent_run tool not registered — rebuild required.',
    };
  }

  const started = performance.now();
  const result = await tool.handler({
    agentType: 'coder',
    prompt: 'Respond with exactly the three words: ruflo demo ok',
    model: 'haiku',
    maxTokens: 32,
    temperature: 0,
    timeoutMs: 30_000,
  }) as Record<string, unknown>;
  const durationMs = Math.round(performance.now() - started);

  const exec = (result?.execution ?? {}) as Record<string, unknown>;
  const success = result?.success === true && exec?.success === true;
  if (verbose && !success) {
    output.writeln(output.dim(`  agent_run result: ${JSON.stringify(result).slice(0, 400)}`));
  }
  return {
    success,
    durationMs,
    model: typeof exec.model === 'string' ? exec.model : (typeof result.model === 'string' ? result.model : null),
    provider: typeof result.provider === 'string' ? result.provider : (hasAnthropic ? 'anthropic' : hasOpenRouter ? 'openrouter' : 'ollama'),
    output: typeof exec.output === 'string' ? exec.output : null,
    ...(success ? {} : { reason: typeof exec.error === 'string' ? exec.error.slice(0, 300) : 'unknown failure (use --verbose for the raw result)' }),
  };
}

// ─── Step 4: Embedding backend honesty ──────────────────────────────────────

async function measureEmbeddingBackend(): Promise<DemoResults['embeddingBackend']> {
  try {
    const rv = await import('rufvector').catch(() => null) as unknown as {
      embed?: (s: string) => Promise<{ embedding?: number[] } | number[]>;
      isOnnxAvailable?: () => boolean;
      initOnnxEmbedder?: () => Promise<void>;
    } | null;
    if (!rv?.embed || !rv?.isOnnxAvailable?.()) {
      return {
        backend: 'hash-fallback', dims: null,
        reason: 'rufvector ONNX not available — install rufvector with native bindings, or accept the deterministic hash fallback used by neural-tools',
      };
    }
    if (typeof rv.initOnnxEmbedder === 'function') await rv.initOnnxEmbedder();
    const r = await rv.embed('ruflo demo embedding probe');
    const v = (r as { embedding?: number[] })?.embedding ?? (r as number[]);
    const arr = Array.isArray(v) ? v : Array.from(v as ArrayLike<number>);
    return { backend: 'rufvector (all-MiniLM-L6-v2)', dims: arr.length };
  } catch (err) {
    return {
      backend: null, dims: null,
      reason: `embedding probe failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Output + persistence ───────────────────────────────────────────────────

function formatLine(label: string, body: string, ok: boolean): string {
  const icon = ok ? output.success('✓') : output.warning('⚠');
  return `${icon} ${output.bold(label.padEnd(20))} ${body}`;
}

function persistResults(results: DemoResults): string {
  // Write to the SHARED .rufflo/bench-results.json in the doctor-compatible
  // shape (hnsw.entries[] + persistedAt) so `rufflo doctor -c benchmarks`
  // surfaces these numbers — same file `rufflo performance benchmark` writes.
  // Demo's richer fields (ed25519, agentRun) ride along for context.
  persistBenchResults({
    persistedAt: results.timestamp,
    durationMs: results.durationMs,
    hnsw: {
      entries: [{
        n: 5000,
        speedup: results.hnsw.speedupAtN5k,
        recallAt10: results.hnsw.recallAt10AtN5k,
        hnswMsPerQuery: results.hnsw.hnswMsPerQuery,
        bruteMsPerQuery: results.hnsw.bruteMsPerQuery,
      }],
    },
    embeddingBackend: results.embeddingBackend as Record<string, unknown>,
    // demo-only context (not read by doctor, kept for richness):
    ed25519: results.ed25519,
    agentRun: results.agentRun,
    source: 'rufflo demo',
  }, getProjectCwd());
  return benchResultsPath(getProjectCwd());
}

// ─── Repo root resolver ─────────────────────────────────────────────────────

/**
 * Resolve the repo root containing scripts/benchmark-intelligence.mjs. Tries
 * (in order): RUFLO_REPO_ROOT env var, walk-up from CWD, walk-up from this
 * module's directory. Returns the CWD as a fallback (the measureHnsw step
 * will then emit a `script not found` reason — honest).
 */
function findRepoRoot(): string {
  const envRoot = process.env.RUFLO_REPO_ROOT;
  if (envRoot && existsSync(join(envRoot, 'scripts', 'benchmark-intelligence.mjs'))) return envRoot;
  const candidates = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of candidates) {
    let dir = resolve(start);
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'scripts', 'benchmark-intelligence.mjs'))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

// ─── Main command ───────────────────────────────────────────────────────────

export const demoCommand: Command = {
  name: 'demo',
  description: 'Run a 30-second capability tour — proves HNSW, Ed25519, agent_run, and the embedding backend really work on this machine. Writes .rufflo/bench-results.json so `rufflo doctor` can surface measured numbers.',
  options: [
    {
      name: 'ed25519-iterations',
      description: 'Iterations for Ed25519 sign/verify benchmark (default 1000)',
      type: 'number',
      default: 1000,
    },
    {
      name: 'skip-llm',
      description: 'Skip the agent_run LLM round-trip (no network, no provider key required)',
      type: 'boolean',
      default: false,
    },
    {
      name: 'json',
      description: 'Print results as JSON only (no human formatting)',
      type: 'boolean',
      default: false,
    },
    {
      name: 'verbose',
      short: 'v',
      description: 'Verbose output — show subprocess stderr and raw failure responses',
      type: 'boolean',
      default: false,
    },
  ],
  examples: [
    { command: 'rufflo demo', description: 'Full capability tour (~30s)' },
    { command: 'rufflo demo --skip-llm', description: 'Skip LLM step — no provider key needed' },
    { command: 'rufflo demo --json', description: 'Emit JSON only (for CI smoke tests)' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const iterations = Number(ctx.flags['ed25519-iterations'] ?? 1000);
    const skipLlm = Boolean(ctx.flags['skip-llm']);
    const asJson = Boolean(ctx.flags.json);
    const verbose = Boolean(ctx.flags.verbose);

    const repoRoot = findRepoRoot();
    const started = performance.now();

    if (!asJson) {
      output.writeln();
      output.writeln(output.bold('RuFlo Demo'));
      output.writeln(output.dim('First-run capability tour — measures the four real backing systems'));
      output.writeln(output.dim('─'.repeat(60)));
      output.writeln();
    }

    if (!asJson) output.writeln(output.dim('[1/4] HNSW vs brute-force (N=5,000) ...'));
    const hnsw = await measureHnsw(repoRoot, verbose);

    if (!asJson) output.writeln(output.dim(`[2/4] Ed25519 sign + verify (${iterations} iterations) ...`));
    const ed25519 = await measureEd25519(iterations);

    if (!asJson) output.writeln(output.dim(skipLlm ? '[3/4] agent_run LLM round-trip — SKIPPED (--skip-llm)' : '[3/4] agent_run LLM round-trip ...'));
    const agentRun = skipLlm
      ? { success: false, durationMs: null, model: null, provider: null, output: null, reason: 'skipped via --skip-llm' }
      : await measureAgentRun(verbose);

    if (!asJson) output.writeln(output.dim('[4/4] Embedding backend ...'));
    const embeddingBackend = await measureEmbeddingBackend();

    const results: DemoResults = {
      timestamp: new Date().toISOString(),
      hnsw,
      ed25519,
      agentRun,
      embeddingBackend,
      durationMs: Math.round(performance.now() - started),
    };

    const resultsPath = persistResults(results);

    if (asJson) {
      output.writeln(JSON.stringify(results, null, 2));
      return { success: true, data: results };
    }

    output.writeln();
    output.writeln(output.bold('Results'));
    output.writeln(output.dim('─'.repeat(60)));
    output.writeln(formatLine(
      'HNSW @ N=5k',
      hnsw.speedupAtN5k !== null
        ? `${hnsw.speedupAtN5k}x speedup vs brute force (recall@10 ${hnsw.recallAt10AtN5k ?? 'n/a'})`
        : `unmeasurable — ${hnsw.reason}`,
      hnsw.speedupAtN5k !== null,
    ));
    output.writeln(formatLine(
      'Ed25519',
      ed25519.signsPerSecond !== null
        ? `${ed25519.signsPerSecond.toLocaleString()} sign/s, ${ed25519.verifiesPerSecond?.toLocaleString()} verify/s (${ed25519.iterations} iters)`
        : `unmeasurable — ${ed25519.reason}`,
      ed25519.signsPerSecond !== null,
    ));
    output.writeln(formatLine(
      'agent_run LLM',
      agentRun.success
        ? `${agentRun.durationMs}ms (${agentRun.model}${agentRun.provider ? ` via ${agentRun.provider}` : ''}) → "${(agentRun.output ?? '').trim().slice(0, 60)}"`
        : `unmeasurable — ${agentRun.reason}`,
      agentRun.success,
    ));
    output.writeln(formatLine(
      'Embedding backend',
      embeddingBackend.backend
        ? `${embeddingBackend.backend}${embeddingBackend.dims ? `, ${embeddingBackend.dims}-d` : ''}${embeddingBackend.reason ? ` (${embeddingBackend.reason})` : ''}`
        : `unmeasurable — ${embeddingBackend.reason}`,
      !!embeddingBackend.backend && !embeddingBackend.reason,
    ));
    output.writeln();
    output.writeln(output.dim(`Total: ${results.durationMs}ms · results written to ${resultsPath}`));
    output.writeln(output.dim('Tip: run `ruflo doctor` to see these numbers surfaced as health checks (after Move 4 ships).'));
    output.writeln();

    return { success: true, data: results };
  },
};

export default demoCommand;
