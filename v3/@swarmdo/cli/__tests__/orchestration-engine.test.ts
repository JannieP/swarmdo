/**
 * Phase 1 spike — proves the deterministic orchestration engine + the two
 * lifted GAIA patterns work end-to-end on an injected (mock) executor: bounded
 * parallel fan-out, no-barrier pipeline, schema-validated agent output with
 * retry, adversarial-verify, and self-consistency vote. No live LLM.
 */
import { describe, it, expect } from 'vitest';
import {
  runParallel,
  runPipeline,
  callAgent,
  validateSchema,
  extractJson,
  SchemaError,
  type AgentExecutor,
  type AgentExecuteInput,
} from '../src/orchestration/engine.ts';
import { adversarialVerify, judgePanel } from '../src/orchestration/patterns.ts';

/** Deterministic mock executor: sees the full input, returns text. */
function mock(fn: (input: AgentExecuteInput) => string): AgentExecutor {
  return async (input) => ({ success: true, agentId: input.agentId, output: fn(input) });
}

describe('runParallel', () => {
  it('runs all thunks and preserves input order', async () => {
    const r = await runParallel([1, 2, 3, 4].map((n) => async () => n * 2));
    expect(r).toEqual([2, 4, 6, 8]);
  });

  it('never exceeds the concurrency cap', async () => {
    let inFlight = 0;
    let peak = 0;
    const thunks = Array.from({ length: 12 }, () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 5));
      inFlight -= 1;
      return 1;
    });
    await runParallel(thunks, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // did actually run in parallel
  });

  it('maps a throwing thunk to null and never rejects the batch', async () => {
    const r = await runParallel([
      async () => 1,
      async () => {
        throw new Error('boom');
      },
      async () => 3,
    ]);
    expect(r).toEqual([1, null, 3]);
  });
});

describe('runPipeline', () => {
  it('flows each item through every stage independently', async () => {
    const r = await runPipeline(
      [1, 2, 3],
      async (n) => (n as number) + 1,
      async (n) => (n as number) * 10,
    );
    expect(r).toEqual([20, 30, 40]);
  });

  it('passes (prev, item, index) and drops a throwing item to null', async () => {
    const r = await runPipeline(
      ['a', 'b'],
      async (_prev, item, i) => `${item}${i}`,
      async (prev) => {
        if (prev === 'b1') throw new Error('boom');
        return (prev as string).toUpperCase();
      },
    );
    expect(r).toEqual(['A0', null]);
  });
});

describe('schema helpers', () => {
  it('extracts JSON from a fenced block wrapped in prose', () => {
    expect(extractJson('sure!\n```json\n{"a":1}\n```\ndone')).toEqual({ a: 1 });
  });

  it('accepts valid objects and rejects missing keys / wrong types', () => {
    expect(() => validateSchema({ a: 'x' }, { required: ['a'], types: { a: 'string' } })).not.toThrow();
    expect(() => validateSchema({}, { required: ['a'] })).toThrow(SchemaError);
    expect(() => validateSchema({ a: 1 }, { types: { a: 'string' } })).toThrow(SchemaError);
    expect(() => validateSchema([1, 2], { required: [] })).toThrow(SchemaError);
  });
});

describe('callAgent', () => {
  it('returns raw text when no schema is given', async () => {
    const out = await callAgent('hi', { executor: mock(() => 'plain text') });
    expect(out).toBe('plain text');
  });

  it('returns validated JSON on the first try', async () => {
    const out = await callAgent('x', {
      schema: { required: ['refuted'], types: { refuted: 'boolean' } },
      executor: mock(() => '```json\n{"refuted": false}\n```'),
    });
    expect(out).toEqual({ refuted: false });
  });

  it('retries exactly once on invalid output, then succeeds', async () => {
    let calls = 0;
    const executor: AgentExecutor = async (input) => {
      calls += 1;
      return { success: true, agentId: input.agentId, output: calls === 1 ? 'no json here' : '{"refuted": true}' };
    };
    const out = await callAgent('x', { schema: { required: ['refuted'] }, executor });
    expect(out).toEqual({ refuted: true });
    expect(calls).toBe(2);
  });

  it('throws when the executor reports failure', async () => {
    const executor: AgentExecutor = async (input) => ({ success: false, agentId: input.agentId, error: 'nope' });
    await expect(callAgent('x', { executor })).rejects.toThrow('nope');
  });
});

describe('adversarialVerify (lifted GAIA critic)', () => {
  it('verifies a claim when only a minority of skeptics refute', async () => {
    // 3 lenses; only the "correctness" skeptic refutes → 1 of 3 → survives.
    const executor = mock((i) => JSON.stringify({ refuted: i.prompt.includes('"correctness"'), reason: 'r' }));
    const r = await adversarialVerify('2 + 2 = 4', { executor });
    expect(r.verified).toBe(true);
    expect(r.refutations).toBe(1);
    expect(r.rounds).toBe(3);
  });

  it('kills a claim when a majority of skeptics refute', async () => {
    const executor = mock(() => JSON.stringify({ refuted: true, reason: 'flawed' }));
    const r = await adversarialVerify('the earth is flat', { executor });
    expect(r.verified).toBe(false);
    expect(r.refutations).toBe(3);
  });
});

describe('judgePanel (lifted GAIA vote)', () => {
  it('returns the majority answer with an agreement count', async () => {
    // concise + careful say "42"; creative says "43" → winner 42, agreement 2.
    const executor = mock((i) => (i.systemPrompt?.includes('creative') ? '43' : '42'));
    const r = await judgePanel('what is the answer?', { executor });
    expect(r.winner).toBe('42');
    expect(r.agreement).toBe(2);
    expect(r.cast).toBe(3);
  });
});
