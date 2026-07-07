/**
 * store.ts — the filesystem layer for codegraph: walk the tree, read sources,
 * build the index (via the pure engine), and persist/load .swarm/codegraph.json.
 * Shared by the `codegraph` CLI command and the codegraph MCP tools so the
 * scan/persist behaviour can't drift between them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildIndex, type CodeIndex } from './codegraph.js';

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

/** Scan a repo (or a subpath of it) and build the index. `root` is the repo
 * root used for relative paths; `scanRoot` (default = root) is where to walk. */
export function scanRepo(root: string, scanRoot: string = root): CodeIndex {
  const files = walkSourceFiles(scanRoot);
  const read = files
    .map((abs) => ({ file: path.relative(root, abs), source: safeRead(abs) }))
    .filter((f): f is { file: string; source: string } => f.source !== null);
  return buildIndex(read);
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
