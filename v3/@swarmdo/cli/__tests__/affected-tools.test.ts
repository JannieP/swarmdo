import { describe, it, expect } from 'vitest';
import { affectedTools } from '../src/mcp-tools/affected-tools.ts';

const tool = affectedTools.find((t) => t.name === 'affected')!;

describe('affected tool', () => {
  it('returns impacted files/tests for a changed file in this repo', async () => {
    // codegraph engine has an obvious dependent (store imports codegraph).
    const r = (await tool.handler({ changed: ['v3/@swarmdo/cli/src/codegraph/codegraph.ts'] })) as any;
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.affected)).toBe(true);
    expect(r.affected).toContain('v3/@swarmdo/cli/src/codegraph/codegraph.ts'); // itself
    expect(Array.isArray(r.tests)).toBe(true);
  });

  it('rejects a missing/invalid changed list', async () => {
    expect(((await tool.handler({})) as any).error).toBe(true);
    expect(((await tool.handler({ changed: [1, 2] })) as any).error).toBe(true);
  });

  it('is well-formed metadata in the affected category', () => {
    expect(tool.category).toBe('affected');
    expect(tool.inputSchema.required).toEqual(['changed']);
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
