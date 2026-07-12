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
// git's default revert subject: `Revert "<original subject>"` (git-revert(1)).
// The conventional `revert:` type is handled by SUBJECT_RE; this catches the
// bare git form, which otherwise falls into the hidden `other` bucket.
const REVERT_RE = /^Revert\s+"(.+)"$/;
// Conventional Commits: a breaking-change footer MUST be the uppercase token
// `BREAKING CHANGE` (or `BREAKING-CHANGE`) at the start of a footer line,
// followed by `: `. Anchoring to a line start avoids a false positive when the
// phrase merely appears in prose ("this is not a BREAKING CHANGE, just …").
const BREAKING_RE = /^BREAKING[ -]CHANGE:\s/m;

/** Parse one conventional-commit subject (+ optional body for BREAKING CHANGE). */
export function parseCommit(hash: string, subject: string, body = ''): ParsedCommit {
  const trimmed = subject.trim();
  const rev = REVERT_RE.exec(trimmed);
  if (rev) {
    // Recurse into the quoted original subject to lift its scope/description.
    const inner = SUBJECT_RE.exec(rev[1].trim());
    return {
      hash,
      type: 'revert',
      scope: inner ? inner[2] ?? null : null,
      // A revert of a breaking commit is itself breaking — mirror the non-revert
      // branch and consult the reverted subject's `!` marker (inner group 3),
      // not just a BREAKING CHANGE footer on the revert body.
      breaking: (inner ? inner[3] === '!' : false) || BREAKING_RE.test(body),
      subject: inner ? inner[4].trim() : rev[1].trim(),
      raw: trimmed,
    };
  }
  const m = SUBJECT_RE.exec(trimmed);
  if (!m) {
    return { hash, type: null, scope: null, breaking: BREAKING_RE.test(body), subject: subject.trim(), raw: subject.trim() };
  }
  const [, type, scope, bang, desc] = m;
  return {
    hash,
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: bang === '!' || BREAKING_RE.test(body),
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

// ── contributors (opt-in `### Contributors` section) ─────────────────────────

export interface Contributor { name: string; handle: string | null; }

/**
 * GitHub no-reply author emails encode the account login:
 *   `<id>+<login>@users.noreply.github.com`  (current form)
 *   `<login>@users.noreply.github.com`        (legacy form)
 * Return the @handle when the email is one of those, else null.
 */
export function githubHandle(email: string): string | null {
  const m = /^(?:\d+\+)?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)@users\.noreply\.github\.com$/.exec(email.trim());
  return m ? m[1] : null;
}

/**
 * Distinct commit authors in a range, oldest-first (git log is newest-first, so
 * we reverse — the earliest contributor to the range leads). Deduped by author
 * name (case-insensitive); the GitHub @handle is carried when the author email
 * is a github no-reply address (back-filled if any of an author's commits has one).
 * Pure but for the injected git read, mirroring collectCommits.
 */
export function collectContributors(range: string, git: GitRunner): Contributor[] {
  const raw = git(['log', range, '--no-merges', '--format=%aN%x1f%aE']);
  const seen = new Map<string, Contributor>();
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    const [name, email = ''] = line.split('\x1f');
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      if (!existing.handle) existing.handle = githubHandle(email); // back-fill
      continue;
    }
    seen.set(key, { name, handle: githubHandle(email) });
  }
  return [...seen.values()];
}

/** Render the `### Contributors` section (empty string when there are none). */
export function renderContributors(contributors: Contributor[]): string {
  if (!contributors.length) return '';
  const items = contributors.map((c) => (c.handle ? `- ${c.name} (@${c.handle})` : `- ${c.name}`));
  return ['### Contributors', '', ...items, ''].join('\n');
}
