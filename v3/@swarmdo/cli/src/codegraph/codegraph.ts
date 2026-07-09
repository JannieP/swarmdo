/**
 * codegraph.ts — a lightweight, queryable index of a codebase's exported
 * symbols. An agent navigating an unfamiliar repo otherwise spends tool calls
 * (and context) on grep+read round-trips to answer "where is X defined?" or
 * "what does file Y export?". This builds that map once and answers from it.
 *
 * MVP scope: EXPORTED top-level declarations in TS/JS (function, class,
 * interface, type, const/let/var, enum, and `export default`). Deliberately
 * line-based, not a full AST — exported declarations are regular enough that a
 * focused set of patterns captures them with a signature line, and it stays
 * dependency-free and fast. Call-graph edges, incremental watch, and an MCP
 * tool are follow-ups (see the command help). Pure: no I/O here.
 */

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'enum'
  | 'default';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  file: string;
  /** 1-based line number of the declaration. */
  line: number;
  /** The trimmed declaration line (signature), truncated for storage. */
  signature: string;
}

/** A dependency edge: `from` imports module `spec`, resolved to a repo file when relative. */
export interface ImportEdge {
  /** repo-relative file containing the import */
  from: string;
  /** the raw module specifier as written, e.g. './store.js' or 'node:fs' */
  spec: string;
  /** repo-relative file the spec resolves to, or null for external/unresolved */
  resolved: string | null;
  /** 1-based line of the import */
  line: number;
  /**
   * True for a TypeScript type-only import/export (`import type …`,
   * `export type … from …`). These are erased at compile time (with
   * isolatedModules/verbatimModuleSyntax) so they create NO runtime dependency
   * — relevant to cycle detection, where a type-only "cycle" is benign.
   */
  isTypeOnly?: boolean;
}

export interface CodeIndex {
  /** Repo-relative file → symbols declared in it. */
  symbols: CodeSymbol[];
  /** Dependency edges between files (relative imports resolved; externals kept unresolved). */
  imports: ImportEdge[];
  fileCount: number;
}

const SIG_MAX = 200;

/**
 * Ordered matchers. Each returns the symbol name + kind from a line already
 * known to start (after indentation) with `export`. First match wins.
 */
const MATCHERS: Array<{ kind: SymbolKind; re: RegExp }> = [
  // export default function foo  |  export default class Foo
  { kind: 'default', re: /^export\s+default\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/ },
  // export default <expr>  → anonymous default
  { kind: 'default', re: /^export\s+default\b(?!\s+(?:async\s+)?(?:function|class))/ },
  { kind: 'function', re: /^export\s+(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'class', re: /^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'interface', re: /^export\s+interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', re: /^export\s+type\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'enum', re: /^export\s+(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'const', re: /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/ },
];

/** Extract exported symbols from one source file. Pure. */
export function extractSymbols(source: string, file: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    if (!trimmed.startsWith('export')) continue;
    // `export * as ns from '…'` (ES2020) creates a real named export `ns` — a
    // namespace binding — unlike bare `export * from '…'` which adds no local
    // name. Index it (kind 'const', the closest value-binding kind) before the
    // blanket `export *` skip below.
    const nsRe = /^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\b/;
    const nsm = trimmed.match(nsRe);
    if (nsm) {
      out.push({ name: nsm[1], kind: 'const', file, line: i + 1, signature: trimmed.slice(0, SIG_MAX).replace(/\s+$/, '') });
      continue;
    }
    // Skip re-export / bare forms handled elsewhere: `export {` and `export *`.
    if (/^export\s*[*{]/.test(trimmed)) continue;
    for (const { kind, re } of MATCHERS) {
      const m = trimmed.match(re);
      if (!m) continue;
      const name = m[1] ?? 'default';
      out.push({
        name,
        kind,
        file,
        line: i + 1,
        signature: trimmed.slice(0, SIG_MAX).replace(/\s+$/, ''),
      });
      break;
    }
  }
  return out;
}

/**
 * Module specifiers on a line, from any of: `import … from 'x'`,
 * `export … from 'x'`, side-effect `import 'x'`, `require('x')`, and dynamic
 * `import('x')`. Line-based like the symbol matchers; captures every spec on
 * the line (dynamic imports can be mid-line).
 */
const IMPORT_RES: RegExp[] = [
  /\bfrom\s*['"]([^'"]+)['"]/g,          // import/export … from '…'
  /\bimport\s*['"]([^'"]+)['"]/g,         // side-effect import '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('…')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('…')
];

/** Extract the raw import specifiers from one source file. Pure. */
export function extractImports(source: string, file: string): Array<{ from: string; spec: string; line: number; isTypeOnly: boolean }> {
  const out: Array<{ from: string; spec: string; line: number; isTypeOnly: boolean }> = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\b(?:from|import|require)\b/.test(line)) continue;
    // A whole-import type-only form: `import type …` / `export type …`. NOT
    // inline `import { type X }` (mixed with value imports → still a runtime edge).
    const isTypeOnly = /^\s*(?:import|export)\s+type\b/.test(line);
    const seen = new Set<string>();
    for (const re of IMPORT_RES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const spec = m[1];
        if (seen.has(spec)) continue; // same spec caught by two patterns on one line
        seen.add(spec);
        out.push({ from: file, spec, line: i + 1, isTypeOnly });
      }
    }
  }
  return out;
}

