import { describe, it, expect } from 'vitest';
import {
  errorSignature,
  blockText,
  newAccum,
  foldLine,
  finalizeReport,
  type ParsedLine,
} from '../src/usage/transcript-errors.ts';

describe('transcript-errors: errorSignature', () => {
  it('keeps the first non-empty line', () => {
    expect(errorSignature('  \nActual error here\nstack trace line')).toBe('Actual error here');
  });
  it('collapses quoted values so path-bearing errors group', () => {
    const a = errorSignature("EISDIR: illegal operation on a directory, read '/Users/jane/Projects/x'");
    const b = errorSignature("EISDIR: illegal operation on a directory, read '/Users/bob/other/y'");
    expect(a).toBe(b);
    expect(a).toContain("'…'");
  });
  it('collapses line numbers and bare paths so like errors group', () => {
    const a = errorSignature('Error at /Users/jane/src/app.ts:42:10 — undefined');
    const b = errorSignature('Error at /Users/bob/src/app.ts:99:3 — undefined');
    expect(a).toBe(b);
    expect(a).toContain('<path>');
  });
  it('handles empty input', () => {
    expect(errorSignature('')).toBe('(empty error)');
  });
  it('truncates very long lines', () => {
    expect(errorSignature('x'.repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe('transcript-errors: blockText', () => {
  it('returns strings as-is', () => {
    expect(blockText('boom')).toBe('boom');
  });
  it('joins array text blocks', () => {
    expect(blockText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a b');
  });
  it('returns empty for other shapes', () => {
    expect(blockText(null)).toBe('');
    expect(blockText(42)).toBe('');
    expect(blockText([{ type: 'image' }])).toBe('');
  });
});

/** Build an assistant tool_use line + a user tool_result line. */
function toolUse(id: string, name: string): ParsedLine {
  return { type: 'assistant', sessionId: 's1', message: { role: 'assistant', content: [{ type: 'tool_use', id, name }] } };
}
function toolResult(id: string, isError: boolean, content: string, sid = 's1'): ParsedLine {
  return { type: 'user', sessionId: sid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } };
}

describe('transcript-errors: fold + finalize', () => {
  it('correlates tool_use → tool_result and counts per tool', () => {
    const acc = newAccum();
    for (const l of [
      toolUse('t1', 'Bash'), toolResult('t1', false, 'ok'),
      toolUse('t2', 'Bash'), toolResult('t2', true, 'command failed'),
      toolUse('t3', 'Edit'), toolResult('t3', true, 'file not found'),
    ]) foldLine(acc, l);
    const r = finalizeReport(acc, 1);
    expect(r.totalCalls).toBe(3);
    expect(r.totalErrors).toBe(2);
    const bash = r.tools.find((t) => t.tool === 'Bash')!;
    expect(bash.calls).toBe(2);
    expect(bash.errors).toBe(1);
    expect(bash.errorRate).toBeCloseTo(0.5);
  });

  it('sorts tools by errors desc', () => {
    const acc = newAccum();
    for (const l of [
      toolUse('a', 'Read'), toolResult('a', false, 'ok'),
      toolUse('b', 'Bash'), toolResult('b', true, 'e1'),
      toolUse('c', 'Bash'), toolResult('c', true, 'e2'),
    ]) foldLine(acc, l);
    const r = finalizeReport(acc, 1);
    expect(r.tools[0].tool).toBe('Bash'); // 2 errors first
  });

  it('buckets identical error signatures across tools', () => {
    const acc = newAccum();
    for (const l of [
      toolUse('a', 'Bash'), toolResult('a', true, "EISDIR: read '/Users/jane/x'"),
      toolUse('b', 'Bash'), toolResult('b', true, "EISDIR: read '/Users/bob/y'"),
    ]) foldLine(acc, l);
    const r = finalizeReport(acc, 1);
    // both normalize to the same signature → one bucket, count 2
    expect(r.topErrors).toHaveLength(1);
    expect(r.topErrors[0].count).toBe(2);
  });

  it('labels tool_result with no matching tool_use as unknown', () => {
    const acc = newAccum();
    foldLine(acc, toolResult('orphan', true, 'lost'));
    const r = finalizeReport(acc, 1);
    expect(r.tools[0].tool).toBe('unknown');
  });

  it('tracks distinct sessions with errors', () => {
    const acc = newAccum();
    for (const l of [
      toolUse('a', 'Bash'), toolResult('a', true, 'e', 's1'),
      toolUse('b', 'Bash'), toolResult('b', true, 'e', 's2'),
      toolUse('c', 'Bash'), toolResult('c', true, 'e', 's2'),
    ]) foldLine(acc, l);
    const r = finalizeReport(acc, 1);
    expect(r.sessionsWithErrors).toBe(2);
  });

  it('ignores lines without array content', () => {
    const acc = newAccum();
    foldLine(acc, { type: 'summary', message: { content: 'a plain string' } });
    foldLine(acc, { type: 'system' });
    const r = finalizeReport(acc, 1);
    expect(r.totalCalls).toBe(0);
  });

  it('reports zero cleanly when there are no tool calls', () => {
    const r = finalizeReport(newAccum(), 5);
    expect(r).toMatchObject({ totalCalls: 0, totalErrors: 0, filesScanned: 5, sessionsWithErrors: 0 });
    expect(r.tools).toEqual([]);
    expect(r.topErrors).toEqual([]);
  });
});
