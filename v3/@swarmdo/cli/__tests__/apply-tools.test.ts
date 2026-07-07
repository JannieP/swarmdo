import { describe, it, expect } from 'vitest';
import { applyTools } from '../src/mcp-tools/apply-tools.ts';

const tool = applyTools.find((t) => t.name === 'apply_patch')!;
const SRC = 'a\nb\nc\n';
const PATCH = ['--- a/f', '+++ b/f', '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'].join('\n');

describe('apply_patch tool', () => {
  it('applies a clean patch and returns the result', async () => {
    const r = (await tool.handler({ source: SRC, patch: PATCH })) as any;
    expect(r.ok).toBe(true);
    expect(r.result).toBe('a\nB\nc\n');
    expect(r.applied).toBe(1);
    expect(r.rejected).toBe(0);
  });

  it('reports a rejected hunk', async () => {
    const bad = ['--- a/f', '+++ b/f', '@@ -1,2 +1,2 @@', ' nope', '-x', '+y'].join('\n');
    const r = (await tool.handler({ source: SRC, patch: bad })) as any;
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe(1);
    expect(r.result).toBe(SRC);
  });

  it('errors on non-diff input and missing args', async () => {
    expect(((await tool.handler({ source: 'x', patch: 'not a diff' })) as any).error).toBe(true);
    expect(((await tool.handler({ patch: PATCH })) as any).error).toBe(true);
    expect(((await tool.handler({ source: SRC })) as any).error).toBe(true);
  });

  it('is well-formed metadata in the apply category', () => {
    expect(tool.category).toBe('apply');
    expect(tool.inputSchema.required).toEqual(['source', 'patch']);
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
