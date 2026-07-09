import { describe, it, expect } from 'vitest';
import {
  parseCommit,
  parseGitLog,
  groupCommits,
  renderChangelog,
  lastTag,
  repoUrlFromGit,
  collectCommits,
  type GitRunner,
} from '../src/changelog/changelog.ts';

describe('changelog: parseCommit', () => {
  it('parses type, scope and subject', () => {
    expect(parseCommit('abc', 'feat(usage): add cache view')).toMatchObject({
      type: 'feat', scope: 'usage', subject: 'add cache view', breaking: false, hash: 'abc',
    });
  });
  it('parses type with no scope', () => {
    expect(parseCommit('h', 'fix: correct off-by-one')).toMatchObject({ type: 'fix', scope: null, subject: 'correct off-by-one' });
  });
  it('detects breaking via ! and via BREAKING CHANGE body', () => {
    expect(parseCommit('h', 'feat(api)!: drop v1').breaking).toBe(true);
    expect(parseCommit('h', 'feat(api): change', 'BREAKING CHANGE: removed foo').breaking).toBe(true);
  });
  it('treats non-conventional subjects as type null', () => {
    const c = parseCommit('h', 'wip stuff');
    expect(c.type).toBeNull();
    expect(c.subject).toBe('wip stuff');
  });
  it('classifies git\'s default `Revert "…"` subject as type revert, lifting inner scope', () => {
    const c = parseCommit('r1', 'Revert "feat(auth): add OAuth login"', 'This reverts commit deadbeef.');
    expect(c).toMatchObject({ type: 'revert', scope: 'auth', subject: 'add OAuth login' });
  });
  it('handles a revert of a non-conventional subject (no inner scope)', () => {
    const c = parseCommit('r2', 'Revert "hotfix the thing"');
    expect(c).toMatchObject({ type: 'revert', scope: null, subject: 'hotfix the thing' });
  });
  it('still parses the conventional `revert:` type form', () => {
    expect(parseCommit('r3', 'revert: undo the change')).toMatchObject({ type: 'revert', subject: 'undo the change' });
  });
});

describe('changelog: parseGitLog', () => {
  it('parses the field/record separated format', () => {
    const raw = ['a1\x1ffeat: one\x1f', 'b2\x1ffix(x): two\x1fBREAKING CHANGE: y'].join('\x1e') + '\x1e';
    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ hash: 'a1', type: 'feat', subject: 'one' });
    expect(commits[1]).toMatchObject({ hash: 'b2', type: 'fix', scope: 'x', breaking: true });
  });
  it('ignores blank records', () => {
    expect(parseGitLog('\x1e\x1e')).toEqual([]);
  });
});

describe('changelog: groupCommits', () => {
  const commits = [
    parseCommit('1', 'feat(a): f1'),
    parseCommit('2', 'feat(b): f2'),
    parseCommit('3', 'fix: bug'),
    parseCommit('4', 'chore: deps'),
    parseCommit('5', 'feat!: breaking feature'),
    parseCommit('6', 'random commit'),
  ];
  it('groups by type in section order, hiding chore by default', () => {
    const g = groupCommits(commits);
    expect(g.groups.map((x) => x.type)).toEqual(['feat', 'fix']); // chore hidden
    expect(g.groups[0].commits).toHaveLength(3);
  });
  it('collects breaking changes separately', () => {
    expect(groupCommits(commits).breaking.map((c) => c.hash)).toEqual(['5']);
  });
  it('includes hidden types + other with includeAll', () => {
    const g = groupCommits(commits, { includeAll: true });
    expect(g.groups.map((x) => x.type)).toContain('chore');
    expect(g.other.map((c) => c.hash)).toEqual(['6']);
  });
});

describe('changelog: renderChangelog', () => {
  const commits = [parseCommit('a1b2c3', 'feat(usage): cache view'), parseCommit('d4e5f6', 'fix: crash')];
  it('renders sections, scopes and hashes', () => {
    const md = renderChangelog(commits, { version: 'v1.4.0', date: '2026-07-06' });
    expect(md).toContain('## v1.4.0 (2026-07-06)');
    expect(md).toContain('### Features');
    expect(md).toContain('- **usage:** cache view (`a1b2c3`)');
    expect(md).toContain('### Bug Fixes');
    expect(md).toContain('- crash (`d4e5f6`)');
  });
  it('links hashes when a repoUrl is given', () => {
    const md = renderChangelog(commits, { repoUrl: 'https://github.com/o/r' });
    expect(md).toContain('([`a1b2c3`](https://github.com/o/r/commit/a1b2c3))');
  });
  it('surfaces a Breaking Changes section first', () => {
    const md = renderChangelog([parseCommit('h', 'feat(x)!: big')], {});
    expect(md.indexOf('⚠ Breaking Changes')).toBeGreaterThan(-1);
    expect(md.indexOf('⚠ Breaking Changes')).toBeLessThan(md.indexOf('### Features'));
  });
  it('surfaces a git-revert commit in the Reverts section without --all', () => {
    const md = renderChangelog([parseCommit('r1', 'Revert "feat(auth): add OAuth login"')], {});
    expect(md).toContain('### Reverts');
    expect(md).toContain('- **auth:** add OAuth login');
    expect(md).not.toContain('_No notable changes._');
  });
  it('says so when there are no notable changes', () => {
    expect(renderChangelog([parseCommit('h', 'chore: x')], {})).toContain('_No notable changes._');
  });
});

describe('changelog: git helpers (injected)', () => {
  const mk = (map: Record<string, string>): GitRunner => (args) => {
    const key = args.join(' ');
    for (const [prefix, val] of Object.entries(map)) if (key.startsWith(prefix)) return val;
    throw new Error(`unexpected git ${key}`);
  };
  it('lastTag returns the described tag', () => {
    expect(lastTag(mk({ 'describe --tags': 'v1.3.0\n' }))).toBe('v1.3.0');
  });
  it('lastTag returns null when git throws (no tags)', () => {
    expect(lastTag(() => { throw new Error('no names found'); })).toBeNull();
  });
  it('repoUrlFromGit normalizes ssh + https remotes', () => {
    expect(repoUrlFromGit(mk({ 'remote get-url': 'git@github.com:o/r.git\n' }))).toBe('https://github.com/o/r');
    expect(repoUrlFromGit(mk({ 'remote get-url': 'https://github.com/o/r\n' }))).toBe('https://github.com/o/r');
  });
  it('collectCommits runs git log with the range and parses', () => {
    const git = mk({ 'log v1.0.0..HEAD': 'h1\x1ffeat: x\x1f\x1e' });
    const commits = collectCommits('v1.0.0..HEAD', git);
    expect(commits).toHaveLength(1);
    expect(commits[0].type).toBe('feat');
  });
});
