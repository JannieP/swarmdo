/**
 * hidden.ts — HIDDEN coupling: files that change together but have no import
 * edge to explain it. "Logical coupling minus structural coupling."
 *
 * `coupling` mines temporal (co-change) coupling from git; `codegraph` builds
 * the static import graph. Join them and emit the SET DIFFERENCE: pairs with a
 * high co-change degree yet NO import edge connecting them in either direction.
 * That's a dependency real enough to move two files in lockstep but invisible in
 * the code — a JSON schema and the type that mirrors it, a serializer/parser
 * split across modules, a config file and its consumers, a doc that must track
 * an API. An agent editing A won't reach B by following imports, so it forgets
 * the co-edit; a reviewer sees a missing abstraction / architectural smell.
 *
 * This is the divergence between evolutionary coupling (Gall et al., "Detection
 * of Logical Coupling," ICSM 1998) and structural coupling — CodeScene flags
 * change-coupling that crosses architectural boundaries as "surprising." swarmdo
 * is uniquely positioned to compute it because it already owns BOTH captures.
 *
 * Pure + deterministic: a set-difference over two already-built inputs (the
 * ranked CouplingPair[] from computeCoupling + the ImportEdge[] from the index).
 * No git, no fs — fully fixture-testable.
 */

import { toCsv } from '../util/csv.js';
import type { CouplingPair } from './coupling.js';
import type { ImportEdge } from '../codegraph/codegraph.js';

export interface AnnotatedPair extends CouplingPair {
  /** true iff an import edge connects a↔b in EITHER direction (a structural link
   * that explains the co-change); the returned pairs are all `false`. */
  importLinked: boolean;
}

export interface HiddenCouplingOptions {
  /** keep only the top N hidden pairs after ranking (default: all) */
  top?: number;
}

const US = '\x1f'; // pair-key separator (never appears in a file path)
/** Canonical undirected pair key so direction doesn't matter. */
const pairKey = (a: string, b: string): string => (a < b ? a + US + b : b + US + a);

/**
 * Return the co-change pairs that NO import edge explains, ranked as they came
 * from `computeCoupling` (degree desc, shared desc, path order). A type-only
 * import still counts as a structural link — it's a real code reference that
 * explains the co-change — so those pairs are excluded too. Pure.
 */
export function computeHiddenCoupling(pairs: CouplingPair[], imports: ImportEdge[], opts: HiddenCouplingOptions = {}): AnnotatedPair[] {
  // Every file pair connected by a resolved import edge, either direction.
  const linked = new Set<string>();
  for (const e of imports) {
    if (e.resolved) linked.add(pairKey(e.from, e.resolved));
  }
  const hidden = pairs
    .map((p) => ({ ...p, importLinked: linked.has(pairKey(p.a, p.b)) }))
    .filter((p) => !p.importLinked);
  return opts.top && opts.top > 0 ? hidden.slice(0, opts.top) : hidden;
}

/** Export the hidden-coupling ranking as CSV for review. Pure. */
export function hiddenCouplingToCsv(pairs: AnnotatedPair[]): string {
  const headers = ['fileA', 'fileB', 'degree', 'shared', 'commitsA', 'commitsB'];
  const rows = pairs.map((p) => [p.a, p.b, p.degree, p.shared, p.aCommits, p.bCommits]);
  return toCsv(headers, rows);
}

/** Human-readable table. Pure. */
export function formatHiddenCoupling(pairs: AnnotatedPair[]): string {
  if (pairs.length === 0) return 'no hidden coupling found (every co-change pair has an import edge, or none met the threshold)';
  const lines: string[] = [];
  lines.push('rank  degree  shared  commits(A/B)  files (co-change, no import edge)');
  pairs.forEach((p, i) => {
    const rank = String(i + 1).padStart(4);
    const degree = `${Math.round(p.degree * 100)}%`.padStart(6);
    const shared = String(p.shared).padStart(6);
    const ab = `${p.aCommits}/${p.bCommits}`.padStart(11);
    lines.push(`${rank}  ${degree}  ${shared}  ${ab}  ${p.a}  ⇢  ${p.b}`);
  });
  return lines.join('\n');
}
