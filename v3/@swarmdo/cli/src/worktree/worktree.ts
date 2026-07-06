/**
 * worktree.ts — git-worktree isolation for parallel agent/task work.
 *
 * A swarm orchestrator runs many agents against one repo; without isolation they
 * edit the same working tree and collide. This gives each unit of work its own
 * `git worktree` + branch (pattern proven by claude-squad 8k★ / vibe-kanban 27k★),
 * so N agents work independently and you review each diff before merging.
 *
 * Managed worktrees live under `.swarm/worktrees/<name>` on branch
 * `swarmdo/<name>`. The git runner is injectable so name-sanitizing, porcelain
 * parsing, and the arg-building for every op are unit-tested without real git.
 */

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export const BRANCH_PREFIX = 'swarmdo/';
export const WT_SUBDIR = path.join('.swarm', 'worktrees');

export interface GitResult {
  stdout: string;
  stderr: string;
  status: number;
}
/** Run `git <args>` in `cwd`. `allowFail` returns a non-zero result instead of throwing. */
export type GitRunner = (args: string[], opts?: { cwd?: string; allowFail?: boolean }) => GitResult;

export function makeGitRunner(defaultCwd: string): GitRunner {
  return (args, opts = {}) => {
    try {
      const stdout = execFileSync('git', args, {
        cwd: opts.cwd ?? defaultCwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
      return { stdout, stderr: '', status: 0 };
    } catch (e) {
      const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      if (opts.allowFail) {
        return {
          stdout: err.stdout ? String(err.stdout) : '',
          stderr: err.stderr ? String(err.stderr) : String(e),
          status: typeof err.status === 'number' ? err.status : 1,
        };
      }
      throw e;
    }
  };
}

/** Normalize a user-supplied name to a safe slug, or null if it can't be made safe.
 * Allows letters/digits/dot/dash/underscore; collapses others to '-'; no leading
 * dot/dash, no '..', bounded length. */
export function sanitizeName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
  s = s.replace(/^[.-]+/, '').replace(/[.-]+$/, '');
  if (!s || s.includes('..')) return null;
  if (s.length > 60) s = s.slice(0, 60).replace(/[.-]+$/, '');
  return s || null;
}

export function branchFor(name: string): string {
  return `${BRANCH_PREFIX}${name}`;
}
/** Absolute worktree path for a managed name. */
export function pathFor(repoRoot: string, name: string): string {
  return path.join(repoRoot, WT_SUBDIR, name);
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  detached: boolean;
  /** managed = created by swarmdo (path under .swarm/worktrees or branch under swarmdo/) */
  managed: boolean;
  /** the <name> for managed worktrees */
  name: string | null;
}

/** Parse `git worktree list --porcelain`. Records are blank-line separated;
 * each has `worktree <path>`, optional `HEAD <sha>`, and `branch <ref>` or `detached`. */
export function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const out: WorktreeInfo[] = [];
  let cur: Partial<WorktreeInfo> | null = null;
  const flush = () => {
    if (cur && cur.path) {
      const branch = cur.branch ?? null;
      const underDir = cur.path.split(path.sep).join('/').includes(`/${WT_SUBDIR.split(path.sep).join('/')}/`);
      const branchManaged = !!branch && branch.startsWith(BRANCH_PREFIX);
      const managed = underDir || branchManaged;
      let name: string | null = null;
      if (branchManaged && branch) name = branch.slice(BRANCH_PREFIX.length);
      else if (underDir) name = cur.path.split(/[/\\]/).pop() ?? null;
      out.push({
        path: cur.path,
        head: cur.head ?? '',
        branch,
        detached: !!cur.detached,
        managed,
        name,
      });
    }
    cur = null;
  };
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush();
      cur = { path: line.slice('worktree '.length).trim() };
    } else if (!cur) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      // `branch refs/heads/foo` → `foo`
      cur.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    } else if (line.trim() === 'detached') {
      cur.detached = true;
    } else if (line.trim() === '') {
      flush();
    }
  }
  flush();
  return out;
}

/** Current branch of the primary worktree (merge target), or 'HEAD' if detached. */
export function currentBranch(git: GitRunner): string {
  const r = git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  return r.status === 0 ? r.stdout.trim() : 'HEAD';
}

export interface AddResult { branch: string; path: string; base: string; }

export function worktreeAdd(git: GitRunner, repoRoot: string, name: string, base?: string): AddResult {
  const branch = branchFor(name);
  const wtPath = pathFor(repoRoot, name);
  const baseRef = base && base.trim() ? base.trim() : currentBranch(git);
  const r = git(['worktree', 'add', '-b', branch, wtPath, baseRef], { allowFail: true });
  if (r.status !== 0) {
    throw new Error(r.stderr.trim() || `git worktree add failed for ${name}`);
  }
  return { branch, path: wtPath, base: baseRef };
}

export function worktreeList(git: GitRunner): WorktreeInfo[] {
  const r = git(['worktree', 'list', '--porcelain'], { allowFail: true });
  if (r.status !== 0) return [];
  return parseWorktreeList(r.stdout);
}

export function worktreeDiff(git: GitRunner, repoRoot: string, name: string, opts: { base?: string; stat?: boolean } = {}): string {
  const wtPath = pathFor(repoRoot, name);
  const base = opts.base && opts.base.trim() ? opts.base.trim() : currentBranch(git);
  const args = ['-C', wtPath, '--no-pager', 'diff'];
  if (opts.stat) args.push('--stat');
  args.push(base);
  const r = git(args, { allowFail: true });
  return r.status === 0 ? r.stdout : (r.stderr || r.stdout);
}

export interface MergeResult { ok: boolean; output: string; conflict: boolean; }

export function worktreeMerge(git: GitRunner, name: string, opts: { noFf?: boolean } = {}): MergeResult {
  const branch = branchFor(name);
  const args = ['merge'];
  if (opts.noFf) args.push('--no-ff');
  args.push(branch);
  const r = git(args, { allowFail: true });
  const output = `${r.stdout}${r.stderr}`.trim();
  const conflict = r.status !== 0 && /conflict/i.test(output);
  return { ok: r.status === 0, output, conflict };
}

export interface RemoveResult { ok: boolean; output: string; branchDeleted: boolean; }

export function worktreeRemove(git: GitRunner, repoRoot: string, name: string, opts: { force?: boolean; keepBranch?: boolean } = {}): RemoveResult {
  const wtPath = pathFor(repoRoot, name);
  const branch = branchFor(name);
  const rmArgs = ['worktree', 'remove', wtPath];
  if (opts.force) rmArgs.push('--force');
  const rm = git(rmArgs, { allowFail: true });
  if (rm.status !== 0) {
    return { ok: false, output: (rm.stderr || rm.stdout).trim(), branchDeleted: false };
  }
  let branchDeleted = false;
  if (!opts.keepBranch) {
    const del = git(['branch', '-D', branch], { allowFail: true });
    branchDeleted = del.status === 0;
  }
  return { ok: true, output: `removed worktree ${wtPath}`, branchDeleted };
}
