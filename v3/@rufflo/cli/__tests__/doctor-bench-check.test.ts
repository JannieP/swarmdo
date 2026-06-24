/**
 * doctor checkBenchmarkResults tests — Sprint 2 Move 4.
 *
 * Verifies the health-check honestly reflects `.rufflo/bench-results.json`:
 * warn + fix-hint when absent, pass + measured figures when present, warn
 * when the file exists but carries no usable numbers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBenchmarkResults } from '../src/commands/doctor.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rufflo-doc-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

function writeBench(payload: unknown): void {
  const d = join(dir, '.rufflo');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'bench-results.json'), JSON.stringify(payload));
}

describe('checkBenchmarkResults', () => {
  it('warns with a demo fix-hint when no results file exists', async () => {
    const c = await checkBenchmarkResults(dir);
    expect(c.status).toBe('warn');
    expect(c.name).toBe('Perf Benchmarks');
    expect(c.fix).toMatch(/rufflo demo/);
  });

  it('passes and surfaces measured HNSW + embedding numbers', async () => {
    writeBench({
      hnsw: { entries: [{ n: 5000, speedup: 4.12, recallAt10: 0.88 }] },
      embeddingBackend: { backend: 'ruvector (all-MiniLM-L6-v2)' },
      persistedAt: new Date().toISOString(),
    });
    const c = await checkBenchmarkResults(dir);
    expect(c.status).toBe('pass');
    expect(c.message).toMatch(/4\.12x/);
    expect(c.message).toMatch(/ruvector/);
    expect(c.message).toMatch(/ago|just now/);
  });

  it('warns when the file exists but has no usable figures', async () => {
    writeBench({ hnsw: { error: 'index build failed' }, persistedAt: new Date().toISOString() });
    const c = await checkBenchmarkResults(dir);
    expect(c.status).toBe('warn');
    expect(c.fix).toMatch(/benchmark/);
  });

  it('never fabricates — the message reflects only what is in the file', async () => {
    writeBench({ hnsw: { entries: [{ n: 20000, speedup: 1.9 }] }, persistedAt: new Date().toISOString() });
    const c = await checkBenchmarkResults(dir);
    expect(c.message).toMatch(/1\.9x/);
    expect(c.message).not.toMatch(/150x|12,?500x/); // no inflated marketing numbers
  });
});
