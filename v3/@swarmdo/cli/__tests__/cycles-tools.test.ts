import { describe, it, expect } from 'vitest';
import { cyclesTools } from '../src/mcp-tools/cycles-tools.ts';

const tool = cyclesTools.find((t) => t.name === 'cycles')!;

describe('cycles tool', () => {
  it('returns a cycle report for this repo (shape check)', async () => {
    const r = (await tool.handler({})) as any;
    expect(r.error).toBeUndefined();
    expect(typeof r.count).toBe('number');
    expect(Array.isArray(r.cycles)).toBe(true);
    expect(Array.isArray(r.selfLoops)).toBe(true);
    // count is the sum of cyclic groups + self-loops
    expect(r.count).toBe(r.cycles.length + r.selfLoops.length);
  });

  it('is well-formed metadata in the cycles category', () => {
    expect(tool.category).toBe('cycles');
    expect(tool.description.length).toBeGreaterThan(20);
    expect(tool.tags).toContain('circular');
  });
});
