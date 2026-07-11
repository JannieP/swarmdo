import { describe, it, expect } from 'vitest';
import { isTestFile, reverseDeps, computeAffected } from '../src/affected/affected.ts';
import type { CodeIndex, ImportEdge } from '../src/codegraph/codegraph.ts';

const edge = (from: string, resolved: string | null): ImportEdge => ({ from, spec: resolved ?? 'external', resolved, line: 1 });

// Graph:  api.ts → service.ts → util.ts
//         util.test.ts → util.ts,  service.test.ts → service.ts
//         unrelated.ts → (external)
const INDEX: CodeIndex = {
  symbols: [
    { file: 'util.ts', name: 'u', kind: 'function', line: 1, signature: '' } as any,
    { file: 'service.ts', name: 's', kind: 'function', line: 1, signature: '' } as any,
  ],
  imports: [
    edge('service.ts', 'util.ts'),
    edge('api.ts', 'service.ts'),
    edge('util.test.ts', 'util.ts'),
    edge('service.test.ts', 'service.ts'),
    edge('unrelated.ts', null),
  ],
  fileCount: 6,
};

describe('isTestFile', () => {
  it('matches common test conventions', () => {
    expect(isTestFile('foo.test.ts')).toBe(true);
    expect(isTestFile('foo.spec.tsx')).toBe(true);
    expect(isTestFile('src/__tests__/foo.ts')).toBe(true);
    expect(isTestFile('foo.test.mjs')).toBe(true);
    expect(isTestFile('foo.ts')).toBe(false);
    expect(isTestFile('contest.ts')).toBe(false); // not a *.test.*
  });
  it('does not classify non-code files under __tests__/ as tests (docs, fixtures)', () => {
    // these get piped to the test runner as a pathspec — a .md/.json there is a
    // no-op or "no test files found" failure. Only JS/TS under __tests__/ counts.
    expect(isTestFile('__tests__/README.md')).toBe(false);
    expect(isTestFile('__tests__/fixtures/data.json')).toBe(false);
    expect(isTestFile('src/__tests__/helper.ts')).toBe(true); // a real code helper still counts
  });
});

describe('reverseDeps', () => {
  it('inverts import edges, ignoring externals', () => {
    const rev = reverseDeps(INDEX);
    expect(rev.get('util.ts')!.sort()).toEqual(['service.ts', 'util.test.ts']);
    expect(rev.get('service.ts')!.sort()).toEqual(['api.ts', 'service.test.ts']);
    expect(rev.has(null as any)).toBe(false);
  });
});

describe('computeAffected', () => {
  it('walks the reverse-dependency closure from a leaf change', () => {
    const r = computeAffected(['util.ts'], INDEX);
    expect(r.affected).toEqual(['api.ts', 'service.test.ts', 'service.ts', 'util.test.ts', 'util.ts']);
    expect(r.tests).toEqual(['service.test.ts', 'util.test.ts']);
    expect(r.unknown).toEqual([]);
  });

  it('narrows correctly for a mid-graph change', () => {
    const r = computeAffected(['service.ts'], INDEX);
    expect(r.affected).toEqual(['api.ts', 'service.test.ts', 'service.ts']);
    expect(r.tests).toEqual(['service.test.ts']);
  });

  it('a top-level change affects only itself', () => {
    const r = computeAffected(['api.ts'], INDEX);
    expect(r.affected).toEqual(['api.ts']);
    expect(r.tests).toEqual([]);
  });

  it('flags a changed file the index has never seen as unknown', () => {
    const r = computeAffected(['brand-new.ts'], INDEX);
    expect(r.affected).toEqual(['brand-new.ts']); // still affected (it changed)
    expect(r.unknown).toEqual(['brand-new.ts']);
  });

  it('dedupes when multiple changes share dependents', () => {
    const r = computeAffected(['util.ts', 'service.ts'], INDEX);
    // union, no dupes, sorted
    expect(r.affected).toEqual(['api.ts', 'service.test.ts', 'service.ts', 'util.test.ts', 'util.ts']);
  });

  it('honors a custom test matcher', () => {
    const r = computeAffected(['util.ts'], INDEX, { isTest: (p) => p.endsWith('service.ts') });
    expect(r.tests).toEqual(['service.ts']);
  });
});
