import { describe, it, expect } from 'vitest';
import { nextVersion, parseVersion, planRelease, renderStep, TRIO_FILES } from '../src/release/release.ts';

describe('release: version math', () => {
  it('bumps patch/minor/major', () => {
    expect(nextVersion('1.4.8', 'patch')).toBe('1.4.9');
    expect(nextVersion('1.4.8', 'minor')).toBe('1.5.0');
    expect(nextVersion('1.4.8', 'major')).toBe('2.0.0');
  });
  it('accepts an explicit greater version, rejects lower/equal/junk', () => {
    expect(nextVersion('1.4.8', '1.6.2')).toBe('1.6.2');
    expect(() => nextVersion('1.4.8', '1.4.8')).toThrow(/greater/);
    expect(() => nextVersion('1.4.8', '1.2.0')).toThrow(/greater/);
    expect(() => nextVersion('1.4.8', 'banana')).toThrow(/semver/);
    expect(() => parseVersion('1.4')).toThrow(/semver/);
    expect(() => parseVersion('1.4.8-alpha.1')).toThrow(/semver/); // stable-only policy
  });
});

describe('release: planRelease', () => {
  const base = { current: '1.4.8', repoRoot: '/repo' };

  it('plans the full nine-phase train in order', () => {
    const plan = planRelease({ ...base, bump: 'patch' });
    expect(plan.next).toBe('1.4.9');
    expect(plan.tag).toBe('v1.4.9');
    const kinds = plan.steps.map((s) => s.kind);
    // trio + lock + docs before any exec
    expect(kinds.slice(0, 5)).toEqual(['bump-json', 'bump-json', 'bump-json', 'bump-lock', 'sync-docs']);
    const titles = plan.steps.filter((s) => s.kind === 'exec').map((s: any) => s.title);
    expect(titles).toEqual([
      'commit release', 'push main',
      'build @swarmdo/cli', 'stage standalone cli',
      'publish @swarmdo/cli', 'publish swarmdo umbrella',
      'tag', 'push tag',
    ]);
    expect(kinds).toContain('verify-npm');
    expect(kinds[kinds.length - 1]).toBe('gh-release');
  });

  it('publishes the cli from INSIDE dist-standalone (guard-safe)', () => {
    const plan = planRelease({ ...base, bump: 'patch' });
    const pub: any = plan.steps.find((s: any) => s.title === 'publish @swarmdo/cli');
    expect(pub.cwd).toBe('/repo/v3/@swarmdo/cli/dist-standalone');
    expect(pub.args).toEqual(['publish']);
  });

  it('bumps the whole trio', () => {
    const plan = planRelease({ ...base, bump: 'patch' });
    const files = plan.steps.filter((s) => s.kind === 'bump-json').map((s: any) => s.file);
    expect(files).toEqual(TRIO_FILES);
  });

  it('--skip-publish drops publish+verify but keeps tag/release', () => {
    const plan = planRelease({ ...base, bump: 'minor', skipPublish: true });
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds).not.toContain('verify-npm');
    expect(plan.steps.some((s: any) => s.title === 'publish swarmdo umbrella')).toBe(false);
    expect(plan.steps.some((s: any) => s.title === 'tag')).toBe(true);
    expect(kinds[kinds.length - 1]).toBe('gh-release');
  });

  it('--skip-gh-release ends at the tag push; notes range starts at current tag', () => {
    const noGh = planRelease({ ...base, bump: 'patch', skipGhRelease: true });
    expect(noGh.steps[noGh.steps.length - 1]).toMatchObject({ kind: 'exec', title: 'push tag' });
    const withGh: any = planRelease({ ...base, bump: 'patch' }).steps.at(-1);
    expect(withGh.notesFrom).toBe('v1.4.8');
  });

  it('every step renders to a human line', () => {
    for (const s of planRelease({ ...base, bump: 'patch' }).steps) {
      expect(renderStep(s).length).toBeGreaterThan(5);
    }
  });
});
