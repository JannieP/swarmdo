/**
 * affected.ts — given changed files, compute the transitive set of files that
 * (directly or indirectly) import them, and the minimal set of TEST files worth
 * running. The deterministic core behind "only run what my change could break",
 * à la `nx affected` / `jest --findRelatedTests` / `turbo --filter`.
 *
 * Composes codegraph's import graph: a change to X affects X, everything that
 * imports X, everything that imports those, and so on (reverse-dependency
 * closure). Pure — CodeIndex + changed paths in, affected/tests out; the git
 * diff and index load live in ../commands/affected.ts, so it's fixture-testable.
 */

import type { CodeIndex } from '../codegraph/codegraph.js';

/**
 * Default matcher for test files (Jest/Vitest/Mocha conventions). A file under
 * `__tests__/` counts only if it has a JS/TS extension — matching Jest's default
 * `testMatch` (`**​/__tests__/**​/*.[jt]s?(x)`); docs/fixtures (`.md`, `.json`)
 * living beside the tests are NOT test files and must not be fed to the runner.
 */
export function isTestFile(path: string): boolean {
  return /(^|\/)__tests__\/.*\.[cm]?[jt]sx?$/.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

/** file it resolves to → files that import it (reverse of the import edges). Pure. */
export function reverseDeps(index: CodeIndex): Map<string, string[]> {
  const rev = new Map<string, string[]>();
  for (const e of index.imports) {
    if (!e.resolved) continue; // external/unresolved — no internal reverse edge
    let importers = rev.get(e.resolved);
    if (!importers) { importers = []; rev.set(e.resolved, importers); }
    if (!importers.includes(e.from)) importers.push(e.from);
  }
  return rev;
}

export interface AffectedOptions {
  /** custom test-file matcher (default isTestFile) */
  isTest?: (path: string) => boolean;
}

export interface AffectedResult {
  /** every file transitively impacted, including the changed files (sorted) */
  affected: string[];
  /** the subset of `affected` that are test files (sorted) */
  tests: string[];
  /** changed files that the index knows nothing about (sorted) — may under-report */
  unknown: string[];
}

/**
 * Reverse-dependency closure from `changed` up the import graph. Deterministic:
 * BFS over reverse edges, output sorted. A changed file not present anywhere in
 * the index (never imported, declares nothing) is still reported as affected
 * (it changed) but flagged in `unknown` since we can't see its dependents.
 */
export function computeAffected(changed: string[], index: CodeIndex, opts: AffectedOptions = {}): AffectedResult {
  const isTest = opts.isTest ?? isTestFile;
  const rev = reverseDeps(index);

  // Files the index actually knows about (declares symbols or participates in imports).
  const known = new Set<string>();
  for (const s of index.symbols) known.add(s.file);
  for (const e of index.imports) { known.add(e.from); if (e.resolved) known.add(e.resolved); }

  const affected = new Set<string>();
  const queue: string[] = [];
  for (const c of changed) {
    if (!affected.has(c)) { affected.add(c); queue.push(c); }
  }
  // BFS: for each affected file, add everyone who imports it.
  while (queue.length > 0) {
    const file = queue.shift()!;
    const importers = rev.get(file);
    if (!importers) continue;
    for (const imp of importers) {
      if (!affected.has(imp)) { affected.add(imp); queue.push(imp); }
    }
  }

  const affectedList = [...affected].sort();
  return {
    affected: affectedList,
    tests: affectedList.filter(isTest),
    unknown: changed.filter((c) => !known.has(c)).sort(),
  };
}
