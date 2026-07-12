import { describe, it, expect } from 'vitest';
import { computeHiddenCoupling, hiddenCouplingToCsv, formatHiddenCoupling } from '../src/coupling/hidden.ts';
import type { CouplingPair } from '../src/coupling/coupling.ts';
import type { ImportEdge } from '../src/codegraph/codegraph.ts';

// The issue #98 acceptance fixture, ranked degree-desc as computeCoupling emits.
// (CouplingPair.a is the lexicographically smaller path: 'parser.test.ts' < 'parser.ts'.)
const pairs = (): CouplingPair[] => [
  { a: 'parser.test.ts', b: 'parser.ts', shared: 6, aCommits: 6, bCommits: 6, degree: 0.9 },
  { a: 'schema.json', b: 'types.ts', shared: 8, aCommits: 10, bCommits: 8, degree: 0.8 },
  { a: 'a.ts', b: 'b.ts', shared: 5, aCommits: 5, bCommits: 5, degree: 0.7 },
];
const edge = (from: string, resolved: string | null, isTypeOnly = false): ImportEdge => ({ from, spec: './x.js', resolved, line: 1, isTypeOnly });

describe('hidden-coupling: computeHiddenCoupling', () => {
  it('acceptance: returns only the pair with NO import edge', () => {
    const imports = [edge('parser.test.ts', 'parser.ts'), edge('a.ts', 'b.ts')];
    const hidden = computeHiddenCoupling(pairs(), imports);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toMatchObject({ a: 'schema.json', b: 'types.ts', degree: 0.8, importLinked: false });
  });

  it('is direction-agnostic — a reversed edge still explains (excludes) the pair', () => {
    const importsRev = [edge('parser.ts', 'parser.test.ts'), edge('b.ts', 'a.ts')];
    const hidden = computeHiddenCoupling(pairs(), importsRev);
    expect(hidden.map((p) => `${p.a}/${p.b}`)).toEqual(['schema.json/types.ts']);
  });

  it('treats a TYPE-ONLY import as a structural link (excludes the pair)', () => {
    const hidden = computeHiddenCoupling(pairs(), [edge('schema.json', 'types.ts', true)]);
    expect(hidden.some((p) => p.a === 'schema.json' && p.b === 'types.ts')).toBe(false);
  });

  it('ignores unresolved (external) edges — resolved:null never links a pair', () => {
    const hidden = computeHiddenCoupling(pairs(), [edge('schema.json', null)]);
    expect(hidden.some((p) => p.a === 'schema.json' && p.b === 'types.ts')).toBe(true);
  });

  it('with no import graph every co-change pair is hidden, ranking preserved (degree desc)', () => {
    expect(computeHiddenCoupling(pairs(), []).map((p) => p.degree)).toEqual([0.9, 0.8, 0.7]);
  });

  it('respects top', () => {
    expect(computeHiddenCoupling(pairs(), [], { top: 2 })).toHaveLength(2);
    expect(computeHiddenCoupling([], [])).toEqual([]);
  });
});

describe('hidden-coupling: formatters', () => {
  it('hiddenCouplingToCsv emits a header + rows', () => {
    const csv = hiddenCouplingToCsv([{ a: 'x', b: 'y', shared: 3, aCommits: 4, bCommits: 5, degree: 0.75, importLinked: false }]);
    expect(csv.split('\n')[0]).toBe('fileA,fileB,degree,shared,commitsA,commitsB');
    expect(csv).toContain('x,y,0.75,3,4,5');
  });
  it('formatHiddenCoupling shows a message when empty, a table otherwise', () => {
    expect(formatHiddenCoupling([])).toMatch(/no hidden coupling/);
    const t = formatHiddenCoupling([{ a: 'x', b: 'y', shared: 3, aCommits: 4, bCommits: 4, degree: 0.75, importLinked: false }]);
    expect(t).toMatch(/x.*⇢.*y/);
    expect(t).toContain('75%');
  });
});
