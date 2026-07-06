import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  branchFor,
  pathFor,
  parseWorktreeList,
  worktreeAdd,
  worktreeList,
  worktreeDiff,
  worktreeMerge,
  worktreeRemove,
  currentBranch,
  type GitRunner,
  type GitResult,
} from '../src/worktree/worktree.ts';

/** Mock git runner: records every call, returns canned results keyed by the
 * first two args (e.g. "worktree add", "merge", "rev-parse"). */
function mockGit(responses: Record<string, GitResult>, calls: string[][] = []): GitRunner {
  return (args) => {
    calls.push(args);
    const key2 = args.slice(0, 2).join(' ');
    const key1 = args[0];
    const r = responses[key2] ?? responses[key1];
    return r ?? { stdout: '', stderr: '', status: 0 };
  };
}
const ok = (stdout = ''): GitResult => ({ stdout, stderr: '', status: 0 });
const fail = (stderr: string, status = 1): GitResult => ({ stdout: '', stderr, status });

describe('worktree: sanitizeName', () => {
  it('keeps valid slugs', () => {
    expect(sanitizeName('feature-x')).toBe('feature-x');
    expect(sanitizeName('fix.42_a')).toBe('fix.42_a');
  });
  it('lowercases and collapses illegal chars', () => {
    expect(sanitizeName('Feature X!!')).toBe('feature-x');
    expect(sanitizeName('a/b c')).toBe('a-b-c');
  });
  it('trims leading/trailing dots and dashes', () => {
    expect(sanitizeName('--foo--')).toBe('foo');
    expect(sanitizeName('.hidden')).toBe('hidden');
  });
  it('rejects empty and traversal', () => {
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName('..')).toBeNull();
    expect(sanitizeName('a..b')).toBeNull();
  });
  it('bounds length', () => {
    expect(sanitizeName('x'.repeat(200))!.length).toBeLessThanOrEqual(60);
  });
});

describe('worktree: branchFor / pathFor', () => {
  it('namespaces the branch', () => {
    expect(branchFor('foo')).toBe('swarmdo/foo');
  });
  it('places the worktree under .swarm/worktrees', () => {
    expect(pathFor('/repo', 'foo').replace(/\\/g, '/')).toBe('/repo/.swarm/worktrees/foo');
  });
});

