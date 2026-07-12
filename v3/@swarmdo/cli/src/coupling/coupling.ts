/**
 * coupling.ts — temporal (co-change) coupling mined from git history.
 *
 * "Which files change together?" — the EMPIRICAL complement to `affected`'s
 * STATIC import graph. Files that repeatedly land in the same commit are
 * coupled in practice even when no import edge connects them (a JSON schema and
 * its TS type, a serializer/deserializer split across modules, a feature flag
 * and its consumers, a doc that must track an API). Surfacing that lets an agent
 * or a maintainer catch the edit they'd otherwise forget.
 *
 * This is code-maat's `coupling`/`soc` analysis (Tornhill, *Your Code as a
 * Crime Scene*), productized as "Change Coupling" in CodeScene. The scoring core
 * is a pure fold over the SAME `git log --numstat` dump `hotspots` already
 * parses, so it reuses that Commit type + parseGitLog and is unit-tested without
 * a repo.
 */

import { toCsv } from '../util/csv.js';
import type { Commit } from '../hotspots/hotspots.js';

export interface CouplingPair {
  /** the lexicographically smaller path of the pair */
  a: string;
  /** the lexicographically larger path of the pair */
  b: string;
  /** commits touching BOTH a and b */
  shared: number;
  /** commits touching a (within the file cap) */
  aCommits: number;
  /** commits touching b (within the file cap) */
  bCommits: number;
  /** shared / min(aCommits, bCommits) ∈ (0,1]; 1.0 = they never move apart */
  degree: number;
}

export interface CouplingOptions {
  /** drop pairs sharing fewer than this many commits (default 2) — support threshold */
  minShared?: number;
  /**
   * skip commits touching more than this many files (default 30; 0 = no cap).
   * A sweeping rename/format/license commit would otherwise couple everything
   * it touches — the code-maat noise convention drops those wide commits.
   */
  maxFiles?: number;
  /** keep only the top N pairs after ranking (default: all) */
  top?: number;
  /** keep only pairs involving this exact path (a "what couples with X?" query) */
  focus?: string;
}

const US = '\x1f'; // pair-key separator (never appears in a file path)

/**
 * Rank co-changing file pairs. Pure + deterministic.
 *
 * degree(A,B) = shared / min(commits(A), commits(B)) — the fraction of the
 * rarer file's commits that also touched the other. Symmetric, in (0,1].
 */
export function computeCoupling(commits: Commit[], opts: CouplingOptions = {}): CouplingPair[] {
  const minShared = opts.minShared ?? 2;
  const maxFiles = opts.maxFiles ?? 30;

  const fileCommits = new Map<string, number>(); // path → # commits touching it
  const pairShared = new Map<string, number>();  // "a\x1fb" → # commits touching both

  for (const c of commits) {
    const paths = [...new Set(c.files.map((f) => f.path))].filter(Boolean);
    if (maxFiles > 0 && paths.length > maxFiles) continue; // skip sweeping commits (both counts + pairs)
    for (const p of paths) fileCommits.set(p, (fileCommits.get(p) ?? 0) + 1);
    const sorted = paths.slice().sort(); // canonical (a<b) pair keys
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = sorted[i] + US + sorted[j];
        pairShared.set(key, (pairShared.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: CouplingPair[] = [];
  for (const [key, shared] of pairShared) {
    if (shared < minShared) continue;
    const sep = key.indexOf(US);
    const a = key.slice(0, sep);
    const b = key.slice(sep + 1);
    if (opts.focus && a !== opts.focus && b !== opts.focus) continue;
    const aCommits = fileCommits.get(a) ?? 0;
    const bCommits = fileCommits.get(b) ?? 0;
    const denom = Math.min(aCommits, bCommits) || 1;
    const degree = Math.round((shared / denom) * 100) / 100;
    pairs.push({ a, b, shared, aCommits, bCommits, degree });
  }

  // deterministic: strongest coupling first, then most-shared, then path order
  pairs.sort((x, y) =>
    y.degree - x.degree ||
    y.shared - x.shared ||
    (x.a < y.a ? -1 : x.a > y.a ? 1 : 0) ||
    (x.b < y.b ? -1 : x.b > y.b ? 1 : 0),
  );

  return opts.top && opts.top > 0 ? pairs.slice(0, opts.top) : pairs;
}

export function couplingToCsv(pairs: CouplingPair[]): string {
  const headers = ['fileA', 'fileB', 'degree', 'shared', 'commitsA', 'commitsB'];
  const rows = pairs.map((p) => [p.a, p.b, p.degree, p.shared, p.aCommits, p.bCommits]);
  return toCsv(headers, rows);
}

/** Human-readable table. Pure. */
export function formatCoupling(pairs: CouplingPair[]): string {
  if (pairs.length === 0) return 'no co-change coupling found (raise --since or lower --min-shared)';
  const lines: string[] = [];
  lines.push('rank  degree  shared  commits(A/B)  files');
  pairs.forEach((p, i) => {
    const rank = String(i + 1).padStart(4);
    const degree = `${Math.round(p.degree * 100)}%`.padStart(6);
    const shared = String(p.shared).padStart(6);
    const ab = `${p.aCommits}/${p.bCommits}`.padStart(11);
    lines.push(`${rank}  ${degree}  ${shared}  ${ab}  ${p.a}  ↔  ${p.b}`);
  });
  return lines.join('\n');
}
