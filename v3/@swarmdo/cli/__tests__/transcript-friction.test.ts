import { describe, it, expect } from 'vitest';
import {
  isInterruptionText,
  classifyError,
  newFrictionAccum,
  foldFriction,
  finalizeFriction,
  IDLE_CONTEXT,
  type ErrorCategory,
} from '../src/usage/transcript-friction.ts';
import type { ParsedLine } from '../src/usage/transcript-errors.ts';

// ── line fixtures (shape mirrors real transcript JSONL) ──────────────────────
const assistantText = (text: string): ParsedLine => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const toolUse = (id: string, name: string): ParsedLine => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name }] } });
const toolResult = (id: string, isError = false, content = ''): ParsedLine => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } });
// real interruptions arrive as a user message whose sole text block is the sentinel
const interruption = (text = '[Request interrupted by user]'): ParsedLine => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });

const fold = (lines: ParsedLine[]) => {
  const acc = newFrictionAccum();
  for (const l of lines) foldFriction(acc, l);
  return finalizeFriction(acc, lines.length);
};

describe('isInterruptionText', () => {
  it('matches the whole sentinel family at the start', () => {
    expect(isInterruptionText('[Request interrupted by user]')).toBe(true);
    expect(isInterruptionText('[Request interrupted by user for tool use]')).toBe(true);
    expect(isInterruptionText('[Request interrupted by user...]')).toBe(true);
    expect(isInterruptionText('Request interrupted')).toBe(true);
    expect(isInterruptionText('  [request interrupted by user]')).toBe(true); // lenient ws/case
  });
  it('does NOT match an incidental mid-sentence mention or normal text', () => {
    expect(isInterruptionText('please do not let the request interrupted state persist')).toBe(false);
    expect(isInterruptionText('run the tests')).toBe(false);
    expect(isInterruptionText('')).toBe(false);
  });
});

describe('classifyError', () => {
  const cases: Array<[string, ErrorCategory]> = [
    ['ENOENT: no such file or directory, open /tmp/x', 'NotFound'],
    ['File not found', 'NotFound'],
    ['EACCES: permission denied', 'Permission'],
    ['Error: operation not permitted', 'Permission'],
    ['Error: connect ETIMEDOUT 1.2.3.4:443', 'Timeout'],
    ['request timed out after 30s', 'Timeout'],
    ['connect ECONNREFUSED 127.0.0.1:3000', 'Network'],
    ['getaddrinfo ENOTFOUND api.example.com', 'Network'],
    ['SyntaxError: Unexpected token }', 'Syntax'],
    ['TypeError: cannot read properties of undefined', 'Syntax'],
    ['something totally unexpected happened', 'Other'],
  ];
  it.each(cases)('classifies %j as %s', (msg, cat) => {
    expect(classifyError(msg)).toBe(cat);
  });
  it('prefers NotFound over Syntax for "no such file" (order matters)', () => {
    expect(classifyError('no such file — invalid path')).toBe('NotFound');
  });
});

describe('foldFriction — interruption rate (AC1)', () => {
  it('counts interruptions and the rate over assistant turns', () => {
    const r = fold([assistantText('working…'), assistantText('still working…'), interruption()]);
    expect(r.interruptions).toBe(1);
    expect(r.assistantTurns).toBe(2);
    expect(r.interruptionRate).toBe(0.5);
  });
  it('does no filesystem access in the fold (pure) — accumulator only', () => {
    const acc = newFrictionAccum();
    foldFriction(acc, interruption());
    expect(acc.interruptions).toBe(1); // no throw, no fs
  });
});

describe('foldFriction — attribution (AC2)', () => {
  it('attributes an interruption to the tool that was still running', () => {
    const r = fold([toolUse('t1', 'Bash'), interruption('[Request interrupted by user for tool use]')]);
    expect(r.byTool).toEqual([{ tool: 'Bash', interruptions: 1 }]);
  });
  it('attributes to (idle) when the last tool completed and the sentinel is plain', () => {
    const r = fold([toolUse('t1', 'Bash'), toolResult('t1'), interruption()]);
    expect(r.byTool).toEqual([{ tool: IDLE_CONTEXT, interruptions: 1 }]);
  });
  it('uses the "for tool use" sentinel to attribute even after a (synthetic) result landed', () => {
    const r = fold([toolUse('t1', 'Bash'), toolResult('t1'), interruption('[Request interrupted by user for tool use]')]);
    expect(r.byTool).toEqual([{ tool: 'Bash', interruptions: 1 }]);
  });
  it('picks the last-opened tool when several run in parallel', () => {
    const r = fold([toolUse('a', 'Read'), toolUse('b', 'Grep'), interruption()]);
    expect(r.byTool[0]).toEqual({ tool: 'Grep', interruptions: 1 });
  });
  it('sorts byTool by interruption count, desc', () => {
    const r = fold([
      toolUse('1', 'Bash'), interruption(),
      toolUse('2', 'Bash'), interruption(),
      toolUse('3', 'Edit'), interruption(),
    ]);
    expect(r.byTool).toEqual([{ tool: 'Bash', interruptions: 2 }, { tool: 'Edit', interruptions: 1 }]);
  });
});

describe('foldFriction — error categories (AC3)', () => {
  it('buckets tool errors and shares sum to 1', () => {
    const r = fold([
      toolResult('a', true, 'ENOENT: no such file'),
      toolResult('b', true, 'EACCES: permission denied'),
      toolResult('c', true, 'ENOENT: no such file or directory'),
      toolResult('d', false, 'ok'), // success — not counted
    ]);
    expect(r.totalErrors).toBe(3);
    const byCat = Object.fromEntries(r.categories.map((c) => [c.category, c.count]));
    expect(byCat).toEqual({ NotFound: 2, Permission: 1 });
    const shareSum = r.categories.reduce((s, c) => s + c.share, 0);
    expect(shareSum).toBeCloseTo(1, 10);
    expect(r.categories[0]).toMatchObject({ category: 'NotFound', count: 2 });
  });
});

describe('finalizeFriction — empty / zero-interruption safety (AC5)', () => {
  it('never divides by zero and returns empty tables', () => {
    const r = finalizeFriction(newFrictionAccum(), 0);
    expect(r).toEqual({
      interruptions: 0,
      assistantTurns: 0,
      interruptionRate: 0,
      byTool: [],
      categories: [],
      totalErrors: 0,
      filesScanned: 0,
    });
  });
  it('rate is 0 when there are interruptions but no assistant turns', () => {
    const r = fold([interruption()]);
    expect(r.interruptionRate).toBe(0);
    expect(r.interruptions).toBe(1);
  });
});