describe('worktree: parseWorktreeList', () => {
  const porcelain = [
    'worktree /repo',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /repo/.swarm/worktrees/feat',
    'HEAD def456',
    'branch refs/heads/swarmdo/feat',
    '',
    'worktree /repo/.swarm/worktrees/detachy',
    'HEAD 999',
    'detached',
    '',
  ].join('\n');

  it('parses all records', () => {
    const wts = parseWorktreeList(porcelain);
    expect(wts).toHaveLength(3);
    expect(wts[0].branch).toBe('main');
    expect(wts[0].managed).toBe(false); // primary, not managed
  });
  it('flags swarmdo-managed worktrees and extracts the name', () => {
    const wts = parseWorktreeList(porcelain);
    const feat = wts.find((w) => w.path.endsWith('/feat'))!;
    expect(feat.managed).toBe(true);
    expect(feat.branch).toBe('swarmdo/feat');
    expect(feat.name).toBe('feat');
  });
  it('handles detached worktrees under the managed dir', () => {
    const wts = parseWorktreeList(porcelain);
    const d = wts.find((w) => w.path.endsWith('/detachy'))!;
    expect(d.detached).toBe(true);
    expect(d.managed).toBe(true); // path-based
    expect(d.name).toBe('detachy');
  });
  it('returns [] for empty input', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('worktree: currentBranch', () => {
  it('returns the abbrev ref', () => {
    expect(currentBranch(mockGit({ 'rev-parse': ok('develop\n') }))).toBe('develop');
  });
  it('falls back to HEAD on failure', () => {
    expect(currentBranch(mockGit({ 'rev-parse': fail('detached') }))).toBe('HEAD');
  });
});

describe('worktree: worktreeAdd', () => {
  it('builds the right args and resolves base from current branch', () => {
    const calls: string[][] = [];
    const git = mockGit({ 'rev-parse': ok('main\n'), 'worktree add': ok() }, calls);
    const res = worktreeAdd(git, '/repo', 'feat');
    expect(res.branch).toBe('swarmdo/feat');
    expect(res.base).toBe('main');
    const add = calls.find((c) => c[0] === 'worktree' && c[1] === 'add')!;
    expect(add).toEqual(['worktree', 'add', '-b', 'swarmdo/feat', pathFor('/repo', 'feat'), 'main']);
  });
  it('honors an explicit base', () => {
    const calls: string[][] = [];
    const git = mockGit({ 'worktree add': ok() }, calls);
    const res = worktreeAdd(git, '/repo', 'feat', 'v1.0');
    expect(res.base).toBe('v1.0');
    expect(calls[0][calls[0].length - 1]).toBe('v1.0');
  });
  it('throws with git stderr on failure', () => {
    const git = mockGit({ 'rev-parse': ok('main'), 'worktree add': fail("fatal: branch 'swarmdo/feat' already exists") });
    expect(() => worktreeAdd(git, '/repo', 'feat')).toThrow(/already exists/);
  });
});

describe('worktree: worktreeList', () => {
  it('parses porcelain output', () => {
    const git = mockGit({ 'worktree list': ok('worktree /repo\nHEAD a\nbranch refs/heads/main\n\n') });
    expect(worktreeList(git)).toHaveLength(1);
  });
  it('returns [] when git fails', () => {
    expect(worktreeList(mockGit({ 'worktree list': fail('not a repo') }))).toEqual([]);
  });
});

describe('worktree: worktreeDiff', () => {
  it('adds --stat and uses the resolved base', () => {
    const calls: string[][] = [];
    const git = mockGit({ 'rev-parse': ok('main\n'), '-C': ok('  a | 2 +-\n') }, calls);
    const out = worktreeDiff(git, '/repo', 'feat', { stat: true });
    expect(out).toContain('a | 2');
    const diff = calls.find((c) => c.includes('diff'))!;
    expect(diff).toEqual(['-C', pathFor('/repo', 'feat'), '--no-pager', 'diff', '--stat', 'main']);
  });
});

describe('worktree: worktreeMerge', () => {
  it('merges the namespaced branch', () => {
    const calls: string[][] = [];
    const git = mockGit({ merge: ok('Fast-forward\n') }, calls);
    const res = worktreeMerge(git, 'feat');
    expect(res.ok).toBe(true);
    expect(calls[0]).toEqual(['merge', 'swarmdo/feat']);
  });
  it('adds --no-ff', () => {
    const calls: string[][] = [];
    worktreeMerge(mockGit({ merge: ok() }, calls), 'feat', { noFf: true });
    expect(calls[0]).toEqual(['merge', '--no-ff', 'swarmdo/feat']);
  });
  it('detects conflicts', () => {
    const git = mockGit({ merge: fail('CONFLICT (content): Merge conflict in a.txt') });
    const res = worktreeMerge(git, 'feat');
    expect(res.ok).toBe(false);
    expect(res.conflict).toBe(true);
  });
});

describe('worktree: worktreeRemove', () => {
  it('removes worktree and deletes branch by default', () => {
    const calls: string[][] = [];
    const git = mockGit({ 'worktree remove': ok(), branch: ok() }, calls);
    const res = worktreeRemove(git, '/repo', 'feat');
    expect(res.ok).toBe(true);
    expect(res.branchDeleted).toBe(true);
    expect(calls.some((c) => c[0] === 'branch' && c[1] === '-D' && c[2] === 'swarmdo/feat')).toBe(true);
  });
  it('keeps the branch with keepBranch', () => {
    const calls: string[][] = [];
    const git = mockGit({ 'worktree remove': ok() }, calls);
    const res = worktreeRemove(git, '/repo', 'feat', { keepBranch: true });
    expect(res.branchDeleted).toBe(false);
    expect(calls.some((c) => c[0] === 'branch')).toBe(false);
  });
  it('adds --force and reports removal failure', () => {
    const calls: string[][] = [];
    const gitForce = mockGit({ 'worktree remove': ok(), branch: ok() }, calls);
    worktreeRemove(gitForce, '/repo', 'feat', { force: true });
    expect(calls[0]).toContain('--force');

    const gitFail = mockGit({ 'worktree remove': fail('contains modified or untracked files, use --force') });
    const res = worktreeRemove(gitFail, '/repo', 'feat');
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/--force/);
  });
});
