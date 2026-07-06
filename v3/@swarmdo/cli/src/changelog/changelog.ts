/**
 * changelog.ts — generate release notes from conventional commits.
 *
 * swarmdo is a conventional-commit repo whose own release workflow calls for
 * `gh release create --notes-file`; this produces that file. Parses `type(scope)!:
 * subject` commits since the last tag, groups them by type (git-cliff /
 * conventional-changelog convention), surfaces breaking changes, and renders
 * Markdown. Parsing/grouping/rendering are pure; only the git reads are injected,
 * so the whole pipeline is unit-tested without a repo.
 */

import { execFileSync } from 'node:child_process';

export interface ParsedCommit {
  hash: string;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  subject: string;
  raw: string;
}

/** Ordered sections. `hidden` types are omitted unless --all. */
export const SECTIONS: Array<{ type: string; label: string; hidden?: boolean }> = [
  { type: 'feat', label: 'Features' },
  { type: 'fix', label: 'Bug Fixes' },
  { type: 'perf', label: 'Performance' },
  { type: 'refactor', label: 'Refactoring' },
  { type: 'docs', label: 'Documentation' },
  { type: 'revert', label: 'Reverts' },
  { type: 'test', label: 'Tests', hidden: true },
  { type: 'build', label: 'Build System', hidden: true },
  { type: 'ci', label: 'CI', hidden: true },
  { type: 'style', label: 'Styles', hidden: true },
  { type: 'chore', label: 'Chores', hidden: true },
];

const SUBJECT_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

/** Parse one conventional-commit subject (+ optional body for BREAKING CHANGE). */
export function parseCommit(hash: string, subject: string, body = ''): ParsedCommit {
  const m = SUBJECT_RE.exec(subject.trim());
  if (!m) {
    return { hash, type: null, scope: null, breaking: /BREAKING[ -]CHANGE/.test(body), subject: subject.trim(), raw: subject.trim() };
  }
  const [, type, scope, bang, desc] = m;
  return {
    hash,
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: bang === '!' || /BREAKING[ -]CHANGE/.test(body),
    subject: desc.trim(),
    raw: subject.trim(),
  };
}

/** Field-separated git-log output → commits. Format must be
 * `%h%x1f%s%x1f%b%x1e` (hash, subject, body, record-terminated). Pure. */
export function parseGitLog(raw: string): ParsedCommit[] {
  const out: ParsedCommit[] = [];
  for (const rec of raw.split('\x1e')) {
    if (!rec.trim()) continue;
    const [hash = '', subject = '', body = ''] = rec.replace(/^\n+/, '').split('\x1f');
    if (!subject.trim()) continue;
    out.push(parseCommit(hash.trim(), subject, body));
  }
  return out;
}

export interface ChangelogGroup { type: string; label: string; commits: ParsedCommit[]; }
export interface GroupedCommits { breaking: ParsedCommit[]; groups: ChangelogGroup[]; other: ParsedCommit[]; }

/** Group commits into ordered sections; breaking changes collected separately. */
export function groupCommits(commits: ParsedCommit[], opts: { includeAll?: boolean } = {}): GroupedCommits {
  const breaking = commits.filter((c) => c.breaking);
  const groups: ChangelogGroup[] = [];
  for (const section of SECTIONS) {
    if (section.hidden && !opts.includeAll) continue;
    const inSection = commits.filter((c) => c.type === section.type);
    if (inSection.length) groups.push({ type: section.type, label: section.label, commits: inSection });
  }
  const known = new Set(SECTIONS.map((s) => s.type));
  const other = commits.filter((c) => c.type === null || !known.has(c.type));
  return { breaking, groups, other };
}

export interface RenderOptions {
  version?: string;
  date?: string;
  repoUrl?: string;
  includeAll?: boolean;
}

function bullet(c: ParsedCommit, repoUrl?: string): string {
  const link = c.hash ? (repoUrl ? ` ([\`${c.hash}\`](${repoUrl}/commit/${c.hash}))` : ` (\`${c.hash}\`)`) : '';
  const scope = c.scope ? `**${c.scope}:** ` : '';
  return `- ${scope}${c.subject}${link}`;
}

/** Render grouped commits to Markdown release notes. Pure. */
export function renderChangelog(commits: ParsedCommit[], opts: RenderOptions = {}): string {
  const { breaking, groups, other } = groupCommits(commits, { includeAll: opts.includeAll });
  const lines: string[] = [];
  const title = opts.version ? opts.version : 'Changelog';
  lines.push(opts.date ? `## ${title} (${opts.date})` : `## ${title}`);
  lines.push('');

  if (breaking.length) {
    lines.push('### ⚠ Breaking Changes', '');
    for (const c of breaking) lines.push(bullet(c, opts.repoUrl));
    lines.push('');
  }
  for (const g of groups) {
    lines.push(`### ${g.label}`, '');
    for (const c of g.commits) lines.push(bullet(c, opts.repoUrl));
    lines.push('');
  }
  if (opts.includeAll && other.length) {
    lines.push('### Other', '');
    for (const c of other) lines.push(bullet(c, opts.repoUrl));
    lines.push('');
  }

  if (!breaking.length && !groups.length && !(opts.includeAll && other.length)) {
    lines.push('_No notable changes._', '');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

// ── git (injectable) ─────────────────────────────────────────────────────────

export type GitRunner = (args: string[]) => string;

export function makeGitRunner(cwd: string): GitRunner {
  // pipe stderr so a failing probe (e.g. not-a-repo) is captured in the thrown
  // error rather than leaking git's `fatal:` line to the user's console
  return (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** Most recent tag, or null if the repo has none. */
export function lastTag(git: GitRunner): string | null {
  try {
    const t = git(['describe', '--tags', '--abbrev=0']).trim();
    return t || null;
  } catch {
    return null;
  }
}

/** origin's GitHub URL (https, no .git), or null. */
export function repoUrlFromGit(git: GitRunner): string | null {
  try {
    const remote = git(['remote', 'get-url', 'origin']).trim();
    const m = remote.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch {
    return null;
  }
}

/** Read + parse commits in a range (e.g. "v1.3.0..HEAD"). */
export function collectCommits(range: string, git: GitRunner): ParsedCommit[] {
  const raw = git(['log', range, '--no-merges', '--pretty=format:%h%x1f%s%x1f%b%x1e']);
  return parseGitLog(raw);
}
