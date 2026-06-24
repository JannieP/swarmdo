/**
 * demo command tests — Sprint 1 Move 7.
 *
 * Verifies the command shape (options, examples), the JSON-output path, and
 * the gracefully-degrading reasons when subsystems are unmeasurable. Does
 * NOT exercise a real network call to Anthropic — uses `--skip-llm`.
 *
 * The HNSW + embedding-backend steps depend on the dist/ build being present;
 * in this test sandbox they'll honestly report `reason: ...` strings rather
 * than crash, which is the desired behavior.
 */

import { describe, it, expect } from 'vitest';
import { demoCommand } from '../src/commands/demo.js';

const action = demoCommand.action as NonNullable<typeof demoCommand.action>;

function makeCtx(flags: Record<string, unknown> = {}): Parameters<typeof action>[0] {
  return {
    args: [],
    flags: { _: [], ...flags } as Parameters<typeof action>[0]['flags'],
    cwd: process.cwd(),
    interactive: false,
  };
}

describe('demo command shape', () => {
  it('exports under the name "demo"', () => {
    expect(demoCommand.name).toBe('demo');
  });

  it('declares --skip-llm, --json, --verbose, --ed25519-iterations options', () => {
    const optionNames = (demoCommand.options ?? []).map(o => o.name);
    expect(optionNames).toEqual(expect.arrayContaining(['skip-llm', 'json', 'verbose', 'ed25519-iterations']));
  });

  it('description points at all four measured sections', () => {
    expect(demoCommand.description).toMatch(/HNSW/);
    expect(demoCommand.description).toMatch(/Ed25519/);
    expect(demoCommand.description).toMatch(/agent_run/);
    expect(demoCommand.description).toMatch(/bench-results/);
  });

  it('lists examples', () => {
    expect(demoCommand.examples?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('demo command behavior (skip-llm path)', () => {
  it('runs end-to-end with --skip-llm + --json and returns a structured result', async () => {
    const result = await action(makeCtx({ 'skip-llm': true, json: true, 'ed25519-iterations': 50 }));
    expect(result).toBeDefined();
    const r = result as { success: boolean; data: any };
    expect(r.success).toBe(true);
    expect(r.data).toBeDefined();
    expect(r.data.timestamp).toMatch(/^\d{4}-/);
    expect(r.data).toHaveProperty('hnsw');
    expect(r.data).toHaveProperty('ed25519');
    expect(r.data).toHaveProperty('agentRun');
    expect(r.data).toHaveProperty('embeddingBackend');
    expect(typeof r.data.durationMs).toBe('number');
  }, 60_000);

  it('honors --skip-llm by emitting a reason on agentRun without making an HTTP request', async () => {
    const result = await action(makeCtx({ 'skip-llm': true, json: true, 'ed25519-iterations': 10 }));
    const r = result as { data: { agentRun: { success: boolean; reason?: string } } };
    expect(r.data.agentRun.success).toBe(false);
    expect(r.data.agentRun.reason).toMatch(/skip-llm/);
  }, 30_000);

  it('measures real Ed25519 throughput in-process (when @noble/ed25519 is installed)', async () => {
    const result = await action(makeCtx({ 'skip-llm': true, json: true, 'ed25519-iterations': 20 }));
    const r = result as { data: { ed25519: { signsPerSecond: number | null; verifiesPerSecond: number | null; reason?: string } } };
    // We don't assert a specific throughput — just that one of (success, honest reason) holds.
    const ed = r.data.ed25519;
    if (ed.signsPerSecond !== null) {
      expect(ed.signsPerSecond).toBeGreaterThan(0);
      expect(ed.verifiesPerSecond).toBeGreaterThan(0);
    } else {
      expect(typeof ed.reason).toBe('string');
      expect(ed.reason!.length).toBeGreaterThan(0);
    }
  }, 30_000);
});
