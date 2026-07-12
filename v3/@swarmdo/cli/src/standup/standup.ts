/**
 * standup.ts — "what did I do?" recall from git history, weekend-aware.
 *
 * Ports the signature behavior of git-standup: list the commits since your last
 * WORKING day, so on Monday you reach back to Friday (not merely yesterday).
 * Power users juggling many repos + AI-agent sessions use it to re-orient at the
 * start of a session and to answer the standup question in one command.
 *
 * Pure + deterministic: the grouping core takes the raw `git log --numstat`
 * dump (control-char delimited, subject included) and a reference Date, and
 * folds it into per-day buckets. No LLM, no network — the git subprocess lives
 * in ../commands/standup.ts, so this module is fully fixture-testable.
 * `resolveRenamePath` is reused from hotspots so renamed files fold correctly.
 *
 * Expected log format (control-char delimited):
 *   <SOH>%H<US>%aN<US>%aI<US>%s     ← one header line per commit (subject last)
 *   <added>\t<deleted>\t<path>      ← one numstat line per file ('-' = binary)
 */

import { resolveRenamePath } from '../hotspots/hotspots.js';

const SOH = '\x01'; // start-of-commit marker (git --format=format:%x01...)
const US = '\x1f'; // field separator (%x1f)

export interface StandupCommit {
  hash: string;
  author: string;
  /** epoch milliseconds, parsed from the ISO author date */
  date: number;
  subject: string;
  /** insertions summed across the commit's files (binary counts as 0) */
  added: number;
  /** deletions summed across the commit's files */
  deleted: number;
  /** count of files touched by the commit */
  files: number;
}

export interface DayBucket {
  /** local calendar day, `YYYY-MM-DD` */
  day: string;
  /** commits on this day, newest first */
  commits: StandupCommit[];
  /** day totals */
  added: number;
  deleted: number;
  files: number;
}

/**
 * How many days back to the last WORKING day (Mon–Fri), given a day-of-week
 * (0=Sun..6=Sat). Weekend-aware, matching git-standup's signature behavior:
 *   Monday (1)  → 3  (reach back to Friday)
 *   Sunday (0)  → 2  (reach back to Friday)
 *   any other   → 1  (yesterday)
 * Pure integer core — no Date, no timezone. Out-of-range inputs are normalized
 * into 0..6 so callers can pass raw arithmetic safely.
 */
export function daysToLastWorkingDay(dayOfWeek: number): number {
  const d = ((Math.trunc(dayOfWeek) % 7) + 7) % 7;
  if (d === 1) return 3; // Monday → Friday
  if (d === 0) return 2; // Sunday → Friday
  return 1; // yesterday
}

/**
 * The default weekend-aware window for a reference date. Reads the LOCAL
 * day-of-week — a user's "last working day" is local to them. Pure w.r.t. the
 * injected Date.
 */
export function sinceLastWorkingDay(refDate: Date): { sinceDays: number } {
  return { sinceDays: daysToLastWorkingDay(refDate.getDay()) };
}

/** Parse the control-char-delimited standup log dump into commits. Pure. */
export function parseStandupLog(raw: string): StandupCommit[] {
  const commits: StandupCommit[] = [];
  let cur: StandupCommit | null = null;
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    if (line.startsWith(SOH)) {
      const parts = line.slice(1).split(US);
      const t = Date.parse(parts[2] ?? '');
      cur = {
        hash: parts[0] ?? '',
        author: parts[1] ?? '',
        date: Number.isNaN(t) ? 0 : t,
        // subject is the last field; rejoin defensively in case it ever held a US.
        subject: parts.slice(3).join(US),
        added: 0,
        deleted: 0,
        files: 0,
      };
      commits.push(cur);
      continue;
    }
    if (!cur) continue;
    // numstat: added<TAB>deleted<TAB>path  ('-' means binary → count as 0)
    const tab1 = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const a = line.slice(0, tab1);
    const d = line.slice(tab1 + 1, tab2);
    const path = resolveRenamePath(line.slice(tab2 + 1));
    if (!path) continue;
    cur.added += a === '-' ? 0 : parseInt(a, 10) || 0;
    cur.deleted += d === '-' ? 0 : parseInt(d, 10) || 0;
    cur.files += 1;
  }
  return commits;
}

/**
 * Local `YYYY-MM-DD` for an epoch-ms instant. Uses LOCAL calendar components so
 * the day matches the user's wall clock; round-trips with local-constructed
 * dates regardless of the runner timezone. Pure.
 */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Fold commits into per-day buckets — newest day first, and newest commit first
 * within a day. Day boundaries are LOCAL. Pure (Array.sort is stable, so
 * same-timestamp commits keep git-log order).
 */
export function groupByDay(commits: StandupCommit[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const c of commits) {
    const key = dayKey(c.date);
    let b = map.get(key);
    if (!b) {
      b = { day: key, commits: [], added: 0, deleted: 0, files: 0 };
      map.set(key, b);
    }
    b.commits.push(c);
    b.added += c.added;
    b.deleted += c.deleted;
    b.files += c.files;
  }
  const buckets = [...map.values()];
  for (const b of buckets) b.commits.sort((x, y) => y.date - x.date); // newest first
  buckets.sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0)); // newest day first
  return buckets;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekday name for a `YYYY-MM-DD` day key (local). '' if unparseable. Pure. */
export function weekdayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAY[new Date(y, m - 1, d).getDay()] ?? '';
}

/**
 * Human-readable standup: a heading per day (weekday + date + counts) followed
 * by each commit's abbreviated hash and subject, then a totals footer. Pure.
 */
export function formatStandup(buckets: DayBucket[], opts: { abbrev?: number } = {}): string {
  if (buckets.length === 0) return 'no commits in the window — nothing to report';
  const abbrev = opts.abbrev ?? 9;
  const totalCommits = buckets.reduce((n, b) => n + b.commits.length, 0);
  const lines: string[] = [];
  for (const b of buckets) {
    const wd = weekdayOf(b.day);
    const plural = b.commits.length === 1 ? '' : 's';
    lines.push(`${wd ? wd + ', ' : ''}${b.day}  —  ${b.commits.length} commit${plural}, +${b.added}/-${b.deleted}`);
    for (const c of b.commits) {
      lines.push(`  ${c.hash.slice(0, abbrev)}  ${c.subject}`);
    }
    lines.push('');
  }
  const dp = buckets.length === 1 ? '' : 's';
  const cp = totalCommits === 1 ? '' : 's';
  lines.push(`${totalCommits} commit${cp} across ${buckets.length} day${dp}`);
  return lines.join('\n');
}
