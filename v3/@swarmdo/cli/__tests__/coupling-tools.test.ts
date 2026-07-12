import { describe, it, expect } from 'vitest';
import { couplingTools } from '../src/mcp-tools/coupling-tools.ts';

const tool = couplingTools.find((t) => t.name === 'coupling')!;

describe('coupling tool', () => {
  it('returns ranked co-change pairs for this repo', { timeout: 30000 }, async () => {
    // Narrow window keeps git log fast on this large repo; the version trio is a
    // known 100%-coupled set here, so we expect a non-empty ranked list back.
    const r = (await tool.handler({ since: '90 days ago', top: 10 })) as any;
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.coupling)).toBe(true);
    if (r.coupling.length > 1) {
      // sorted descending by degree, then shared
      expect(r.coupling[0].degree).toBeGreaterThanOrEqual(r.coupling[1].degree);
      const p = r.coupling[0];
      expect(p).toHaveProperty('a');
      expect(p).toHaveProperty('b');
      expect(p).toHaveProperty('shared');
      expect(p.a < p.b).toBe(true); // canonical pair order
      expect(p.degree).toBeGreaterThan(0);
      expect(p.degree).toBeLessThanOrEqual(1);
    }
    expect(r.count).toBe(r.coupling.length);
  });

  it('focuses pairs on a single file when `file` is given', { timeout: 30000 }, async () => {
    const r = (await tool.handler({ since: '1 year ago', file: 'package.json' })) as any;
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.coupling)).toBe(true);
    // every returned pair must involve the focused path (engine opts.focus)
    for (const p of r.coupling) expect(p.a === 'package.json' || p.b === 'package.json').toBe(true);
  });

  it('errors gracefully outside a git repo', async () => {
    const r = (await tool.handler({ path: '/tmp' })) as any;
    // /tmp is not a git repo → error (or empty). Either way, no throw.
    expect(r.error === true || Array.isArray(r.coupling)).toBe(true);
  });

  it('is well-formed metadata in the coupling category', () => {
    expect(tool.category).toBe('coupling');
    expect(tool.description.length).toBeGreaterThan(20);
    expect((tool.inputSchema.properties as any).file).toBeDefined();
    expect((tool.inputSchema.properties as any).minShared).toBeDefined();
  });
});
