/**
 * Codegraph MCP Tools
 *
 * Make the exported-symbol index (see ../codegraph) agent-native: an agent can
 * ask "where is X defined?" / "what does file Y export?" in-session via MCP
 * instead of shelling out to `swarmdo codegraph` or grep+read. Reads the same
 * .swarm/codegraph.json the CLI writes (shared fs layer in codegraph/store.ts).
 */

import type { MCPTool } from './types.js';
import { queryIndex, symbolsInFile, indexStats, fileImports, fileImporters, type SymbolKind } from '../codegraph/codegraph.js';
import { INDEX_REL, scanRepo, saveIndex, loadIndex } from '../codegraph/store.js';

const KINDS = ['function', 'class', 'interface', 'type', 'const', 'enum', 'default'];

/** Resolve the repo root for scan/load. Params may override; default = cwd. */
function rootOf(params: Record<string, unknown>): string {
  const p = params.root;
  return typeof p === 'string' && p ? p : process.cwd();
}

const codegraphIndexTool: MCPTool = {
  name: 'codegraph_index',
  description:
    'Scan the codebase for exported symbols and persist a queryable index to .swarm/codegraph.json. Run this once before codegraph_query/codegraph_file (or when files have changed). Use instead of a manual grep sweep when you want a structured symbol map.',
  category: 'codegraph',
  tags: ['code', 'symbols', 'index', 'navigation'],
  inputSchema: {
    type: 'object',
    properties: {
      root: { type: 'string', description: 'Repo root (default: current working directory)' },
      path: { type: 'string', description: 'Subpath to scan, relative to root (default: whole repo)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const root = rootOf(params);
    const scanRoot = typeof params.path === 'string' && params.path ? `${root}/${params.path}` : root;
    try {
      const index = scanRepo(root, scanRoot);
      saveIndex(root, index);
      return { ok: true, indexPath: INDEX_REL, ...indexStats(index) };
    } catch (e) {
      return { error: true, message: e instanceof Error ? e.message : String(e) };
    }
  },
};

const codegraphQueryTool: MCPTool = {
  name: 'codegraph_query',
  description:
    'Find where a symbol is defined by name — returns file, line, kind, and signature. Prefer this over grep for "where is X defined": it hits a prebuilt index (no file reads) and disambiguates by kind. Requires a prior codegraph_index. Use fuzzy for substring/partial names.',
  category: 'codegraph',
  tags: ['code', 'symbols', 'query', 'navigation'],
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Symbol name to find' },
      fuzzy: { type: 'boolean', description: 'Substring, case-insensitive match instead of exact', default: false },
      kind: { type: 'string', description: `Restrict to one kind: ${KINDS.join(', ')}`, enum: KINDS },
      root: { type: 'string', description: 'Repo root (default: current working directory)' },
    },
    required: ['name'],
  },
  handler: async (params: Record<string, unknown>) => {
    const root = rootOf(params);
    const name = params.name;
    if (typeof name !== 'string' || !name) return { error: true, message: 'name is required' };
    const index = loadIndex(root);
    if (!index) return { error: true, message: 'no index — run codegraph_index first' };
    const hits = queryIndex(index, name, {
      fuzzy: params.fuzzy === true,
      kind: params.kind as SymbolKind | undefined,
    });
    return { count: hits.length, symbols: hits };
  },
};

const codegraphFileTool: MCPTool = {
  name: 'codegraph_file',
  description:
    'List the symbols a specific file exports (name, line, kind) from the index — a fast "what does this module expose?" without reading the file. Requires a prior codegraph_index.',
  category: 'codegraph',
  tags: ['code', 'symbols', 'file', 'navigation'],
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Repo-relative file path (as indexed, e.g. src/index.ts)' },
      root: { type: 'string', description: 'Repo root (default: current working directory)' },
    },
    required: ['file'],
  },
  handler: async (params: Record<string, unknown>) => {
    const root = rootOf(params);
    const file = params.file;
    if (typeof file !== 'string' || !file) return { error: true, message: 'file is required' };
    const index = loadIndex(root);
    if (!index) return { error: true, message: 'no index — run codegraph_index first' };
    const hits = symbolsInFile(index, file);
    return { file, count: hits.length, symbols: hits };
  },
};

const codegraphStatsTool: MCPTool = {
  name: 'codegraph_stats',
  description: 'Summary of the current symbol index: file count, symbol count, and a breakdown by kind. Requires a prior codegraph_index.',
  category: 'codegraph',
  tags: ['code', 'symbols', 'stats'],
  inputSchema: {
    type: 'object',
    properties: {
      root: { type: 'string', description: 'Repo root (default: current working directory)' },
    },
  },
  handler: async (params: Record<string, unknown>) => {
    const root = rootOf(params);
    const index = loadIndex(root);
    if (!index) return { error: true, message: 'no index — run codegraph_index first' };
    return indexStats(index);
  },
};

const codegraphImportsTool: MCPTool = {
  name: 'codegraph_imports',
  description:
    'List what a file imports — each edge as the raw specifier plus the repo file it resolves to (external packages resolve to null). Answers "what does this module depend on" from the index. Requires a prior codegraph_index.',
  category: 'codegraph',
  tags: ['code', 'imports', 'dependencies', 'navigation'],
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Repo-relative file path (as indexed, e.g. src/index.ts)' },
      internal: { type: 'boolean', description: 'only edges resolved to a repo file (hide external packages)', default: false },
      root: { type: 'string', description: 'Repo root (default: current working directory)' },
    },
    required: ['file'],
  },
  handler: async (params: Record<string, unknown>) => {
    const root = rootOf(params);
    const file = params.file;
    if (typeof file !== 'string' || !file) return { error: true, message: 'file is required' };
    const index = loadIndex(root);
    if (!index) return { error: true, message: 'no index — run codegraph_index first' };
    let edges = fileImports(index, file);
    if (params.internal === true) edges = edges.filter((e) => e.resolved !== null);
    return { file, count: edges.length, edges };
  },
};

const codegraphImportersTool: MCPTool = {
  name: 'codegraph_importers',
  description:
    'List which files import a given file — its reverse dependencies. Use before changing or moving a file to see what depends on it ("what breaks if I change this"). Requires a prior codegraph_index.',
  category: 'codegraph',
  tags: ['code', 'imports', 'dependencies', 'impact', 'navigation'],
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Repo-relative file path whose importers you want' },
      root: { type: 'string', description: 'Repo root (default: current working directory)' },
    },
    required: ['file'],
  },
  handler: async (params: Record<string, unknown>) => {
    const root = rootOf(params);
    const file = params.file;
    if (typeof file !== 'string' || !file) return { error: true, message: 'file is required' };
    const index = loadIndex(root);
    if (!index) return { error: true, message: 'no index — run codegraph_index first' };
    const edges = fileImporters(index, file);
    return { file, count: edges.length, importers: edges };
  },
};

export const codegraphTools: MCPTool[] = [
  codegraphIndexTool,
  codegraphQueryTool,
  codegraphFileTool,
  codegraphImportsTool,
  codegraphImportersTool,
  codegraphStatsTool,
];
