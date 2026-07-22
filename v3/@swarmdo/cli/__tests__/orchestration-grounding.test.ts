/**
 * Grounding — context-injection wiring (offline, deterministic).
 * Asserts that retrieved context reaches each fan-out agent's system prompt.
 * `retrieveContext` itself is NOT unit-tested here: it drives the real ONNX+HNSW
 * search, whose cold model load is slow/flaky in CI — its bounded-timeout
 * resilience is verified by the live demonstration instead.
 */
import { describe, it, expect } from 'vitest';
import { adversarialVerify, judgePanel } from '../src/orchestration/patterns.ts';
import type { AgentExecutor } from '../src/orchestration/engine.ts';

describe('grounding — context injection', () => {
  it('adversarialVerify sets each skeptic system prompt to the context', async () => {
    const seen: (string | undefined)[] = [];
    const exec: AgentExecutor = async (input) => {
      seen.push(input.systemPrompt);
      return { success: true, output: JSON.stringify({ refuted: false }) };
    };
    await adversarialVerify('the migration is idempotent', { context: 'GROUND-CTX', executor: exec });
    expect(seen.length).toBe(3);
    expect(seen.every((s) => s === 'GROUND-CTX')).toBe(true);
  });

  it('adversarialVerify without context → no system prompt', async () => {
    const seen: (string | undefined)[] = [];
    const exec: AgentExecutor = async (input) => {
      seen.push(input.systemPrompt);
      return { success: true, output: JSON.stringify({ refuted: false }) };
    };
    await adversarialVerify('claim', { executor: exec });
    expect(seen.every((s) => s === undefined)).toBe(true);
  });

  it('judgePanel prepends the context before the persona prompt', async () => {
    const seen: (string | undefined)[] = [];
    const exec: AgentExecutor = async (input) => {
      seen.push(input.systemPrompt);
      return { success: true, output: 'answer' };
    };
    await judgePanel('what is the answer', { context: 'GROUND-CTX', executor: exec });
    expect(seen.every((s) => s?.startsWith('GROUND-CTX'))).toBe(true);
    expect(seen.some((s) => s?.includes('expert'))).toBe(true); // persona still present
  });
});
