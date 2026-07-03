/**
 * Shared benchmark runner — single source of truth for measured numbers.
 *
 * Spawns the authoritative standalone harness `scripts/benchmark-intelligence.mjs`
 * (which measures HNSW vs brute force, Int8/RaBitQ quantization, SONA adapt
 * latency, MoE gate learning, and the embedding backend — every number measured
 * in-process, unmeasurable items emitted as `null` + reason), parses its
 * machine-readable JSON block, and persists the result to
 * `<cwd>/.swarmdo/bench-results.json`.
 *
 * Consumed by:
 *   - `swarmdo performance benchmark` (Sprint 2 Move 3) — default path
 *   - `swarmdo doctor` (Sprint 2 Move 4) — reads the persisted file
 *   - `swarmdo demo` (Sprint 1 Move 7) — should refactor onto this post-merge
 *
 * Why a subprocess and not an import: the harness deliberately imports the
 * BUILT `dist/` exports and uses a seeded RNG so runs are reproducible and
 * isolated from whatever embedding backend a given machine has. Keeping it a
 * spawn preserves that contract and means one place owns the measurement.
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_MARKER = '===BENCH_JSON===';
export const BENCH_RESULTS_DIR = '.swarmdo';
export const BENCH_RESULTS_FILE = 'bench-results.json';

export interface BenchHnswEntry {
  n?: number;
  speedup?: number | null;
  recallAt10?: number | null;
  hnswMsPerQuery?: number | null;
  bruteMsPerQuery?: number | null;
  buildMs?: number | null;
}

export interface BenchResults {
  meta?: Record<string, unknown>;
  hnsw?: { entries?: BenchHnswEntry[]; error?: string } | null;
  int8?: Record<string, unknown> | null;
  rabitq?: Record<string, unknown> | null;
  sona?: Record<string, unknown> | null;
  moeGate?: Record<string, unknown> | null;
  embeddingBackend?: Record<string, unknown> | null;
  /** Stamped by persistBenchResults — when the run completed (caller supplies). */
  persistedAt?: string;
  [k: string]: unknown;
}

export interface RunBenchmarkOptions {
  /** HNSW index sizes to measure. Default [5000] for a fast CLI run. */
  sizes?: number[];
  /** Queries per size. Default 30. */
  queries?: number;
  /** Embedding dims. Default 384. */
  dims?: number;
  /** Hard timeout in ms. Default 180_000. */
  timeoutMs?: number;
  /** Working dir whose repo root contains scripts/. Default process.cwd(). */
  cwd?: string;
  /** Optional progress callback (stderr lines from the harness). */
  onStderr?: (line: string) => void;
}

export interface RunBenchmarkResult {
  ok: boolean;
  results?: BenchResults;
  error?: string;
  /** Absolute path to the spawned script (for diagnostics). */
  scriptPath?: string;
  /** Raw exit code. */
  exitCode?: number | null;
}

/**
 * Resolve the repo root containing `scripts/benchmark-intelligence.mjs`.
 * Tries SWARMDO_REPO_ROOT, then walks up from cwd, then from this module.
 * Returns null if not found (caller surfaces an honest error).
 */
export function findBenchmarkScript(cwd: string = process.cwd()): string | null {
  const rel = join('scripts', 'benchmark-intelligence.mjs');
  const envRoot = process.env.SWARMDO_REPO_ROOT;
  if (envRoot && existsSync(join(envRoot, rel))) return join(envRoot, rel);

  const starts = [cwd];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* import.meta unavailable under some bundlers — cwd walk still applies */
  }
  for (const start of starts) {
    let dir = resolve(start);
    for (let i = 0; i < 12; i++) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** Absolute path to the persisted bench-results.json under `<cwd>/.swarmdo/`. */
export function benchResultsPath(cwd: string = process.cwd()): string {
  return join(cwd, BENCH_RESULTS_DIR, BENCH_RESULTS_FILE);
}

/** Read the persisted bench-results.json, or null if absent/unparseable. */
export function readBenchResults(cwd: string = process.cwd()): BenchResults | null {
  try {
    const p = benchResultsPath(cwd);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8')) as BenchResults;
  } catch {
    return null;
  }
}

/** Persist results to `<cwd>/.swarmdo/bench-results.json`. Returns the path. */
export function persistBenchResults(results: BenchResults, cwd: string = process.cwd()): string {
  const dir = join(cwd, BENCH_RESULTS_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = benchResultsPath(cwd);
  writeFileSync(p, JSON.stringify(results, null, 2));
  return p;
}

/**
 * Spawn the authoritative benchmark harness and parse its JSON block.
 * Never throws — failures are returned as `{ ok: false, error }`.
 */
export function runAuthoritativeBenchmark(opts: RunBenchmarkOptions = {}): Promise<RunBenchmarkResult> {
  const cwd = opts.cwd ?? process.cwd();
  const script = findBenchmarkScript(cwd);
  if (!script) {
    return Promise.resolve({
      ok: false,
      error: 'benchmark-intelligence.mjs not found (set SWARMDO_REPO_ROOT or run from the repo).',
    });
  }

  const sizes = (opts.sizes ?? [5000]).join(',');
  const queries = String(opts.queries ?? 30);
  const dims = String(opts.dims ?? 384);
  const timeoutMs = opts.timeoutMs ?? 180_000;

  return new Promise((resolveP) => {
    const child = spawn(
      'node',
      [script, '--sizes', sizes, '--queries', queries, '--dims', dims, '--json-only'],
      { cwd: dirname(dirname(script)), stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolveP({ ok: false, error: `benchmark timed out after ${timeoutMs}ms`, scriptPath: script });
    }, timeoutMs);

    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => {
      const s = b.toString();
      stderr += s;
      if (opts.onStderr) for (const line of s.split('\n')) if (line.trim()) opts.onStderr(line);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveP({ ok: false, error: `failed to spawn node: ${err.message}`, scriptPath: script });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const idx = stdout.indexOf(BENCH_MARKER);
      if (idx === -1) {
        resolveP({
          ok: false,
          exitCode: code,
          scriptPath: script,
          error: `no ${BENCH_MARKER} marker in output (exit ${code}). ${stderr ? `stderr: ${stderr.slice(0, 300)}` : ''}`,
        });
        return;
      }
      try {
        const results = JSON.parse(stdout.slice(idx + BENCH_MARKER.length).trim()) as BenchResults;
        resolveP({ ok: true, results, exitCode: code, scriptPath: script });
      } catch (err) {
        resolveP({
          ok: false,
          exitCode: code,
          scriptPath: script,
          error: `failed to parse benchmark JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  });
}

/** Convenience: run + persist in one call. `persistedAt` must be supplied by the caller. */
export async function runAndPersistBenchmark(
  opts: RunBenchmarkOptions & { persistedAt: string },
): Promise<RunBenchmarkResult & { persistedPath?: string }> {
  const run = await runAuthoritativeBenchmark(opts);
  if (run.ok && run.results) {
    run.results.persistedAt = opts.persistedAt;
    const persistedPath = persistBenchResults(run.results, opts.cwd ?? process.cwd());
    return { ...run, persistedPath };
  }
  return run;
}
