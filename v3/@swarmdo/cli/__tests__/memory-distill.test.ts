/**
 * distill.ts — L0→L1 memory distillation engine (ADR-155).
 *
 * Engine-first, ZERO billable calls:
 *  - extractFacts always gets a FAKE `runClaude`, so no real `claude` process is
 *    ever spawned (the whole prompt → JSON-extract → validate → clamp pipeline is
 *    exercised against canned model replies).
 *  - sessionTurns runs against a temp `.jsonl` fixture.
 *  - storeFacts uses a temp sql.js DB with the AgentDB bridge disabled
 *    (SWARMDO_DISABLE_BRIDGE=1) and no transformers installed → the deterministic
 *    local embedder, so the semantic dedup (identical text → cosine ≥ 0.9) is
 *    exercised offline and fast.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sessionTurns,
  extractFacts,
  storeFacts,
  type SessionTurn,
  type RunClaudeReq,
  type RunClaudeResult,
} from '../src/memory/distill.js';

// A fake runner factory — canned text/cost, zero billable calls.
const fakeRunner =
  (text: string, costUsd = 0, error?: string) =>
  (_req: RunClaudeReq): RunClaudeResult => ({ text, costUsd, ...(error ? { error } : {}) });

const baseOpts = {
  turns: [{ role: 'user', text: 'hi' }] as SessionTurn[],
  maxFacts: 40,
  model: 'haiku',
  budgetUsd: 0.5,
  timeoutMs: 1000,
};

describe('distill: extractFacts (injected fake runner, no billable calls)', () => {
  it('parses a clean fact array, coercing turn/category and dropping empty facts', async () => {
    const reply = JSON.stringify([
      { fact: 'Use JWT for auth', turn: 2, category: 'decision' },
      { fact: 'Prefer TDD London', turn: '3' }, // string turn → 3; missing category → 'general'
      { fact: '', turn: 1, category: 'junk' }, // empty fact → dropped + warning
      { turn: 4, category: 'nope' }, // missing fact → dropped + warning
    ]);
    const r = await extractFacts({ ...baseOpts, runClaude: fakeRunner(reply, 0.01) });

    expect(r.facts).toEqual([
      { fact: 'Use JWT for auth', turn: 2, category: 'decision' },
      { fact: 'Prefer TDD London', turn: 3, category: 'general' },
    ]);
    expect(r.costUsd).toBe(0.01); // cost threaded through
    expect(r.warnings.filter((w) => /missing fact text/.test(w))).toHaveLength(2);
  });

  it('parses JSON wrapped in ```json fences and surrounding prose', async () => {
    const reply =
      'Here are the facts:\n```json\n[{"fact":"Repo uses vitest","turn":0,"category":"location"}]\n```\nDone.';
    const r = await extractFacts({ ...baseOpts, runClaude: fakeRunner(reply) });

    expect(r.facts).toHaveLength(1);
    expect(r.facts[0]).toEqual({ fact: 'Repo uses vitest', turn: 0, category: 'location' });
    expect(r.warnings).toHaveLength(0);
  });

  it('returns no facts (with a warning) for non-array JSON like {}', async () => {
    const r = await extractFacts({ ...baseOpts, runClaude: fakeRunner('{}') });

    expect(r.facts).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.join()).toMatch(/no JSON array/);
  });

  it('returns no facts (with a warning) for non-JSON text', async () => {
    const r = await extractFacts({ ...baseOpts, runClaude: fakeRunner('not json') });

    expect(r.facts).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('returns no facts (with a warning) when a bracketed body is not valid JSON', async () => {
    // extractJsonArray returns the "[…]" substring, but JSON.parse then fails —
    // a distinct warning branch from the "no JSON array" case above.
    const r = await extractFacts({ ...baseOpts, runClaude: fakeRunner('[not, valid, json]') });

    expect(r.facts).toEqual([]);
    expect(r.warnings.join()).toMatch(/not valid JSON/);
  });

  it('surfaces a runner error as a warning without throwing, threading cost', async () => {
    const r = await extractFacts({
      ...baseOpts,
      runClaude: fakeRunner('', 0.002, 'claude exited with status 1'),
    });

    expect(r.facts).toEqual([]);
    expect(r.warnings).toContain('claude exited with status 1');
    expect(r.costUsd).toBe(0.002);
  });

  it('clamps to maxFacts and warns, threading cost', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      fact: `fact ${i}`,
      turn: i,
      category: 'note',
    }));
    const r = await extractFacts({
      ...baseOpts,
      maxFacts: 2,
      runClaude: fakeRunner(JSON.stringify(many), 0.05),
    });

    expect(r.facts).toHaveLength(2);
    expect(r.warnings.join()).toMatch(/clamped/);
    expect(r.costUsd).toBe(0.05);
  });
});

describe('distill: sessionTurns (fixture .jsonl)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarmdo-distill-turns-'));
  });
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('keeps user/assistant turns in order; strips reminders; drops empty/summary/malformed lines', () => {
    const file = join(dir, 'session.jsonl');
    const lines = [
      // user turn wrapped in a <system-reminder> — reminder stripped, real text kept
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: '<system-reminder>Injected codebase context</system-reminder>How do I add auth?',
        },
      }),
      // assistant text turn (array content flattened by contentToText)
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Use JWT tokens.' }] },
      }),
      // a summary line (no message.role) — skipped
      JSON.stringify({ type: 'summary', summary: 'Session about auth' }),
      // user turn that is ONLY a tool_result block (no text) — dropped as empty
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', content: 'file contents', is_error: false }],
        },
      }),
      // malformed non-JSON line — skipped
      'this is not json {{{',
    ];
    writeFileSync(file, `${lines.join('\n')}\n`);

    const turns = sessionTurns(file);

    expect(turns).toEqual([
      { role: 'user', text: 'How do I add auth?' },
      { role: 'assistant', text: 'Use JWT tokens.' },
    ]);
  });
});

describe('distill: storeFacts (temp sql.js DB, semantic dedup)', () => {
  let dir: string;
  let dbPath: string;
  let prevMemPath: string | undefined;
  let prevDisableBridge: string | undefined;
  let prevRequireReal: string | undefined;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'swarmdo-distill-store-'));
    dbPath = join(dir, 'memory.db');

    prevMemPath = process.env.SWARMDO_MEMORY_PATH;
    prevDisableBridge = process.env.SWARMDO_DISABLE_BRIDGE;
    prevRequireReal = process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS;

    process.env.SWARMDO_MEMORY_PATH = dir; // isolated store
    // Force the raw sql.js path (no AgentDB bridge → no network-bound model
    // fetch) so the store/search runs on the local deterministic embedder.
    process.env.SWARMDO_DISABLE_BRIDGE = '1';
    // Permit the hash last-resort so no embedder tier can throw offline.
    delete process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS;

    const m = await import('../src/memory/memory-initializer.js');
    const init = (await m.initializeMemoryDatabase({ dbPath })) as { success: boolean };
    expect(init.success).toBe(true);
  });

  afterEach(() => {
    if (prevMemPath === undefined) delete process.env.SWARMDO_MEMORY_PATH;
    else process.env.SWARMDO_MEMORY_PATH = prevMemPath;
    if (prevDisableBridge === undefined) delete process.env.SWARMDO_DISABLE_BRIDGE;
    else process.env.SWARMDO_DISABLE_BRIDGE = prevDisableBridge;
    if (prevRequireReal === undefined) delete process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS;
    else process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS = prevRequireReal;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('stores a new fact, then skips the same fact text as a near-duplicate', async () => {
    const fact = {
      fact: 'The distill engine lives in src/memory/distill.ts',
      turn: 5,
      category: 'location',
    };
    const call = () =>
      storeFacts({
        facts: [fact],
        sessionId: 's1',
        transcript: '/t.jsonl',
        namespace: 'distilled-test',
        dbPath,
      });

    const first = await call();
    expect(first).toMatchObject({ stored: 1, skipped: 0 });
    expect(first.keys).toHaveLength(1);

    // Same fact text again → semantic dedup (threshold 0.9) skips it.
    const second = await call();
    expect(second).toMatchObject({ stored: 0, skipped: 1 });
    expect(second.keys).toHaveLength(0);
  }, 60_000);
});
