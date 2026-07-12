import { describe, it, expect } from 'vitest';
import { computeCoupling, couplingToCsv, formatCoupling } from '../src/coupling/coupling.ts';
import type { Commit } from '../src/hotspots/hotspots.ts';

let seq = 0;
const commit = (paths: string[]): Commit => ({
  hash: `h${seq++}`, author: 'x', date: seq,
  files: paths.map((p) => ({ path: p, added: 1, deleted: 0 })),
});
const rep = (n: number, paths: string[]): Commit[] => Array.from({ length: n }, () => commit(paths));

describe('coupling: computeCoupling', () => {
  it('acceptance: (A,B) shared 8, degree 1.0 ranked first; (C,D) shared 3 excluded by min-shared 5', () => {
    const commits = [
      ...rep(8, ['A', 'B']), // A & B co-occur 8×
      ...rep(2, ['A']),      // A alone 2×  → A=10, B=8
      ...rep(3, ['C', 'D']), // C & D co-occur 3×
    ];
    const pairs = computeCoupling(commits, { minShared: 5 });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ a: 'A', b: 'B', shared: 8, aCommits: 10, bCommits: 8, degree: 1 });
  });

  it('degree = shared / min(commits) — partial coupling', () => {
    const commits = [...rep(2, ['F', 'G']), ...rep(2, ['F']), ...rep(2, ['G'])]; // F=4, G=4, shared=2
    const [p] = computeCoupling(commits, { minShared: 1 });
    expect(p).toMatchObject({ a: 'F', b: 'G', shared: 2, aCommits: 4, bCommits: 4, degree: 0.5 });
  });

  it('skips sweeping commits over --max-files (noise reduction)', () => {
    const wide = Array.from({ length: 31 }, (_, i) => `w${i}`);
    const commits = [commit(wide), ...rep(2, ['A', 'B'])];
    // the 31-file sweep contributes NO pairs/counts under a 30-file cap
    expect(computeCoupling(commits, { minShared: 1, maxFiles: 30 }))
      .toEqual([{ a: 'A', b: 'B', shared: 2, aCommits: 2, bCommits: 2, degree: 1 }]);
    // lifting the cap lets the wide commit's pairs through
    expect(computeCoupling(commits, { minShared: 1, maxFiles: 0 }).length).toBeGreaterThan(1);
  });

  it('focus keeps only pairs involving the given path', () => {
    const commits = [...rep(3, ['A', 'B']), ...rep(3, ['A', 'C']), ...rep(3, ['B', 'C'])];
    const pairs = computeCoupling(commits, { minShared: 1, focus: 'A' });
    expect(pairs.every((p) => p.a === 'A' || p.b === 'A')).toBe(true);
    expect(pairs.map((p) => `${p.a}/${p.b}`).sort()).toEqual(['A/B', 'A/C']);
  });

  it('is deterministic: degree desc, then shared desc, then path order', () => {
    const commits = [
      ...rep(4, ['A', 'B']), // degree 1.0
      ...rep(4, ['C', 'D']), // degree 1.0 — ties A/B, path order breaks it
      ...rep(2, ['E', 'F']), ...rep(2, ['E']), ...rep(2, ['F']), // degree 0.5
    ];
    expect(computeCoupling(commits, { minShared: 1 }).map((p) => `${p.a}/${p.b}`))
      .toEqual(['A/B', 'C/D', 'E/F']);
  });

  it('respects top and returns [] on empty history', () => {
    expect(computeCoupling([], {})).toEqual([]);
    const commits = [...rep(3, ['A', 'B']), ...rep(3, ['C', 'D'])];
    expect(computeCoupling(commits, { minShared: 1, top: 1 })).toHaveLength(1);
  });

  it('dedupes a path repeated within one commit (rename resolution)', () => {
    const c: Commit = { hash: 'h', author: 'x', date: 1, files: [
      { path: 'A', added: 1, deleted: 0 }, { path: 'A', added: 2, deleted: 0 }, { path: 'B', added: 1, deleted: 0 },
    ] };
    const pairs = computeCoupling([c, ...rep(1, ['A', 'B'])], { minShared: 1 });
    expect(pairs[0]).toMatchObject({ a: 'A', b: 'B', shared: 2, aCommits: 2, bCommits: 2 });
  });
});

describe('coupling: formatters', () => {
  it('couplingToCsv emits a header + rows', () => {
    const csv = couplingToCsv([{ a: 'x', b: 'y', shared: 3, aCommits: 4, bCommits: 5, degree: 0.75 }]);
    expect(csv.split('\n')[0]).toBe('fileA,fileB,degree,shared,commitsA,commitsB');
    expect(csv).toContain('x,y,0.75,3,4,5');
  });
  it('formatCoupling shows a message when empty, a table otherwise', () => {
    expect(formatCoupling([])).toMatch(/no co-change coupling/);
    const t = formatCoupling([{ a: 'x', b: 'y', shared: 3, aCommits: 4, bCommits: 4, degree: 0.75 }]);
    expect(t).toMatch(/x.*↔.*y/);
    expect(t).toContain('75%');
  });
});
