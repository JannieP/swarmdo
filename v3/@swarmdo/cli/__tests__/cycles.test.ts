import { describe, it, expect } from 'vitest';
import { buildAdjacency, stronglyConnectedComponents, findCycles, formatCycles } from '../src/cycles/cycles.ts';
import type { CodeIndex, ImportEdge } from '../src/codegraph/codegraph.ts';

const edge = (from: string, resolved: string | null): ImportEdge => ({ from, spec: resolved ?? 'ext', resolved, line: 1 });
const typeEdge = (from: string, resolved: string | null): ImportEdge => ({ from, spec: resolved ?? 'ext', resolved, line: 1, isTypeOnly: true });
const mk = (edges: ImportEdge[]): CodeIndex => ({ symbols: [], imports: edges, fileCount: 0 });

describe('buildAdjacency', () => {
  it('keeps internal edges, drops externals, dedupes + sorts', () => {
    const adj = buildAdjacency(mk([edge('a.ts', 'b.ts'), edge('a.ts', 'b.ts'), edge('a.ts', 'c.ts'), edge('a.ts', null)]));
    expect(adj.get('a.ts')).toEqual(['b.ts', 'c.ts']);
    expect(adj.get('b.ts')).toEqual([]); // target promoted to a node
  });
});

describe('findCycles', () => {
  it('finds no cycles in a clean DAG', () => {
    const r = findCycles(mk([edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts'), edge('a.ts', 'c.ts')]));
    expect(r.cycles).toEqual([]);
    expect(r.selfLoops).toEqual([]);
  });

  it('detects a 2-node cycle', () => {
    const r = findCycles(mk([edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts')]));
    expect(r.cycles).toEqual([['a.ts', 'b.ts']]);
  });

  it('detects a 3-node cycle', () => {
    const r = findCycles(mk([edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts'), edge('c.ts', 'a.ts')]));
    expect(r.cycles).toEqual([['a.ts', 'b.ts', 'c.ts']]);
  });

  it('detects a self-import as a one-node cycle', () => {
    const r = findCycles(mk([edge('a.ts', 'a.ts'), edge('a.ts', 'b.ts')]));
    expect(r.selfLoops).toEqual(['a.ts']);
    expect(r.cycles).toEqual([]);
  });

  it('ignores a cycle formed purely by `import type` edges (default)', () => {
    // a ⇄ b but BOTH edges are type-only → erased at compile time → not a runtime cycle
    const r = findCycles(mk([typeEdge('a.ts', 'b.ts'), typeEdge('b.ts', 'a.ts')]));
    expect(r.cycles).toEqual([]);
  });

  it('counts a type-only cycle with --include-type-only (strict view)', () => {
    const r = findCycles(mk([typeEdge('a.ts', 'b.ts'), typeEdge('b.ts', 'a.ts')]), { includeTypeOnly: true });
    expect(r.cycles).toEqual([['a.ts', 'b.ts']]);
  });

  it('breaks the cycle when one DIRECTION is only reachable via a type-only edge', () => {
    // a→b is type-only (no runtime edge), only b→a is a value import → at
    // runtime a never reaches b, so there is genuinely no cycle.
    const r = findCycles(mk([typeEdge('a.ts', 'b.ts'), edge('b.ts', 'a.ts')]));
    expect(r.cycles).toEqual([]);
  });

  it('keeps the cycle when a value edge coexists with a redundant type-only edge on the same direction', () => {
    // a→b has both a value and a type-only import; b→a is a value import → real cycle
    const r = findCycles(mk([edge('a.ts', 'b.ts'), typeEdge('a.ts', 'b.ts'), edge('b.ts', 'a.ts')]));
    expect(r.cycles).toEqual([['a.ts', 'b.ts']]);
  });

  it('finds two disjoint cycles and orders by size desc', () => {
    const r = findCycles(
      mk([
        edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts'), // 2-node
        edge('x.ts', 'y.ts'), edge('y.ts', 'z.ts'), edge('z.ts', 'x.ts'), // 3-node
        edge('leaf.ts', 'a.ts'), // acyclic feeder — must not join a cycle
      ]),
    );
    expect(r.cycles).toEqual([['x.ts', 'y.ts', 'z.ts'], ['a.ts', 'b.ts']]);
    expect(r.cycles.map((c) => c.includes('leaf.ts'))).toEqual([false, false]);
  });

  it('does not report a diamond DAG as cyclic', () => {
    const r = findCycles(mk([edge('top.ts', 'l.ts'), edge('top.ts', 'r.ts'), edge('l.ts', 'bot.ts'), edge('r.ts', 'bot.ts')]));
    expect(r.cycles).toEqual([]);
  });

  it('is deterministic across runs', () => {
    const g = mk([edge('a.ts', 'b.ts'), edge('b.ts', 'c.ts'), edge('c.ts', 'a.ts')]);
    expect(JSON.stringify(findCycles(g))).toBe(JSON.stringify(findCycles(g)));
  });
});

describe('stronglyConnectedComponents', () => {
  it('returns every node in some component (partition)', () => {
    const adj = buildAdjacency(mk([edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts'), edge('c.ts', 'a.ts')]));
    const all = stronglyConnectedComponents(adj).flat().sort();
    expect(all).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});

describe('formatCycles', () => {
  it('reports a clean graph', () => {
    expect(formatCycles({ cycles: [], selfLoops: [] })).toContain('no circular imports');
  });
  it('renders cycles + self-loops with a count', () => {
    const out = formatCycles({ cycles: [['a.ts', 'b.ts']], selfLoops: ['s.ts'] });
    expect(out).toContain('cycle 1 (2 files)');
    expect(out).toContain('self-import: s.ts');
    expect(out).toContain('2 circular dependencies found');
  });
});
