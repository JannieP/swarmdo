import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  buildIndex,
  queryIndex,
  symbolsInFile,
  indexStats,
} from '../src/codegraph/codegraph.ts';

const SAMPLE = `
import { x } from './x.js';

export function doThing(a: number): void {}
export async function fetchIt() {}
export function* gen() {}
export abstract class Base {}
export class Widget extends Base {}
export interface Opts { a: number }
export type Handler = (e: Event) => void;
export const RATE = 0.5;
export let mutable = 1;
export enum Color { Red, Green }
export const enum Dir { Up }
export default function main() {}

function notExported() {}
const alsoNot = 2;
export { x };
export * from './y.js';
`;

describe('extractSymbols', () => {
  const syms = extractSymbols(SAMPLE, 'src/sample.ts');

  it('captures each exported kind', () => {
    const byName = Object.fromEntries(syms.map((s) => [s.name, s.kind]));
    expect(byName.doThing).toBe('function');
    expect(byName.fetchIt).toBe('function');
    expect(byName.gen).toBe('function');
    expect(byName.Base).toBe('class');
    expect(byName.Widget).toBe('class');
    expect(byName.Opts).toBe('interface');
    expect(byName.Handler).toBe('type');
    expect(byName.RATE).toBe('const');
    expect(byName.mutable).toBe('const');
    expect(byName.Color).toBe('enum');
    expect(byName.Dir).toBe('enum');
    expect(byName.main).toBe('default');
  });

  it('ignores non-exported declarations', () => {
    expect(syms.find((s) => s.name === 'notExported')).toBeUndefined();
    expect(syms.find((s) => s.name === 'alsoNot')).toBeUndefined();
  });

  it('ignores re-export and star-export forms', () => {
    // `export { x }` and `export * from` must not create symbols.
    expect(syms.filter((s) => s.name === 'x')).toHaveLength(0);
  });

  it('records 1-based line numbers and a signature', () => {
    const w = syms.find((s) => s.name === 'Widget')!;
    expect(w.line).toBe(SAMPLE.split('\n').findIndex((l) => l.includes('class Widget')) + 1);
    expect(w.signature).toContain('export class Widget extends Base');
  });

  it('handles anonymous default exports', () => {
    const s = extractSymbols('export default { a: 1 };\n', 'x.ts');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: 'default', kind: 'default' });
  });

  it('truncates very long signatures', () => {
    const long = 'export const X = ' + '"' + 'a'.repeat(500) + '";\n';
    const s = extractSymbols(long, 'x.ts');
    expect(s[0].signature.length).toBeLessThanOrEqual(200);
  });
});

describe('buildIndex + query', () => {
  const index = buildIndex([
    { file: 'src/a.ts', source: 'export function alpha() {}\nexport const shared = 1;\n' },
    { file: 'src/b.ts', source: 'export class Beta {}\nexport const shared = 2;\n' },
  ]);

  it('counts files and sorts by file then line', () => {
    expect(index.fileCount).toBe(2);
    expect(index.symbols[0].file).toBe('src/a.ts');
    expect(index.symbols.map((s) => s.name)).toEqual(['alpha', 'shared', 'Beta', 'shared']);
  });

  it('exact query matches by name across files', () => {
    const hits = queryIndex(index, 'shared');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.file).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('exact query does not match substrings', () => {
    expect(queryIndex(index, 'alph')).toHaveLength(0);
  });

  it('fuzzy query matches substrings case-insensitively', () => {
    expect(queryIndex(index, 'ALPH', { fuzzy: true }).map((h) => h.name)).toEqual(['alpha']);
  });

  it('kind filter narrows results', () => {
    expect(queryIndex(index, 'Beta', { kind: 'class' })).toHaveLength(1);
    expect(queryIndex(index, 'Beta', { kind: 'function' })).toHaveLength(0);
  });

  it('symbolsInFile returns only that file', () => {
    expect(symbolsInFile(index, 'src/b.ts').map((s) => s.name)).toEqual(['Beta', 'shared']);
  });
});

describe('indexStats', () => {
  it('summarises counts by kind', () => {
    const index = buildIndex([
      { file: 'a.ts', source: 'export function f(){}\nexport class C{}\nexport function g(){}\n' },
    ]);
    const stats = indexStats(index);
    expect(stats.files).toBe(1);
    expect(stats.symbols).toBe(3);
    expect(stats.byKind.function).toBe(2);
    expect(stats.byKind.class).toBe(1);
  });
});