/** Normalize a relative spec against the importing file's dir → repo-relative POSIX path (no extension). */
function joinRelative(fromFile: string, spec: string): string {
  const parts = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')).split('/') : [];
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

/**
 * Resolve a spec to a repo-relative file in `fileSet`, or null. Only relative
 * specs (`.`/`..`) resolve; bare specifiers (packages, aliases, `node:`) are
 * external → null. Tries the path as-is, common extensions, and `/index.*`,
 * and rewrites a `.js` spec to its `.ts` sibling (TS ESM convention).
 */
export function resolveImport(fromFile: string, spec: string, fileSet: Set<string>): string | null {
  if (!spec.startsWith('.')) return null;
  const base = joinRelative(fromFile, spec);
  const bases = [base];
  const jsExt = base.match(/\.(js|jsx|mjs|cjs)$/);
  if (jsExt) bases.push(base.slice(0, -jsExt[0].length)); // ./x.js → try ./x(.ts…)
  for (const b of bases) {
    for (const ext of RESOLVE_EXTS) {
      if (fileSet.has(b + ext)) return b + ext;
    }
    for (const ext of RESOLVE_EXTS.slice(1)) {
      if (fileSet.has(b + '/index' + ext)) return b + '/index' + ext;
    }
  }
  return null;
}

/** Build an index from already-read files. Pure. */
export function buildIndex(files: Array<{ file: string; source: string }>): CodeIndex {
  const symbols: CodeSymbol[] = [];
  const fileSet = new Set(files.map((f) => f.file));
  const imports: ImportEdge[] = [];
  for (const { file, source } of files) {
    symbols.push(...extractSymbols(source, file));
    for (const imp of extractImports(source, file)) {
      imports.push({ ...imp, resolved: resolveImport(imp.from, imp.spec, fileSet) });
    }
  }
  // Stable order: file, then line.
  symbols.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  imports.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.line - b.line));
  return { symbols, imports, fileCount: files.length };
}

export interface QueryOptions {
  /** Substring/case-insensitive match instead of exact. */
  fuzzy?: boolean;
  /** Restrict to one kind. */
  kind?: SymbolKind;
}

/** Look up symbols by name. Pure. */
export function queryIndex(index: CodeIndex, name: string, opts: QueryOptions = {}): CodeSymbol[] {
  const needle = name.toLowerCase();
  return index.symbols.filter((s) => {
    if (opts.kind && s.kind !== opts.kind) return false;
    return opts.fuzzy ? s.name.toLowerCase().includes(needle) : s.name === name;
  });
}

/** Symbols declared in a specific file (exact repo-relative path). Pure. */
export function symbolsInFile(index: CodeIndex, file: string): CodeSymbol[] {
  return index.symbols.filter((s) => s.file === file);
}

/** Edges FROM a file — what it imports (resolved repo files + external specs). Pure. */
export function fileImports(index: CodeIndex, file: string): ImportEdge[] {
  return (index.imports ?? []).filter((e) => e.from === file);
}

/** Edges TO a file — who imports it ("what breaks if I change this"). Pure. */
export function fileImporters(index: CodeIndex, file: string): ImportEdge[] {
  return (index.imports ?? []).filter((e) => e.resolved === file);
}

export interface IndexStats {
  files: number;
  symbols: number;
  byKind: Record<string, number>;
  /** total import edges */
  imports: number;
  /** edges resolved to an in-repo file (vs external packages) */
  internalImports: number;
}

/** Summary counts for the index. Pure. */
export function indexStats(index: CodeIndex): IndexStats {
  const byKind: Record<string, number> = {};
  for (const s of index.symbols) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  const imports = index.imports ?? [];
  return {
    files: index.fileCount,
    symbols: index.symbols.length,
    byKind,
    imports: imports.length,
    internalImports: imports.filter((e) => e.resolved !== null).length,
  };
}
