/**
 * compact-snapshot.ts — build a "survival digest" that lets an agent re-ground
 * after context compaction. Post-compaction, the model loses its working set
 * and tends to re-explore files it just edited and repeat corrected mistakes
 * (a widely-reported pain, #45). This captures the cheap signals swarmdo
 * already tracks — recently edited files (the pending-insights edit ledger),
 * uncommitted changes (`git status --porcelain`), and the current branch —
 * into a compact digest that the first post-compaction prompt re-injects.
 *
 * Pure + deterministic: inputs in (including `now`, so no clock dependency),
 * a digest / rendered string out. The fs read (edit ledger), git calls, and
 * digest persistence live in ../commands/compact-snapshot.ts, so this is
 * fixture-testable.
 */

/** One edit-ledger record (a line of .swarmdo/data/pending-insights.jsonl). */
export interface EditRecord {
  file: string;
  timestamp: number;
}

export interface DigestInput {
  /** recent edit-ledger records; most-recent-wins when a file repeats */
  edits?: EditRecord[];
  /** raw `git status --porcelain` lines (uncommitted changes) */
  gitStatus?: string[];
  /** current branch name, if known */
  branch?: string;
  /** epoch ms the snapshot was taken (injected, not read from a clock) */
  now: number;
}

export interface CompactDigest {
  takenAt: number;
  branch?: string;
  /** distinct edited files, most-recently-edited first, capped */
  recentFiles: string[];
  /** distinct uncommitted file paths, capped */
  uncommitted: string[];
}

const DEFAULT_MAX_FILES = 12;

/**
 * Extract the working-tree path from one `git status --porcelain` line.
 * Format is `XY <path>` (two status chars + space); a rename is
 * `R  <old> -> <new>` — we want the destination. Quoted paths (git quotes
 * names with special chars) are unwrapped. Returns null for a blank line.
 * Pure.
 */
export function porcelainPath(line: string): string | null {
  if (!line || line.length < 4) return null;
  const status = line.slice(0, 2); // XY status code
  let rest = line.slice(3); // strip the 2 status chars + the separating space
  // Only a rename/copy (status R or C) uses `<old> -> <new>`; for any other
  // status a literal ` -> ` is part of the real filename and must NOT be split.
  if (/[RC]/.test(status)) {
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) rest = rest.slice(arrow + 4); // destination path
  }
  rest = rest.trim();
  if (rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2) {
    rest = rest.slice(1, -1); // unwrap git's quoted path (escapes left as-is)
  }
  return rest || null;
}

/** Build the digest from raw session signals. Pure. */
export function buildDigest(input: DigestInput, opts: { maxFiles?: number } = {}): CompactDigest {
  const max = opts.maxFiles ?? DEFAULT_MAX_FILES;

  // Distinct edited files, most-recent edit first. A file edited repeatedly
  // keeps its latest timestamp; ties preserve first-seen (stable) order.
  const latest = new Map<string, number>();
  for (const e of input.edits ?? []) {
    if (!e || typeof e.file !== 'string' || !e.file) continue;
    const t = typeof e.timestamp === 'number' ? e.timestamp : 0;
    const prev = latest.get(e.file);
    if (prev === undefined || t >= prev) latest.set(e.file, t);
  }
  const recentFiles = [...latest.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, max)
    .map(([f]) => f);

  const seenUncommitted = new Set<string>();
  const uncommitted: string[] = [];
  for (const line of input.gitStatus ?? []) {
    const p = porcelainPath(line);
    if (p && !seenUncommitted.has(p)) { seenUncommitted.add(p); uncommitted.push(p); }
    if (uncommitted.length >= max) break;
  }

  return {
    takenAt: input.now,
    ...(input.branch ? { branch: input.branch } : {}),
    recentFiles,
    uncommitted,
  };
}

/** A digest with no files and no branch carries nothing worth re-injecting. Pure. */
export function isDigestEmpty(d: CompactDigest): boolean {
  return d.recentFiles.length === 0 && d.uncommitted.length === 0;
}

/** Compact human "Nm ago" for the snapshot age. Pure. */
function ago(fromMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - fromMs) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/**
 * Render the digest as a re-grounding block for the first post-compaction
 * prompt. Empty digest → '' (nothing to inject). `now` is passed so the
 * relative age is deterministic. Pure.
 */
export function formatDigest(d: CompactDigest, now: number): string {
  if (isDigestEmpty(d)) return '';
  const lines = [`[swarmdo] Working context restored after compaction (snapshot ${ago(d.takenAt, now)}):`];
  if (d.branch) lines.push(`- Branch: ${d.branch}`);
  if (d.recentFiles.length) lines.push(`- Recently edited (${d.recentFiles.length}): ${d.recentFiles.join(', ')}`);
  if (d.uncommitted.length) lines.push(`- Uncommitted changes (${d.uncommitted.length}): ${d.uncommitted.join(', ')}`);
  lines.push('Resume this work; re-read these files only as needed rather than re-exploring from scratch.');
  return lines.join('\n');
}
