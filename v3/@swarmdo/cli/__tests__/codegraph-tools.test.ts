import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { codegraphTools } from '../src/mcp-tools/codegraph-tools.ts';
import { scanRepo, saveIndex, loadIndex, INDEX_REL, walkSourceFiles } from '../src/codegraph/store.ts';

function tool(name: string) {
  const t = codegraphTools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
}

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-tools-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function alpha() {}\nexport class Widget {}\n');
  fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'export const alpha = 1;\nexport type T = number;\n');
  fs.writeFileSync(path.join(root, 'src', 'types.d.ts'), 'export declare const X: number;\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'i.js'), 'export function shouldBeSkipped() {}\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('store: scanRepo / walk', () => {
  it('skips node_modules and .d.ts files', () => {
    const files = walkSourceFiles(root);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
    expect(files.length).toBe(2); // a.ts, b.ts
  });

  it('builds an index with repo-relative paths and round-trips through disk', () => {
    const index = scanRepo(root);
    expect(index.symbols.find((s) => s.name === 'shouldBeSkipped')).toBeUndefined();
    saveIndex(root, index);
    expect(fs.existsSync(path.join(root, INDEX_REL))).toBe(true);
    const loaded = loadIndex(root)!;
    expect(loaded.symbols.map((s) => s.name).sort()).toEqual(['T', 'Widget', 'alpha', 'alpha']);
    expect(loaded.symbols.every((s) => !path.isAbsolute(s.file))).toBe(true);
  });
});

describe('codegraph MCP tools', () => {
  it('codegraph_index persists and reports stats', async () => {
    const r = (await tool('codegraph_index').handler({ root })) as any;
    expect(r.ok).toBe(true);
    expect(r.symbols).toBe(4);
    expect(r.files).toBe(2);
    expect(fs.existsSync(path.join(root, INDEX_REL))).toBe(true);
  });

  it('codegraph_query errors before an index exists', async () => {
    const r = (await tool('codegraph_query').handler({ root, name: 'alpha' })) as any;
    expect(r.error).toBe(true);
    expect(r.message).toMatch(/run codegraph_index/);
  });

  it('codegraph_query returns exact matches across files after indexing', async () => {
    await tool('codegraph_index').handler({ root });
    const r = (await tool('codegraph_query').handler({ root, name: 'alpha' })) as any;
    expect(r.count).toBe(2);
    expect(r.symbols.map((s: any) => s.kind).sort()).toEqual(['const', 'function']);
  });

  it('codegraph_query honours kind filter and fuzzy', async () => {
    await tool('codegraph_index').handler({ root });
    const byKind = (await tool('codegraph_query').handler({ root, name: 'alpha', kind: 'function' })) as any;
    expect(byKind.count).toBe(1);
    const fuzzy = (await tool('codegraph_query').handler({ root, name: 'wid', fuzzy: true })) as any;
    expect(fuzzy.symbols.map((s: any) => s.name)).toEqual(['Widget']);
  });

  it('codegraph_query requires a name', async () => {
    await tool('codegraph_index').handler({ root });
    const r = (await tool('codegraph_query').handler({ root })) as any;
    expect(r.error).toBe(true);
  });

  it('codegraph_file lists a file exports', async () => {
    await tool('codegraph_index').handler({ root });
    const r = (await tool('codegraph_file').handler({ root, file: 'src/a.ts' })) as any;
    expect(r.count).toBe(2);
    expect(r.symbols.map((s: any) => s.name)).toEqual(['alpha', 'Widget']);
  });

  it('codegraph_stats summarises by kind', async () => {
    await tool('codegraph_index').handler({ root });
    const r = (await tool('codegraph_stats').handler({ root })) as any;
    expect(r.symbols).toBe(4);
    expect(r.byKind.function).toBe(1);
    expect(r.byKind.class).toBe(1);
    expect(r.byKind.const).toBe(1);
    expect(r.byKind.type).toBe(1);
  });
});

describe('codegraph_imports / codegraph_importers tools', () => {
  // b.ts imports a.ts (via ./a); requires an index of files that reference each other
  async function indexed() {
    fs.writeFileSync(path.join(root, 'src', 'imp.ts'), "import { alpha } from './a';\nexport const z = 1;\n");
    await tool('codegraph_index').handler({ root });
  }
  it('codegraph_imports lists edges with resolution', async () => {
    await indexed();
    const r = (await tool('codegraph_imports').handler({ root, file: 'src/imp.ts' })) as any;
    expect(r.count).toBe(1);
    expect(r.edges[0].spec).toBe('./a');
    expect(r.edges[0].resolved).toBe('src/a.ts');
  });
  it('codegraph_importers returns reverse deps', async () => {
    await indexed();
    const r = (await tool('codegraph_importers').handler({ root, file: 'src/a.ts' })) as any;
    expect(r.count).toBe(1);
    expect(r.importers[0].from).toBe('src/imp.ts');
  });
  it('both error before an index exists', async () => {
    const a = (await tool('codegraph_imports').handler({ root, file: 'src/a.ts' })) as any;
    const b = (await tool('codegraph_importers').handler({ root, file: 'src/a.ts' })) as any;
    expect(a.error).toBe(true);
    expect(b.error).toBe(true);
  });
});

describe('tool metadata', () => {
  it('every tool has name, description, schema, handler and codegraph category', () => {
    expect(codegraphTools).toHaveLength(6);
    for (const t of codegraphTools) {
      expect(t.name).toMatch(/^codegraph_/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.category).toBe('codegraph');
      expect(typeof t.handler).toBe('function');
      expect(t.inputSchema.type).toBe('object');
    }
  });
});
