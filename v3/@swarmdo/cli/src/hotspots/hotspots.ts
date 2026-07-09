/**
 * hotspots.ts — rank files by CHANGE-RISK mined from git history.
 *
 * The "where is the technical debt?" query, answered from data instead of a
 * guess: files that change often, are churned heavily, are touched by many
 * hands, and were edited recently are the ones most worth refactoring, testing,
 * or reviewing carefully. Inspired by code-maat / "Your Code as a Crime Scene".
 *
 * Pure + deterministic: the scoring core takes the raw `git log --numstat`
 * string (+ a fixed `now` for recency) and folds it into a ranked list. No LLM,
 * no network — the git subprocess lives in ../commands/hotspots.ts, so this
 * module is fully fixture-testable.
 *
 * Expected log format (control-char delimited to avoid collisions):
 *   <SOH>%H<US>%an<US>%aI      ← one header line per commit
 *   <added>\t<deleted>\t<path> ← one numstat line per file ('-' for binary)
 */

const SOH = '\x01'; // start-of-commit marker (git --format=format:%x01...)
const US = '\x1f'; // field separator (%x1f)

export interface CommitFile {
  path: string;
  added: number;
  deleted: number;
}
export interface Commit {
  hash: string;
  author: string;
  /** epoch milliseconds, parsed from the ISO author date */
  date: number;
  files: CommitFile[];
}

export interface FileHotspot {
  path: string;
  commits: number;
  churn: number; // added + deleted across all commits
  authors: number; // distinct authors
  lastTouched: number; // epoch ms
  firstTouched: number; // epoch ms
  risk: number; // composite score (see scoreOf); higher = riskier
}

export type SortKey = 'risk' | 'churn' | 'commits' | 'authors';

export interface HotspotOptions {
  /** drop files with fewer than this many commits (default 1) */
  minCommits?: number;
  /** sort key (default 'risk') */
  by?: SortKey;
  /** keep only the top N after sorting (default: all) */
  top?: number;
}

/**
 * Resolve git's rename/copy numstat notation to the file's CURRENT (new) path.
 *
 * When rename/copy detection fires (git's default for merges, and often
 * otherwise), `--numstat` doesn't emit a plain path. It emits either the
 * compact braces form with a shared prefix/suffix around the changed run:
 *   `src/{old => new}/file.ts`   ·   `{old => new}/file.ts`   ·   `dir/{old => }/f`
 * or, when there's no shared prefix/suffix, the full form:
 *   `old/path.ts => new/path.ts`
 *
 * We attribute churn to the file's current identity (the NEW path) so a renamed
 * file's history folds into one entry instead of splitting across two phantom
 * names. Plain paths pass through untouched. Pure — no git call.
 */
export function resolveRenamePath(raw: string): string {
  const open = raw.indexOf('{');
  if (open >= 0) {
    const arrow = raw.indexOf(' => ', open);
    const close = arrow >= 0 ? raw.indexOf('}', arrow) : -1;
    if (arrow >= 0 && close >= 0) {
      const prefix = raw.slice(0, open);
      const newPart = raw.slice(arrow + 4, close);
      const suffix = raw.slice(close + 1);
      // Collapse the empty-side double slash (e.g. `dir/{old => }/f` → `dir/f`).
      return (prefix + newPart + suffix).replace(/\/{2,}/g, '/');
    }
  }
  const arrow = raw.indexOf(' => ');
  if (arrow >= 0) return raw.slice(arrow + 4);
  return raw;
}

