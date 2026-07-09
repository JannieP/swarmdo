/**
 * store.ts — the filesystem layer for codegraph: walk the tree, read sources,
 * build the index (via the pure engine), and persist/load .swarm/codegraph.json.
 * Shared by the `codegraph` CLI command and the codegraph MCP tools so the
 * scan/persist behaviour can't drift between them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildIndex, type CodeIndex, type ImportAlias } from './codegraph.js';

export const INDEX_REL = path.join('.swarm', 'codegraph.json');

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.swarm', 'dist', 'dist-standalone', 'build',
  'coverage', '.next', '.turbo', 'out', 'vendor', '.cache',
]);

/** Recursively collect source files under `root`, skipping vendor/build dirs and .d.ts. */
export function walkSourceFiles(root: string): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
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

function safeRead(abs: string): string | null {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

export function indexPath(root: string): string {
  return path.join(root, INDEX_REL);
}

/**
 * Strip JSONC `//` and block comments + trailing commas, STRING-AWARE so a `/*`
 * inside a path pattern (e.g. `"@app/*"`, ubiquitous in tsconfig paths) isn't
 * mistaken for a comment start. Pure.
 */
function stripJsonc(s: string): string {
  let out = '';
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
    if (ch === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Read `<root>/tsconfig.json` and derive repo-relative import aliases from
 * `compilerOptions.paths` (+ `baseUrl`). Tolerant of JSONC comments/trailing
 * commas; returns [] on any problem (so bare-specifier imports stay external,
 * as before). Only the first target of each path pattern is used. Pure-ish (fs read).
 */
export function parseTsconfigAliases(root: string): ImportAlias[] {
  let raw: string;
  try { raw = fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'); } catch { return []; }
  const json = stripJsonc(raw);
  let cfg: { compilerOptions?: { baseUrl?: string; paths?: Record<string, unknown> } };
  try { cfg = JSON.parse(json); } catch { return []; }
  const co = cfg.compilerOptions ?? {};
  if (!co.paths || typeof co.paths !== 'object') return [];
  const baseUrl = typeof co.baseUrl === 'string' ? co.baseUrl : '.';
  const aliases: ImportAlias[] = [];
  for (const [pattern, targets] of Object.entries(co.paths)) {
    const first = Array.isArray(targets) ? targets[0] : undefined;
    if (typeof first !== 'string') continue;
    aliases.push({ pattern, target: path.join(baseUrl, first).split(path.sep).join('/') });
  }
  return aliases;
}

/** Scan a repo (or a subpath of it) and build the index. `root` is the repo
 * root used for relative paths; `scanRoot` (default = root) is where to walk. */
export function scanRepo(root: string, scanRoot: string = root): CodeIndex {
  const files = walkSourceFiles(scanRoot);
  const read = files
    .map((abs) => ({ file: path.relative(root, abs), source: safeRead(abs) }))
    .filter((f): f is { file: string; source: string } => f.source !== null);
  return buildIndex(read, parseTsconfigAliases(root));
}

/** Persist the index to .swarm/codegraph.json under `root`. */
export function saveIndex(root: string, index: CodeIndex): void {
  const p = indexPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index));
}

/** Load the persisted index, or null if none/unreadable. */
export function loadIndex(root: string): CodeIndex | null {
  try {
    return JSON.parse(fs.readFileSync(indexPath(root), 'utf8')) as CodeIndex;
  } catch {
    return null;
  }
}
