import { describe, it, expect } from 'vitest';
import { computeOwnership, repoBusFactor, ownershipToCsv, formatOwnership } from '../src/ownership/ownership.ts';
import type { Commit } from '../src/hotspots/hotspots.ts';

let seq = 0;
/** one commit by `author` touching files as [path, churn] pairs (churn = added lines). */
const commit = (author: string, files: Array<[string, number]>): Commit => ({
  hash: `h${seq++}`,
  author,
  date: seq,
  files: files.map(([path, churn]) => ({ path, added: churn, deleted: 0 })),
});

// The issue #93 acceptance fixture.
const acceptance = (): Commit[] => [
  commit('Alice', [['A', 80]]),
  commit('Alice', [['A', 20]]),
  commit('Bob', [['B', 90]]),
  commit('Alice', [['B', 10]]),
  commit('Alice', [['C', 50]]),
  commit('Bob', [['C', 50]]),
];

describe('ownership: computeOwnership', () => {
  it('acceptance: per-file owner, ownership, authors, busFactor + key-person flag', () => {
    const files = computeOwnership(acceptance());
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));

    // A — Alice alone: 100% ownership, bus factor 1 (key-person risk)
    expect(byPath.A).toMatchObject({ owner: 'Alice', ownership: 1, authors: 1, churn: 100, commits: 2, busFactor: 1, keyPersonRisk: true });
    // B — Bob dominant (90/100), Alice minor: bus factor 1 (Bob alone > 50%)
    expect(byPath.B).toMatchObject({ owner: 'Bob', ownership: 0.9, authors: 2, churn: 100, commits: 2, busFactor: 1, keyPersonRisk: true });
    // C — even 50/50 split: owner Alice (churn+commits tie → name asc), bus factor 2 (neither alone > 50%)
    expect(byPath.C).toMatchObject({ owner: 'Alice', ownership: 0.5, authors: 2, churn: 100, commits: 2, busFactor: 2, keyPersonRisk: false });
  });

  it('acceptance ranking is bus-factor asc, then ownership desc, then churn desc, then path asc', () => {
    expect(computeOwnership(acceptance()).map((f) => f.path)).toEqual(['A', 'B', 'C']);
  });

  it('bus factor: a dominant author is 1; an even N-way split needs a majority', () => {
    const [dom] = computeOwnership([commit('A', [['f', 60]]), commit('B', [['f', 40]])]);
    expect(dom).toMatchObject({ owner: 'A', ownership: 0.6, busFactor: 1, keyPersonRisk: true });

    const [split] = computeOwnership([commit('A', [['g', 10]]), commit('B', [['g', 10]]), commit('C', [['g', 10]])]);
    // 10+10 = 20 > 15 (half of 30) → two of three authors clear the bar
    expect(split).toMatchObject({ owner: 'A', authors: 3, busFactor: 2, keyPersonRisk: false });
    expect(split.ownership).toBe(0.33); // 10/30 rounded to 2 dp
  });

  it('owner tie on churn is broken by more commits before name', () => {
    // Alice: 2 commits × 25 = 50 churn; Bob: 1 commit × 50 = 50 churn → tie on churn, Alice has more commits
    const [f] = computeOwnership([commit('Alice', [['g', 25]]), commit('Alice', [['g', 25]]), commit('Bob', [['g', 50]])]);
    expect(f).toMatchObject({ owner: 'Alice', ownership: 0.5, churn: 100, busFactor: 2 });
  });

  it('minChurn drops low-churn files; top limits the ranking', () => {
    const commits = [commit('A', [['low', 1]]), commit('A', [['hi', 100]])];
    expect(computeOwnership(commits, { minChurn: 2 }).map((f) => f.path)).toEqual(['hi']);
    expect(computeOwnership(acceptance(), { top: 1 })).toHaveLength(1);
  });

  it('sums a path repeated within one commit as ONE commit (rename resolution)', () => {
    const c: Commit = { hash: 'h', author: 'Alice', date: 1, files: [
      { path: 'r', added: 30, deleted: 0 }, { path: 'r', added: 20, deleted: 0 },
    ] };
    const [f] = computeOwnership([c]);
    expect(f).toMatchObject({ path: 'r', churn: 50, commits: 1, authors: 1, busFactor: 1 });
  });

  it('returns [] on empty history', () => {
    expect(computeOwnership([])).toEqual([]);
  });
});

describe('ownership: repoBusFactor', () => {
  it('acceptance: Alice owns >50% of repo churn → truck factor 1', () => {
    // Alice churn = 100(A) + 10(B) + 50(C) = 160; Bob = 90 + 50 = 140; total 300 → Alice alone > 150
    expect(repoBusFactor(acceptance())).toEqual({ authors: ['Alice'], factor: 1 });
  });

  it('an even two-author repo needs both → truck factor 2', () => {
    expect(repoBusFactor([commit('A', [['f', 50]]), commit('B', [['g', 50]])])).toEqual({ authors: ['A', 'B'], factor: 2 });
  });

  it('empty history → factor 0', () => {
    expect(repoBusFactor([])).toEqual({ authors: [], factor: 0 });
  });
});

describe('ownership: formatters', () => {
  it('ownershipToCsv emits a header + rows', () => {
    const csv = ownershipToCsv([{ path: 'x', owner: 'Al', ownership: 0.9, busFactor: 1, authors: 2, churn: 100, commits: 3, keyPersonRisk: true }]);
    expect(csv.split('\n')[0]).toBe('path,owner,ownership,busFactor,authors,churn,commits,keyPersonRisk');
    expect(csv).toContain('x,Al,0.9,1,2,100,3,true');
  });

  it('formatOwnership shows a message when empty, a table with the key-person marker otherwise', () => {
    expect(formatOwnership([])).toMatch(/no ownership data/);
    const risky = formatOwnership([{ path: 'x', owner: 'Al', ownership: 1, busFactor: 1, authors: 1, churn: 100, commits: 2, keyPersonRisk: true }]);
    expect(risky).toMatch(/key-person/);
    expect(risky).toContain('100%');
    expect(risky).toContain('Al');
    const safe = formatOwnership([{ path: 'y', owner: 'Al', ownership: 0.5, busFactor: 2, authors: 2, churn: 100, commits: 2, keyPersonRisk: false }]);
    expect(safe).not.toMatch(/key-person/);
  });
});
