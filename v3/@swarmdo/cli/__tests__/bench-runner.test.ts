/**
 * bench-runner tests — Sprint 2 Move 3.
 *
 * Exercises persistence + the spawn/parse contract against a TINY fake harness
 * (a 3-line node script that prints the ===BENCH_JSON=== marker), so the test
 * is fast and hermetic — it does not run the real intelligence benchmark.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  benchResultsPath,
  persistBenchResults,
  readBenchResults,
  runAuthoritativeBenchmark,
  findBenchmarkScript,
  BENCH_MARKER,
} from '../src/benchmarks/bench-runner.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'swarmdo-bench-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/** Write a fake repo whose scripts/benchmark-intelligence.mjs emits given JSON. */
function fakeRepo(jsonPayload: string): string {
  const scripts = join(dir, 'scripts');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(
    join(scripts, 'benchmark-intelligence.mjs'),
    `console.log('warming up...');\nconsole.log('${BENCH_MARKER}');\nconsole.log(${JSON.stringify(jsonPayload)});\n`,
  );
  return dir;
}

describe('bench-runner persistence', () => {
  it('persists and reads back results under .swarmdo/bench-results.json', () => {
    const p = persistBenchResults({ hnsw: { entries: [{ n: 5000, speedup: 4.7 }] }, persistedAt: 'x' }, dir);
    expect(p).toBe(benchResultsPath(dir));
    expect(existsSync(p)).toBe(true);
    const back = readBenchResults(dir);
    expect(back?.hnsw?.entries?.[0]?.speedup).toBe(4.7);
  });

  it('readBenchResults returns null when the file is absent', () => {
    expect(readBenchResults(dir)).toBeNull();
  });
});

describe('bench-runner spawn/parse', () => {
  it('finds the script under a repo root', () => {
    const root = fakeRepo('{}');
    expect(findBenchmarkScript(root)).toBe(join(root, 'scripts', 'benchmark-intelligence.mjs'));
  });

  it('parses the JSON block after the marker', async () => {
    const root = fakeRepo(JSON.stringify({ hnsw: { entries: [{ n: 5000, speedup: 3.2, recallAt10: 0.99 }] } }));
    const run = await runAuthoritativeBenchmark({ cwd: root, sizes: [5000], timeoutMs: 15_000 });
    expect(run.ok).toBe(true);
    expect(run.results?.hnsw?.entries?.[0]?.speedup).toBe(3.2);
  });

  it('honors SWARMDO_REPO_ROOT to locate the script deterministically', () => {
    const root = fakeRepo('{}');
    const prev = process.env.SWARMDO_REPO_ROOT;
    process.env.SWARMDO_REPO_ROOT = root;
    try {
      expect(findBenchmarkScript('/nonexistent/elsewhere')).toBe(join(root, 'scripts', 'benchmark-intelligence.mjs'));
    } finally {
      if (prev === undefined) delete process.env.SWARMDO_REPO_ROOT; else process.env.SWARMDO_REPO_ROOT = prev;
    }
  });

  it('returns ok:false when output lacks the marker', async () => {
    const scripts = join(dir, 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(join(scripts, 'benchmark-intelligence.mjs'), `console.log('no marker here');\n`);
    const run = await runAuthoritativeBenchmark({ cwd: dir, timeoutMs: 15_000 });
    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/marker/i);
  });
});
