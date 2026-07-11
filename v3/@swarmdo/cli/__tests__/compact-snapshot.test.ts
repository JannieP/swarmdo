/**
 * #45 Phase 1 — the compaction-survival digest engine. Pure: session signals
 * in (with an injected `now`), a re-grounding digest/string out.
 */
import { describe, it, expect } from 'vitest';
import {
  porcelainPath,
  buildDigest,
  isDigestEmpty,
  formatDigest,
  type DigestInput,
} from '../src/compact-snapshot/compact-snapshot.ts';

describe('porcelainPath', () => {
  it('extracts the path from a normal status line', () => {
    expect(porcelainPath(' M src/a.ts')).toBe('src/a.ts');
    expect(porcelainPath('?? new.txt')).toBe('new.txt');
    expect(porcelainPath('A  added.ts')).toBe('added.ts');
  });
  it('takes the destination of a rename/copy', () => {
    expect(porcelainPath('R  old/name.ts -> new/name.ts')).toBe('new/name.ts');
  });
  it('does NOT split a non-rename path that merely contains " -> "', () => {
    // status ` M` (modified) / `??` (untracked), not R/C → the arrow is part of the real name
    expect(porcelainPath(' M docs/v1 -> v2 migration.md')).toBe('docs/v1 -> v2 migration.md');
    expect(porcelainPath('?? a -> b.txt')).toBe('a -> b.txt');
  });
  it('unwraps a git-quoted path (special chars)', () => {
    expect(porcelainPath('?? "with space.ts"')).toBe('with space.ts');
  });
  it('returns null for blanks/too-short lines', () => {
    expect(porcelainPath('')).toBeNull();
    expect(porcelainPath('M')).toBeNull();
  });
});

describe('buildDigest', () => {
  const NOW = 1_000_000;

  it('dedupes edits by file, most-recent edit first', () => {
    const input: DigestInput = {
      now: NOW,
      edits: [
        { file: 'a.ts', timestamp: 10 },
        { file: 'b.ts', timestamp: 30 },
        { file: 'a.ts', timestamp: 50 }, // a re-edited later → a should lead
      ],
    };
    expect(buildDigest(input).recentFiles).toEqual(['a.ts', 'b.ts']);
  });

  it('caps recentFiles at maxFiles', () => {
    const edits = Array.from({ length: 20 }, (_, i) => ({ file: `f${i}.ts`, timestamp: i }));
    const d = buildDigest({ now: NOW, edits }, { maxFiles: 5 });
    expect(d.recentFiles).toHaveLength(5);
    expect(d.recentFiles[0]).toBe('f19.ts'); // highest timestamp first
  });

  it('parses + dedupes uncommitted paths from porcelain, capped', () => {
    const d = buildDigest({
      now: NOW,
      gitStatus: [' M x.ts', '?? y.md', ' M x.ts', 'R  a -> b'],
    });
    expect(d.uncommitted).toEqual(['x.ts', 'y.md', 'b']);
  });

  it('passes through branch and takenAt; omits branch when absent', () => {
    expect(buildDigest({ now: NOW, branch: 'main' }).branch).toBe('main');
    expect(buildDigest({ now: NOW }).branch).toBeUndefined();
    expect(buildDigest({ now: NOW }).takenAt).toBe(NOW);
  });

  it('ignores malformed edit records without throwing', () => {
    const d = buildDigest({ now: NOW, edits: [{ file: '', timestamp: 1 }, { file: 'ok.ts', timestamp: 2 }] as never });
    expect(d.recentFiles).toEqual(['ok.ts']);
  });
});

describe('formatDigest / isDigestEmpty', () => {
  const NOW = 1_000_000;

  it('renders a re-grounding block with a relative age', () => {
    const d = buildDigest({ now: NOW - 120_000, branch: 'main', edits: [{ file: 'a.ts', timestamp: 1 }], gitStatus: [' M a.ts'] });
    const out = formatDigest(d, NOW);
    expect(out).toContain('restored after compaction (snapshot 2m ago)');
    expect(out).toContain('- Branch: main');
    expect(out).toContain('Recently edited (1): a.ts');
    expect(out).toContain('Uncommitted changes (1): a.ts');
    expect(out).toContain('Resume this work');
  });

  it('is empty (no injection) when there are no files', () => {
    const d = buildDigest({ now: NOW, branch: 'main' }); // branch only, no files
    expect(isDigestEmpty(d)).toBe(true);
    expect(formatDigest(d, NOW)).toBe('');
  });

  it('renders seconds/hours ages correctly', () => {
    const base = { recentFiles: ['a.ts'], uncommitted: [] };
    expect(formatDigest({ ...base, takenAt: NOW - 5_000 }, NOW)).toContain('5s ago');
    expect(formatDigest({ ...base, takenAt: NOW - 7_200_000 }, NOW)).toContain('2h ago');
  });
});
