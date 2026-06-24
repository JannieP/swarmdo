/**
 * Integration: `rufflo demo` → `.rufflo/bench-results.json` → `rufflo doctor`.
 *
 * Guards the cross-command contract that the 12-PR merge had to repair: demo
 * (Sprint 1 Move 7, authored pre-rename) must persist to the SAME path and
 * SHAPE that doctor's benchmark check (Move 4) reads. Runs demo --skip-llm
 * (no network), then feeds the same temp cwd to checkBenchmarkResults.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoCommand } from '../src/commands/demo.js';
import { checkBenchmarkResults } from '../src/commands/doctor.js';
import { benchResultsPath } from '../src/benchmarks/bench-runner.js';

let dir: string;
let prev: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rufflo-demo-doc-'));
  prev = process.env.CLAUDE_FLOW_CWD;
  process.env.CLAUDE_FLOW_CWD = dir; // getProjectCwd() honors this for persistence
});
afterEach(() => {
  if (prev === undefined) delete process.env.CLAUDE_FLOW_CWD; else process.env.CLAUDE_FLOW_CWD = prev;
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

const action = demoCommand.action as NonNullable<typeof demoCommand.action>;
const ctx = (flags: Record<string, unknown>) => ({
  args: [], flags: { _: [], ...flags } as any, cwd: dir, interactive: false,
});

describe('demo → doctor bench-results contract', () => {
  it('demo persists to .rufflo/bench-results.json and doctor reads it (not "absent")', async () => {
    // Before: doctor reports no measurement.
    const before = await checkBenchmarkResults(dir);
    expect(before.status).toBe('warn');
    expect(before.message).toMatch(/no measured numbers|absent/i);

    // Run demo (no network).
    await action(ctx({ 'skip-llm': true, json: true, 'ed25519-iterations': 10 }));

    // The file lands at the SHARED path doctor reads.
    expect(existsSync(benchResultsPath(dir))).toBe(true);
    const persisted = JSON.parse(readFileSync(benchResultsPath(dir), 'utf8'));
    expect(persisted.persistedAt).toBeTruthy();
    expect(persisted.hnsw).toHaveProperty('entries'); // doctor-compatible shape
    expect(persisted.source).toBe('rufflo demo');

    // After: doctor no longer reports "absent" — it parses demo's output.
    const after = await checkBenchmarkResults(dir);
    expect(after.message).not.toMatch(/no measured numbers/i);
    // Status is pass when HNSW/embedding present, or warn if the sandbox HNSW
    // step was unmeasurable — either way it's NOT the "absent" warn.
    expect(after.name).toBe('Perf Benchmarks');
  }, 60_000);
});
