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

export interface CodeIndex {
  /** Repo-relative file → symbols declared in it. */
  symbols: CodeSymbol[];
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

/** Build an index from already-read files. Pure. */
export function buildIndex(files: Array<{ file: string; source: string }>): CodeIndex {
  const symbols: CodeSymbol[] = [];
  for (const { file, source } of files) {
    symbols.push(...extractSymbols(source, file));
  }
  // Stable order: file, then line.
  symbols.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { symbols, fileCount: files.length };
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

export interface IndexStats {
  files: number;
  symbols: number;
  byKind: Record<string, number>;
}

/** Summary counts for the index. Pure. */
export function indexStats(index: CodeIndex): IndexStats {
  const byKind: Record<string, number> = {};
  for (const s of index.symbols) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  return { files: index.fileCount, symbols: index.symbols.length, byKind };
}
