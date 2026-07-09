import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractImports,
  resolveImport,
  buildIndex,
  queryIndex,
  symbolsInFile,
  fileImports,
  fileImporters,
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

describe('extractImports', () => {
  it('captures import/export-from, side-effect, dynamic, and require specs', () => {
    const src = [
      "import a from './a.js';",
      "import { b } from '../lib/b';",
      "import * as c from 'node:fs';",
      "import './side-effect.css';",
      "export { d } from './d';",
      "export * from './e';",
      "const f = require('pkg');",
      "const g = await import('./g.js');",
      "type T = number; // no import here",
    ].join('\n');
    const specs = extractImports(src, 'src/x.ts').map((i) => i.spec);
    expect(specs).toEqual(['./a.js', '../lib/b', 'node:fs', './side-effect.css', './d', './e', 'pkg', './g.js']);
  });
  it('records 1-based line numbers', () => {
    const imps = extractImports("\nimport x from './x';", 'f.ts');
    expect(imps[0].line).toBe(2);
  });
  it('dedupes a spec caught by two patterns on one line', () => {
    // contrived: contains both `from '…'` and `import('…')` for the same spec
    const imps = extractImports("import('./x'); import y from './x';", 'f.ts');
    // one line, spec './x' should appear once (per-line dedupe)
    expect(imps.filter((i) => i.spec === './x')).toHaveLength(1);
  });
  it('flags whole-import type-only forms, not value or inline-type imports', () => {
    const src = [
      "import type { A } from './a';",       // type-only
      "export type { B } from './b';",       // type-only
      "import type * as C from './c';",      // type-only
      "import { d } from './d';",            // value
      "import { type E, f } from './e';",    // inline type + value → NOT type-only (runtime edge)
      "import typescript from './ts';",      // 'typescript' must not match `type`
    ].join('\n');
    const byspec = Object.fromEntries(extractImports(src, 'x.ts').map((i) => [i.spec, i.isTypeOnly]));
    expect(byspec['./a']).toBe(true);
    expect(byspec['./b']).toBe(true);
    expect(byspec['./c']).toBe(true);
    expect(byspec['./d']).toBe(false);
    expect(byspec['./e']).toBe(false);
    expect(byspec['./ts']).toBe(false);
  });
});

describe('resolveImport', () => {
  const files = new Set(['src/a.ts', 'src/lib/b.ts', 'src/c/index.ts', 'src/d.tsx']);
  it('resolves a .js spec to its .ts sibling (TS ESM convention)', () => {
    expect(resolveImport('src/x.ts', './a.js', files)).toBe('src/a.ts');
  });
  it('resolves via ../ and extension probing', () => {
    expect(resolveImport('src/sub/x.ts', '../lib/b', files)).toBe('src/lib/b.ts');
    expect(resolveImport('src/x.ts', './d', files)).toBe('src/d.tsx');
  });
  it('resolves a directory to its index file', () => {
    expect(resolveImport('src/x.ts', './c', files)).toBe('src/c/index.ts');
  });
  it('returns null for external / unresolvable specs', () => {
    expect(resolveImport('src/x.ts', 'node:fs', files)).toBeNull();
    expect(resolveImport('src/x.ts', 'lodash', files)).toBeNull();
    expect(resolveImport('src/x.ts', './missing', files)).toBeNull();
  });
});

describe('import graph in buildIndex', () => {
  const index = buildIndex([
    { file: 'src/a.ts', source: "import { helper } from './b.js';\nexport const a = 1;\n" },
    { file: 'src/b.ts', source: "import fs from 'node:fs';\nexport const helper = 2;\n" },
    { file: 'src/c.ts', source: "import { a } from './a';\nimport { helper } from './b';\n" },
  ]);

  it('resolves internal edges and keeps externals unresolved', () => {
    const aEdges = fileImports(index, 'src/a.ts');
    expect(aEdges).toHaveLength(1);
    expect(aEdges[0].resolved).toBe('src/b.ts');
    const bEdges = fileImports(index, 'src/b.ts');
    expect(bEdges[0].spec).toBe('node:fs');
    expect(bEdges[0].resolved).toBeNull();
  });

  it('fileImporters returns reverse deps', () => {
    // b.ts is imported by a.ts and c.ts
    const importers = fileImporters(index, 'src/b.ts').map((e) => e.from).sort();
    expect(importers).toEqual(['src/a.ts', 'src/c.ts']);
    // a.ts is imported by c.ts only
    expect(fileImporters(index, 'src/a.ts').map((e) => e.from)).toEqual(['src/c.ts']);
    // c.ts is a leaf (nobody imports it)
    expect(fileImporters(index, 'src/c.ts')).toHaveLength(0);
  });

  it('indexStats counts imports and internal edges', () => {
    const s = indexStats(index);
    expect(s.imports).toBe(4); // a→b, b→fs, c→a, c→b
    expect(s.internalImports).toBe(3); // all but node:fs
  });
});
