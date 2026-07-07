/**
 * `swarmdo codegraph` — build and query a symbol index of the codebase, so an
 * agent can answer "where is X defined?" / "what does file Y export?" without
 * grep+read round-trips. Index persists to .swarm/codegraph.json.
 *
 *   swarmdo codegraph index [path]     # scan and persist
 *   swarmdo codegraph query <name>     # find a symbol (--fuzzy, --kind)
 *   swarmdo codegraph file <path>      # symbols a file exports
 *   swarmdo codegraph stats            # index summary
 *
 * Engine (../codegraph/codegraph.ts) is pure + tested; this layer does the fs
 * walk and JSON persistence. MVP: exported top-level symbols in TS/JS.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  buildIndex,
  queryIndex,
  symbolsInFile,
  indexStats,
  type CodeIndex,
  type CodeSymbol,
  type SymbolKind,
} from '../codegraph/codegraph.js';

const INDEX_REL = path.join('.swarm', 'codegraph.json');
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.swarm', 'dist', 'dist-standalone', 'build',
  'coverage', '.next', '.turbo', 'out', 'vendor', '.cache',
]);

function walkSourceFiles(root: string): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.') {
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (SOURCE_EXT.has(ext) && !e.name.endsWith('.d.ts')) found.push(full);
      }
    }
  }
  return found;
}

function indexPath(root: string): string {
  return path.join(root, INDEX_REL);
}

function loadIndex(root: string): CodeIndex | null {
  try {
    return JSON.parse(fs.readFileSync(indexPath(root), 'utf8')) as CodeIndex;
  } catch {
    return null;
  }
}

function fmtSymbol(s: CodeSymbol): string {
  return `${s.file}:${s.line}  ${output.dim(`[${s.kind}]`)} ${s.signature}`;
}

const indexCommand: Command = {
  name: 'index',
  description: 'Scan the tree for exported symbols and persist the index',
  options: [
    { name: 'json', description: 'machine-readable summary', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const root = ctx.cwd || process.cwd();
    const scanRoot = ctx.args[0] ? path.resolve(root, ctx.args[0]) : root;
    const files = walkSourceFiles(scanRoot);
    const read = files.map((abs) => ({ file: path.relative(root, abs), source: safeRead(abs) }));
    const index = buildIndex(read.filter((f) => f.source !== null) as Array<{ file: string; source: string }>);
    const dir = path.dirname(indexPath(root));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(indexPath(root), JSON.stringify(index));
    const stats = indexStats(index);
    if (ctx.flags.json === true) { output.printJson({ ...stats, path: INDEX_REL }); return { success: true, data: stats }; }
    output.printSuccess(`Indexed ${stats.symbols} symbols across ${stats.files} files → ${INDEX_REL}`);
    output.writeln(output.dim(Object.entries(stats.byKind).map(([k, n]) => `${k}:${n}`).join('  ')));
    return { success: true, exitCode: 0 };
  },
};

function safeRead(abs: string): string | null {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

const queryCommand: Command = {
  name: 'query',
  aliases: ['q'],
  description: 'Find a symbol by name (--fuzzy for substring, --kind to filter)',
  options: [
    { name: 'fuzzy', short: 'f', description: 'substring/case-insensitive match', type: 'boolean', default: false },
    { name: 'kind', short: 'k', description: 'restrict to one kind (function/class/interface/type/const/enum/default)', type: 'string' },
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const root = ctx.cwd || process.cwd();
    const name = ctx.args[0];
    if (!name) { output.printError('Usage: swarmdo codegraph query <name> [--fuzzy] [--kind <k>]'); return { success: false, exitCode: 1 }; }
    const index = loadIndex(root);
    if (!index) { output.printError(`no index — run \`swarmdo codegraph index\` first`); return { success: false, exitCode: 1 }; }
    const hits = queryIndex(index, name, { fuzzy: ctx.flags.fuzzy === true, kind: ctx.flags.kind as SymbolKind | undefined });
    if (ctx.flags.json === true) { output.printJson(hits); return { success: true, data: hits }; }
    if (hits.length === 0) { output.writeln(output.dim(`no symbol '${name}'${ctx.flags.fuzzy ? ' (fuzzy)' : ''}`)); return { success: true, exitCode: 0 }; }
    for (const s of hits) output.writeln(fmtSymbol(s));
    return { success: true, exitCode: 0 };
  },
};

const fileCommand: Command = {
  name: 'file',
  description: 'List symbols exported by a specific file',
  options: [
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const root = ctx.cwd || process.cwd();
    const arg = ctx.args[0];
    if (!arg) { output.printError('Usage: swarmdo codegraph file <path>'); return { success: false, exitCode: 1 }; }
    const index = loadIndex(root);
    if (!index) { output.printError(`no index — run \`swarmdo codegraph index\` first`); return { success: false, exitCode: 1 }; }
    // Accept an absolute or cwd-relative path; match against repo-relative keys.
    const rel = path.relative(root, path.resolve(root, arg));
    const hits = symbolsInFile(index, rel);
    if (ctx.flags.json === true) { output.printJson(hits); return { success: true, data: hits }; }
    if (hits.length === 0) { output.writeln(output.dim(`no exported symbols in ${rel} (indexed?)`)); return { success: true, exitCode: 0 }; }
    for (const s of hits) output.writeln(`  ${s.line}  ${output.dim(`[${s.kind}]`)} ${s.name}`);
    return { success: true, exitCode: 0 };
  },
};

const statsCommand: Command = {
  name: 'stats',
  description: 'Summary of the current index',
  options: [{ name: 'json', description: 'machine-readable output', type: 'boolean', default: false }],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const root = ctx.cwd || process.cwd();
    const index = loadIndex(root);
    if (!index) { output.printError(`no index — run \`swarmdo codegraph index\` first`); return { success: false, exitCode: 1 }; }
    const stats = indexStats(index);
    if (ctx.flags.json === true) { output.printJson(stats); return { success: true, data: stats }; }
    output.writeln(output.bold(`codegraph: ${stats.symbols} symbols, ${stats.files} files`));
    output.printList(Object.entries(stats.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`));
    return { success: true, exitCode: 0 };
  },
};

export const codegraphCommand: Command = {
  name: 'codegraph',
  aliases: ['cg'],
  description: 'Queryable index of exported symbols — where things are defined, without grep+read',
  subcommands: [indexCommand, queryCommand, fileCommand, statsCommand],
  options: [],
  examples: [
    { command: 'swarmdo codegraph index', description: 'Scan the repo and persist the symbol index' },
    { command: 'swarmdo codegraph query buildIndex', description: 'Find where a symbol is defined' },
    { command: 'swarmdo codegraph query Handler --fuzzy --kind type', description: 'Fuzzy, kind-filtered lookup' },
    { command: 'swarmdo codegraph file src/index.ts', description: 'What a file exports' },
  ],
  action: async (): Promise<CommandResult> => {
    output.writeln(output.bold('swarmdo codegraph — exported-symbol index'));
    output.printList([
      'index [path]   scan TS/JS and persist to .swarm/codegraph.json',
      'query <name>   find a symbol (--fuzzy, --kind)',
      'file <path>    symbols a file exports',
      'stats          index summary',
    ]);
    output.writeln(output.dim('MVP: exported top-level symbols. Call-graph edges + watch + MCP tool are follow-ups.'));
    return { success: true, exitCode: 0 };
  },
};

export default codegraphCommand;