/** Parse a control-char-delimited `git log --numstat` dump into commits. Pure. */
export function parseGitLog(raw: string): Commit[] {
  const commits: Commit[] = [];
  let cur: Commit | null = null;
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    if (line.startsWith(SOH)) {
      const [hash, author, iso] = line.slice(1).split(US);
      const t = Date.parse(iso ?? '');
      cur = { hash: hash ?? '', author: author ?? '', date: Number.isNaN(t) ? 0 : t, files: [] };
      commits.push(cur);
      continue;
    }
    if (!cur) continue;
    // numstat: added<TAB>deleted<TAB>path  ('-' means binary → count as 0
    const tab1 = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const a = line.slice(0, tab1);
    const d = line.slice(tab1 + 1, tab2);
    const path = resolveRenamePath(line.slice(tab2 + 1));
    if (!path) continue;
    cur.files.push({ path, added: a === '-' ? 0 : parseInt(a, 10) || 0, deleted: d === '-' ? 0 : parseInt(d, 10) || 0 });
  }
  return commits;
}

/**
 * Composite risk score. Deterministic and monotonic:
 *   risk = commits · log2(1 + churn) · authorFactor · recencyWeight
 * where authorFactor = 1 + log2(authors) (coordination cost of many hands)
 * and recencyWeight = 1 / (1 + ageDays/30) (recent churn is riskier; decays
 * over a ~month scale). `now` is injected so the function is pure/testable.
 */
function scoreOf(h: Omit<FileHotspot, 'risk'>, now: number): number {
  const authorFactor = 1 + Math.log2(h.authors);
  const ageDays = Math.max(0, (now - h.lastTouched) / 86_400_000);
  const recencyWeight = 1 / (1 + ageDays / 30);
  const raw = h.commits * Math.log2(1 + h.churn) * authorFactor * recencyWeight;
  return Math.round(raw * 100) / 100;
}

/** Aggregate commits into per-file hotspots, scored and ranked. Pure. */
export function computeHotspots(commits: Commit[], now: number, opts: HotspotOptions = {}): FileHotspot[] {
  const minCommits = opts.minCommits ?? 1;
  const by = opts.by ?? 'risk';

  interface Acc {
    commits: number;
    churn: number;
    authors: Set<string>;
    lastTouched: number;
    firstTouched: number;
  }
  const acc = new Map<string, Acc>();
  for (const c of commits) {
    for (const f of c.files) {
      let a = acc.get(f.path);
      if (!a) {
        a = { commits: 0, churn: 0, authors: new Set(), lastTouched: 0, firstTouched: Infinity };
        acc.set(f.path, a);
      }
      a.commits += 1;
      a.churn += f.added + f.deleted;
      a.authors.add(c.author);
      if (c.date > a.lastTouched) a.lastTouched = c.date;
      if (c.date < a.firstTouched) a.firstTouched = c.date;
    }
  }

  let out: FileHotspot[] = [];
  for (const [path, a] of acc) {
    if (a.commits < minCommits) continue;
    const base = {
      path,
      commits: a.commits,
      churn: a.churn,
      authors: a.authors.size,
      lastTouched: a.lastTouched,
      firstTouched: a.firstTouched === Infinity ? 0 : a.firstTouched,
    };
    out.push({ ...base, risk: scoreOf(base, now) });
  }

  // Deterministic sort: chosen key desc, then path asc for stable ties.
  out.sort((x, y) => (y[by] as number) - (x[by] as number) || (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  if (opts.top && opts.top > 0) out = out.slice(0, opts.top);
  return out;
}

/** Human-readable table. Pure. */
export function formatHotspots(spots: FileHotspot[], now: number): string {
  if (spots.length === 0) return 'no hotspots found (no matching history)';
  const lines: string[] = [];
  lines.push(`rank  risk    commits  churn   authors  file`);
  spots.forEach((s, i) => {
    const ageDays = Math.round((now - s.lastTouched) / 86_400_000);
    const rank = String(i + 1).padStart(4);
    const risk = s.risk.toFixed(2).padStart(7);
    const commits = String(s.commits).padStart(7);
    const churn = String(s.churn).padStart(6);
    const authors = String(s.authors).padStart(7);
    lines.push(`${rank}  ${risk}  ${commits}  ${churn}  ${authors}  ${s.path}  ${ageDays === 0 ? '(today)' : `(${ageDays}d ago)`}`);
  });
  return lines.join('\n');
}
