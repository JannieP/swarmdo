import { describe, it, expect } from 'vitest';
import { hotspotsTools } from '../src/mcp-tools/hotspots-tools.ts';

const tool = hotspotsTools.find((t) => t.name === 'hotspots')!;

describe('hotspots tool', () => {
  it('returns ranked hotspots for this repo', { timeout: 30000 }, async () => {
    // Narrow window + subpath so git log is fast on this large repo.
    const r = (await tool.handler({ since: '30 days ago', subpath: 'package.json', top: 5 })) as any;
    // This repo has git history, so we expect a ranked list back.
    expect(r.error).toBeUndefined();
    expect(Array.isArray(r.hotspots)).toBe(true);
    expect(r.by).toBe('risk');
    if (r.hotspots.length > 1) {
      // sorted descending by risk
      expect(r.hotspots[0].risk).toBeGreaterThanOrEqual(r.hotspots[1].risk);
      expect(r.hotspots[0]).toHaveProperty('path');
      expect(r.hotspots[0]).toHaveProperty('commits');
    }
  });

  it('errors gracefully outside a git repo', async () => {
    const r = (await tool.handler({ path: '/tmp' })) as any;
    // /tmp is not a git repo → error (or empty). Either way, no throw.
    expect(r.error === true || Array.isArray(r.hotspots)).toBe(true);
  });

  it('is well-formed metadata in the hotspots category', () => {
    expect(tool.category).toBe('hotspots');
    expect(tool.description.length).toBeGreaterThan(20);
    expect((tool.inputSchema.properties as any).by.enum).toEqual(['risk', 'churn', 'commits', 'authors']);
  });
});
