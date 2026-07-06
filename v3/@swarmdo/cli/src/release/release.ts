/**
 * release.ts — plan the whole swarmdo release train as data.
 *
 * The proven flow (first executed by hand for v1.4.8) is nine steps: bump the
 * version trio + lockfile, sync the doc version strings, commit+push, build,
 * stage the self-contained @swarmdo/cli, publish both packages, verify the
 * registry, tag, and cut a GitHub release with `swarmdo changelog` notes.
 * This module turns that into a PURE planner — inputs in, an ordered list of
 * typed steps out — so the plan is unit-testable and the command layer only
 * interprets steps (dry-run prints them; --confirm executes them).
 */

export interface ReleaseInput {
  /** current version from v3/@swarmdo/cli/package.json (trio source of truth) */
  current: string;
  /** 'patch' | 'minor' | 'major' | explicit 'x.y.z' */
  bump: string;
  /** absolute repo root */
  repoRoot: string;
  /** skip npm publish steps (still bumps/commits/tags) */
  skipPublish?: boolean;
  /** skip the gh release step */
  skipGhRelease?: boolean;
  /** skip the live-site deploy (docs-sync rule says DON'T unless the release truly has zero user-facing surface) */
  skipSite?: boolean;
}

export type ReleaseStep =
  | { kind: 'bump-json'; file: string; version: string }
  | { kind: 'bump-lock'; file: string; version: string }
  | { kind: 'sync-docs'; version: string; files: string[] }
  | { kind: 'exec'; title: string; cmd: string; args: string[]; cwd: string }
  | { kind: 'verify-npm'; packages: string[]; version: string }
  | { kind: 'gh-release'; tag: string; notesFrom: string }
  // user rule 2026-07-07: no release without the live site updated —
  // copy website/index.html to the SwarmDo/swarmdo.com repo, push, verify
  | { kind: 'deploy-site'; version: string };

export interface ReleasePlan {
  current: string;
  next: string;
  tag: string;
  steps: ReleaseStep[];
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(v: string): [number, number, number] {
  const m = SEMVER.exec(v.trim());
  if (!m) throw new Error(`not a stable semver version: "${v}" (expected x.y.z)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function nextVersion(current: string, bump: string): string {
  const [maj, min, pat] = parseVersion(current);
  switch (bump) {
    case 'patch': return `${maj}.${min}.${pat + 1}`;
    case 'minor': return `${maj}.${min + 1}.0`;
    case 'major': return `${maj + 1}.0.0`;
    default: {
      const [nmaj, nmin, npat] = parseVersion(bump); // throws on junk
      const cmp = nmaj - maj || nmin - min || npat - pat;
      if (cmp <= 0) throw new Error(`explicit version ${bump} must be greater than current ${current}`);
      return bump;
    }
  }
}

/** The version trio + lockfile, relative to the repo root. */
export const TRIO_FILES = [
  'v3/@swarmdo/cli/package.json',
  'package.json',
  'swarmdo/package.json',
];
export const LOCK_FILE = 'package-lock.json';
/** Docs whose version strings ride along with every release. */
export const DOC_FILES = ['CLAUDE.md', 'README.md', 'website/index.html'];

export function planRelease(input: ReleaseInput): ReleasePlan {
  const next = nextVersion(input.current, input.bump);
  const tag = `v${next}`;
  const root = input.repoRoot;
  const cli = `${root}/v3/@swarmdo/cli`;
  const steps: ReleaseStep[] = [];

  for (const f of TRIO_FILES) steps.push({ kind: 'bump-json', file: f, version: next });
  steps.push({ kind: 'bump-lock', file: LOCK_FILE, version: next });
  steps.push({ kind: 'sync-docs', version: next, files: DOC_FILES });
  steps.push({ kind: 'exec', title: 'commit release', cmd: 'git', args: ['commit', '-am', `release: ${tag}`], cwd: root });
  steps.push({ kind: 'exec', title: 'push main', cmd: 'git', args: ['push', 'origin', 'main'], cwd: root });

  if (!input.skipPublish) {
    steps.push({ kind: 'exec', title: 'build @swarmdo/cli', cmd: 'npm', args: ['run', 'build'], cwd: cli });
    steps.push({ kind: 'exec', title: 'stage standalone cli', cmd: 'node', args: ['scripts/build-standalone.mjs'], cwd: cli });
    // NOTE: publish runs from INSIDE dist-standalone — `npm publish <folder>`
    // from the package dir would trip the intentional prepublishOnly guard
    steps.push({ kind: 'exec', title: 'publish @swarmdo/cli', cmd: 'npm', args: ['publish'], cwd: `${cli}/dist-standalone` });
    steps.push({ kind: 'exec', title: 'publish swarmdo umbrella', cmd: 'npm', args: ['publish'], cwd: root });
    steps.push({ kind: 'verify-npm', packages: ['@swarmdo/cli', 'swarmdo'], version: next });
  }

  steps.push({ kind: 'exec', title: 'tag', cmd: 'git', args: ['tag', tag, 'main'], cwd: root });
  steps.push({ kind: 'exec', title: 'push tag', cmd: 'git', args: ['push', 'origin', tag], cwd: root });
  if (!input.skipGhRelease) {
    steps.push({ kind: 'gh-release', tag, notesFrom: `v${input.current}` });
  }
  if (!input.skipSite) {
    steps.push({ kind: 'deploy-site', version: next });
  }
  return { current: input.current, next, tag, steps };
}

/** One-line human rendering of a step (for the dry-run plan). */
export function renderStep(s: ReleaseStep): string {
  switch (s.kind) {
    case 'bump-json': return `bump ${s.file} → ${s.version}`;
    case 'bump-lock': return `bump ${s.file} (version + packages."") → ${s.version}`;
    case 'sync-docs': return `sync version strings → ${s.version} in ${s.files.join(', ')}`;
    case 'exec': return `${s.title}:  ${s.cmd} ${s.args.join(' ')}  (${s.cwd})`;
    case 'verify-npm': return `verify npm: ${s.packages.join(', ')} @latest === ${s.version}`;
    case 'gh-release': return `gh release ${s.tag} with \`swarmdo changelog\` notes since ${s.notesFrom}`;
    case 'deploy-site': return `deploy website → SwarmDo/swarmdo.com (copy working copy, push, curl-verify swarmdo.com serves ${s.version})`;
  }
}
