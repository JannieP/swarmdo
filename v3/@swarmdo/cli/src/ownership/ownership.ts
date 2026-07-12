/**
 * ownership.ts — per-file authorship concentration + BUS FACTOR from git history.
 *
 * "Who owns this file, and what breaks if they leave?" answered from data. For
 * every file we compute the dominant author (main-dev), how concentrated the
 * churn is in that one person (ownership share), how many hands have touched it,
 * and its bus factor — the smallest set of top authors whose combined churn
 * clears half the file. A bus factor of 1 is a key-person risk: one departure
 * orphans the file. A repo-level "truck factor" answers the same question for
 * the whole codebase.
 *
 * This is the code-maat `main-dev` / `entity-ownership` analysis (Tornhill,
 * *Your Code as a Crime Scene*), surfaced as CodeScene's "Knowledge Map" and
 * "Bus Factor". The scoring core is a pure fold over the SAME `git log --numstat`
 * dump `hotspots`/`coupling` already parse — it reuses that Commit type +
 * parseGitLog and is unit-tested without a repo. `%aN` (mailmap-folded author)
 * means name/email variants of one person count as one owner.
 */

import { toCsv } from '../util/csv.js';
import type { Commit } from '../hotspots/hotspots.js';

export interface FileOwnership {
  path: string;
  /** dominant author: most churn, tie → most commits, tie → name ascending */
  owner: string;
  /** owner churn / total file churn ∈ (0,1]; 1.0 = a single hand */
  ownership: number;
  /** distinct authors who touched the file */
  authors: number;
  /** total added+deleted across all commits */
  churn: number;
  /** commits touching the file */
  commits: number;
  /** smallest # of top-churn authors whose cumulative churn EXCEEDS 50% */
  busFactor: number;
  /** busFactor === 1 — a single point of knowledge (one departure orphans it) */
  keyPersonRisk: boolean;
}

export interface RepoBusFactor {
  /** the covering set: fewest top authors whose cumulative churn exceeds 50% */
  authors: string[];
  /** authors.length — the repo "truck factor" */
  factor: number;
}

export interface OwnershipOptions {
  /** drop files with total churn below this (default 1 → skips pure-binary edits) */
  minChurn?: number;
  /** keep only the top N files after ranking (default: all) */
  top?: number;
}

interface AuthorStat {
  name: string;
  churn: number;
  commits: number;
}

/**
 * Bus factor of a churn distribution: the smallest number of top-churn authors
 * whose cumulative churn STRICTLY exceeds half the total. An author sitting at
 * exactly 50% is not enough on their own (you'd need one more), which is what
 * makes an even two-way split a bus factor of 2. Pure.
 */
