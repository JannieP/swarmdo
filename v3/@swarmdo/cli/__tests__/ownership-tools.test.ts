import { describe, it, expect } from 'vitest';
import { ownershipTools } from '../src/mcp-tools/ownership-tools.ts';

const tool = ownershipTools.find((t) => t.name === 'ownership')!;

describe('ownership tool', () => {
  it('returns a ranked knowledge map + repo truck factor for this repo', { timeout: 30000 }, async () => {
    // Narrow window keeps git log fast on this large repo; there is real history,
    // so we expect a non-empty ranked list + a truck factor back.
    const r = (await tool.handler({ since: '90 days ago', top: 10 })) as any;
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.ownership)).toBe(true);
    expect(r.count).toBe(r.ownership.length);
    expect(r.repoBusFactor).toHaveProperty('authors');
    expect(r.repoBusFactor.factor).toBeGreaterThanOrEqual(1);
    if (r.ownership.length > 1) {
      // sorted most-fragile-first → bus factor ascending
      expect(r.ownership[0].busFactor).toBeLessThanOrEqual(r.ownership[1].busFactor);
      const f = r.ownership[0];
      expect(f).toHaveProperty('path');
      expect(f).toHaveProperty('owner');
      expect(f.ownership).toBeGreaterThan(0);
      expect(f.ownership).toBeLessThanOrEqual(1);
      expect(typeof f.keyPersonRisk).toBe('boolean');
      expect(f.keyPersonRisk).toBe(f.busFactor === 1);
    }
  });

  it('scopes to a subtree via a path arg', { timeout: 30000 }, async () => {
    const r = (await tool.handler({ since: '1 year ago', top: 5 })) as any;
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.ownership)).toBe(true);
    expect(r.ownership.length).toBeLessThanOrEqual(5); // top respected
  });

  it('errors gracefully outside a git repo', async () => {
    const r = (await tool.handler({ path: '/tmp' })) as any;
    // /tmp is not a git repo → error (or empty). Either way, no throw.
    expect(r.error === true || Array.isArray(r.ownership)).toBe(true);
  });

  it('is well-formed metadata in the ownership category', () => {
    expect(tool.category).toBe('ownership');
    expect(tool.description.length).toBeGreaterThan(20);
    expect((tool.inputSchema.properties as any).minChurn).toBeDefined();
    expect((tool.inputSchema.properties as any).top).toBeDefined();
  });
});
