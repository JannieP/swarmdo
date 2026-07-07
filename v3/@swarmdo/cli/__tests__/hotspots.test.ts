import { describe, it, expect } from 'vitest';
import { parseGitLog, computeHotspots, formatHotspots } from '../src/hotspots/hotspots.ts';

const SOH = '\x01';
const US = '\x1f';
const h = (hash: string, author: string, iso: string) => `${SOH}${hash}${US}${author}${US}${iso}`;

// A small synthetic history:
//   hot.ts    — 3 commits, 3 authors, heavy churn, edited "today"
//   warm.ts   — 2 commits, 1 author, medium churn
//   cold.ts   — 1 commit, 1 author, tiny churn, old
const NOW = Date.parse('2026-07-07T00:00:00Z');
const LOG = [
  h('c1', 'alice', '2026-07-06T10:00:00Z'),
  '40\t10\thot.ts',
  '5\t0\twarm.ts',
  h('c2', 'bob', '2026-07-05T10:00:00Z'),
  '30\t20\thot.ts',
  '-\t-\timage.png', // binary → 0 churn
  h('c3', 'carol', '2026-07-04T10:00:00Z'),
  '12\t3\thot.ts',
  '8\t2\twarm.ts',
  h('c4', 'alice', '2026-01-01T10:00:00Z'),
  '1\t1\tcold.ts',
].join('\n');

describe('parseGitLog', () => {
  const commits = parseGitLog(LOG);
  it('parses commit headers and numstat lines', () => {
    expect(commits).toHaveLength(4);
    expect(commits[0]).toMatchObject({ hash: 'c1', author: 'alice' });
    expect(commits[0].files).toEqual([
      { path: 'hot.ts', added: 40, deleted: 10 },
      { path: 'warm.ts', added: 5, deleted: 0 },
    ]);
  });
  it('treats binary (-) numstat as zero churn', () => {
    const bin = commits[1].files.find((f) => f.path === 'image.png')!;
    expect(bin).toEqual({ path: 'image.png', added: 0, deleted: 0 });
  });
  it('parses ISO author dates to epoch ms', () => {
    expect(commits[0].date).toBe(Date.parse('2026-07-06T10:00:00Z'));
  });
});

describe('computeHotspots', () => {
  const spots = computeHotspots(parseGitLog(LOG), NOW);
  it('aggregates commits / churn / authors per file', () => {
    const hot = spots.find((s) => s.path === 'hot.ts')!;
    expect(hot.commits).toBe(3);
    expect(hot.churn).toBe(40 + 10 + 30 + 20 + 12 + 3);
    expect(hot.authors).toBe(3);
    expect(hot.lastTouched).toBe(Date.parse('2026-07-06T10:00:00Z'));
  });
  it('ranks the high-churn/multi-author/recent file first', () => {
    expect(spots[0].path).toBe('hot.ts');
    // cold.ts (old, single commit) must rank below warm.ts
    const warmIdx = spots.findIndex((s) => s.path === 'warm.ts');
    const coldIdx = spots.findIndex((s) => s.path === 'cold.ts');
    expect(warmIdx).toBeLessThan(coldIdx);
  });
  it('risk is a positive, deterministic number and decays with age', () => {
    const hot = spots.find((s) => s.path === 'hot.ts')!;
    const cold = spots.find((s) => s.path === 'cold.ts')!;
    expect(hot.risk).toBeGreaterThan(0);
    expect(hot.risk).toBeGreaterThan(cold.risk);
    // determinism: same inputs → same score
    expect(computeHotspots(parseGitLog(LOG), NOW)[0].risk).toBe(spots[0].risk);
  });

  it('minCommits filters out one-off files', () => {
    const spots2 = computeHotspots(parseGitLog(LOG), NOW, { minCommits: 2 });
    expect(spots2.find((s) => s.path === 'cold.ts')).toBeUndefined();
    expect(spots2.find((s) => s.path === 'image.png')).toBeUndefined();
    expect(spots2.map((s) => s.path).sort()).toEqual(['hot.ts', 'warm.ts']);
  });

  it('honors sort key and top', () => {
    const byChurn = computeHotspots(parseGitLog(LOG), NOW, { by: 'churn', top: 1 });
    expect(byChurn).toHaveLength(1);
    expect(byChurn[0].path).toBe('hot.ts'); // highest churn
  });

  it('sorts ties by path for stability', () => {
    const twoWay = [h('x', 'a', '2026-07-06T00:00:00Z'), '1\t0\tb.ts', '1\t0\ta.ts'].join('\n');
    const s = computeHotspots(parseGitLog(twoWay), NOW, { by: 'commits' });
    expect(s.map((x) => x.path)).toEqual(['a.ts', 'b.ts']); // identical stats → path asc
  });
});

describe('formatHotspots', () => {
  it('renders a ranked table with a header', () => {
    const out = formatHotspots(computeHotspots(parseGitLog(LOG), NOW), NOW);
    expect(out).toContain('rank');
    expect(out).toContain('hot.ts');
    expect(out.split('\n')[1]).toContain('hot.ts'); // first data row is the top hotspot
  });
  it('handles an empty history', () => {
    expect(formatHotspots([], NOW)).toContain('no hotspots');
  });
});