function busFactorOf(authors: AuthorStat[], total: number): number {
  const byChurn = authors.slice().sort((x, y) => y.churn - x.churn || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  const threshold = total / 2;
  let cum = 0;
  let k = 0;
  for (const a of byChurn) {
    cum += a.churn;
    k++;
    if (cum > threshold) break;
  }
  return Math.max(1, k);
}

/** Aggregate commits into per-file ownership, scored and ranked. Pure. */
export function computeOwnership(commits: Commit[], opts: OwnershipOptions = {}): FileOwnership[] {
  const minChurn = opts.minChurn ?? 1;

  interface FileAcc {
    churn: number;
    commits: number;
    byAuthor: Map<string, AuthorStat>;
  }
  const acc = new Map<string, FileAcc>();

  for (const c of commits) {
    // Fold this commit's numstat lines into per-path churn first, so a path that
    // appears twice in one commit (rename collisions) counts as ONE commit.
    const perPath = new Map<string, number>();
    for (const f of c.files) {
      if (!f.path) continue;
      perPath.set(f.path, (perPath.get(f.path) ?? 0) + f.added + f.deleted);
    }
    for (const [path, churn] of perPath) {
      let fa = acc.get(path);
      if (!fa) {
        fa = { churn: 0, commits: 0, byAuthor: new Map() };
        acc.set(path, fa);
      }
      fa.churn += churn;
      fa.commits += 1;
      let a = fa.byAuthor.get(c.author);
      if (!a) {
        a = { name: c.author, churn: 0, commits: 0 };
        fa.byAuthor.set(c.author, a);
      }
      a.churn += churn;
      a.commits += 1;
    }
  }

  const out: FileOwnership[] = [];
  for (const [path, fa] of acc) {
    if (fa.churn < minChurn) continue;
    const authors = [...fa.byAuthor.values()];
    // owner: most churn, tie → most commits (sustained involvement), tie → name asc
    const owner = authors
      .slice()
      .sort((x, y) => y.churn - x.churn || y.commits - x.commits || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))[0];
    const ownership = fa.churn > 0 ? Math.round((owner.churn / fa.churn) * 100) / 100 : 0;
    const busFactor = busFactorOf(authors, fa.churn);
    out.push({
      path,
      owner: owner.name,
      ownership,
      authors: authors.length,
      churn: fa.churn,
      commits: fa.commits,
      busFactor,
      keyPersonRisk: busFactor === 1,
    });
  }

  // Deterministic ranking: most fragile first — lowest bus factor, then most
  // concentrated (ownership desc), then most churn, then path asc for stable ties.
  out.sort(
    (x, y) =>
      x.busFactor - y.busFactor ||
      y.ownership - x.ownership ||
      y.churn - x.churn ||
      (x.path < y.path ? -1 : x.path > y.path ? 1 : 0),
  );

  return opts.top && opts.top > 0 ? out.slice(0, opts.top) : out;
}

/**
 * Repo-level truck factor: the fewest top authors whose combined churn across
 * the WHOLE history exceeds half the total. If that set is one person, a single
 * departure takes the majority of the codebase's institutional knowledge. Pure.
 */
export function repoBusFactor(commits: Commit[]): RepoBusFactor {
  const byAuthor = new Map<string, number>();
  let total = 0;
  for (const c of commits) {
    for (const f of c.files) {
      const ch = f.added + f.deleted;
      byAuthor.set(c.author, (byAuthor.get(c.author) ?? 0) + ch);
      total += ch;
    }
  }
  const sorted = [...byAuthor.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const threshold = total / 2;
  const authors: string[] = [];
  let cum = 0;
  for (const [name, ch] of sorted) {
    authors.push(name);
    cum += ch;
    if (cum > threshold) break;
  }
  return { authors, factor: authors.length };
}

/** Export the knowledge map as CSV for spreadsheets / staffing review. Pure. */
export function ownershipToCsv(files: FileOwnership[]): string {
  const headers = ['path', 'owner', 'ownership', 'busFactor', 'authors', 'churn', 'commits', 'keyPersonRisk'];
  const rows = files.map((f) => [f.path, f.owner, f.ownership, f.busFactor, f.authors, f.churn, f.commits, f.keyPersonRisk]);
  return toCsv(headers, rows);
}

/** Human-readable knowledge map. Pure. */
export function formatOwnership(files: FileOwnership[]): string {
  if (files.length === 0) return 'no ownership data found (no matching history)';
  const lines: string[] = [];
  lines.push('rank  bus  own%   authors  churn   commits  owner                 file');
  files.forEach((f, i) => {
    const rank = String(i + 1).padStart(4);
    const bus = String(f.busFactor).padStart(3);
    const own = `${Math.round(f.ownership * 100)}%`.padStart(5);
    const authors = String(f.authors).padStart(7);
    const churn = String(f.churn).padStart(6);
    const commits = String(f.commits).padStart(7);
    const owner = (f.owner.length > 20 ? f.owner.slice(0, 19) + '…' : f.owner).padEnd(20);
    const risk = f.keyPersonRisk ? '  ⚠ key-person' : '';
    lines.push(`${rank}  ${bus}  ${own}  ${authors}  ${churn}  ${commits}  ${owner}  ${f.path}${risk}`);
  });
  return lines.join('\n');
}
