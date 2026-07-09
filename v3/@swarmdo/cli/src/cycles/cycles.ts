/**
 * cycles.ts — detect circular import dependencies in codegraph's import graph.
 *
 * Circular imports are a real source of bugs: temporal-dead-zone errors,
 * `undefined` exports at module-eval time, and brittle initialization order.
 * `madge --circular` / dpdm / skott exist precisely to surface them. This finds
 * them provably via Tarjan's strongly-connected-components: every SCC with more
 * than one file is a set of mutually-cyclic modules, and a file that imports
 * itself is a one-node cycle.
 *
 * Pure + deterministic (O(V+E), stable sort) — CodeIndex in, cycle groups out.
 * The index load lives in ../commands/cycles.ts, so this is fixture-testable.
 */

import type { CodeIndex } from '../codegraph/codegraph.js';

export interface CycleOptions {
  /**
   * Include TypeScript `import type`/`export type` edges. They erase at compile
   * time so a type-only "cycle" causes none of the runtime bugs this detector
   * exists to catch — excluded by DEFAULT to avoid false positives. Set true for
   * a strict structural view. An edge counts as a runtime edge if ANY import
   * between the two files is a value import (mixed imports keep the edge).
   */
  includeTypeOnly?: boolean;
}

/** Build file → sorted list of internal (resolved) imports. Pure. */
export function buildAdjacency(index: CodeIndex, opts: CycleOptions = {}): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const ensure = (f: string) => {
    let l = adj.get(f);
    if (!l) { l = []; adj.set(f, l); }
    return l;
  };
  for (const e of index.imports) {
    if (!e.resolved) continue; // external — not part of internal cycles
    if (e.isTypeOnly && !opts.includeTypeOnly) continue; // type-only → no runtime edge
    const l = ensure(e.from);
    if (!l.includes(e.resolved)) l.push(e.resolved);
    ensure(e.resolved); // make sure the target is a node too
  }
  for (const l of adj.values()) l.sort();
  return adj;
}

/**
 * Tarjan's SCC. Returns every strongly-connected component as a member list.
 * Iterative (no recursion) so deep graphs don't overflow the stack. Deterministic:
 * nodes are visited in sorted order and each component is returned sorted.
 */
export function stronglyConnectedComponents(adj: Map<string, string[]>): string[][] {
  let idx = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  const nodes = [...adj.keys()].sort();

  for (const start of nodes) {
    if (index.has(start)) continue;
    // Iterative DFS with an explicit work stack of (node, next-child-index).
    const work: Array<{ node: string; i: number }> = [{ node: start, i: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const { node } = frame;
      if (frame.i === 0) {
        index.set(node, idx);
        low.set(node, idx);
        idx++;
        stack.push(node);
        onStack.add(node);
      }
      const children = adj.get(node) ?? [];
      if (frame.i < children.length) {
        const next = children[frame.i];
        frame.i++;
        if (!index.has(next)) {
          work.push({ node: next, i: 0 });
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, index.get(next)!));
        }
      } else {
        // Done with node — if it's a root, pop its SCC.
        if (low.get(node) === index.get(node)) {
          const comp: string[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
            if (w === node) break;
          }
          out.push(comp.sort());
        }
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1].node;
          low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
        }
      }
    }
  }
  return out;
}

export interface CycleResult {
  /** each group of ≥2 files that are mutually reachable (a real import cycle) */
  cycles: string[][];
  /** files that import themselves (one-node cycles) */
  selfLoops: string[];
}

/**
 * Circular-dependency groups from the import graph. A component is a cycle when
 * it has ≥2 files (mutual reachability) or a single file with a self-edge.
 * Deterministic: groups sorted by size desc then first member.
 */
export function findCycles(index: CodeIndex, opts: CycleOptions = {}): CycleResult {
  const adj = buildAdjacency(index, opts);
  const selfLoops: string[] = [];
  for (const [from, tos] of adj) if (tos.includes(from)) selfLoops.push(from);
  selfLoops.sort();

  const cycles = stronglyConnectedComponents(adj)
    .filter((c) => c.length >= 2)
    .sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return { cycles, selfLoops };
}

/** Human-readable summary. Pure. */
export function formatCycles(res: CycleResult): string {
  if (res.cycles.length === 0 && res.selfLoops.length === 0) return 'no circular imports found ✓';
  const lines: string[] = [];
  res.cycles.forEach((c, i) => {
    lines.push(`cycle ${i + 1} (${c.length} files):`);
    for (const f of c) lines.push(`  ${f}`);
  });
  for (const s of res.selfLoops) lines.push(`self-import: ${s}`);
  const n = res.cycles.length + res.selfLoops.length;
  lines.push(`${n} circular ${n === 1 ? 'dependency' : 'dependencies'} found`);
  return lines.join('\n');
}
