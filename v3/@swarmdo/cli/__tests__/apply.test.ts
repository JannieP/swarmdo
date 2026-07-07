import { describe, it, expect } from 'vitest';
import { parsePatch, applyPatch } from '../src/apply/apply.ts';

const SRC = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n') + '\n';

function patch(body: string) {
  return parsePatch(body)[0];
}

describe('parsePatch', () => {
  it('parses paths (stripping a/ b/) and hunks', () => {
    const p = parsePatch(
      ['diff --git a/foo.ts b/foo.ts', '--- a/foo.ts', '+++ b/foo.ts', '@@ -1,2 +1,2 @@', ' line1', '-line2', '+LINE2'].join('\n'),
    );
    expect(p).toHaveLength(1);
    expect(p[0].oldPath).toBe('foo.ts');
    expect(p[0].newPath).toBe('foo.ts');
    expect(p[0].hunks).toHaveLength(1);
    expect(p[0].hunks[0].oldStart).toBe(1);
  });

  it('handles multiple hunks and files', () => {
    const p = parsePatch(
      ['--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', '--- a/y', '+++ b/y', '@@ -1 +1 @@', '-c', '+d'].join('\n'),
    );
    expect(p).toHaveLength(2);
    expect(p[0].hunks).toHaveLength(1);
  });
});

describe('applyPatch — clean', () => {
  it('applies a change at the exact position', () => {
    const p = patch(['--- a/f', '+++ b/f', '@@ -2,3 +2,3 @@', ' line2', '-line3', '+LINE3', ' line4'].join('\n'));
    const r = applyPatch(SRC, p);
    expect(r.ok).toBe(true);
    expect(r.result).toBe(['line1', 'line2', 'LINE3', 'line4', 'line5'].join('\n') + '\n');
    expect(r.hunks[0].fuzzUsed).toBe(0);
  });

  it('adds and removes lines, updating following-hunk offsets', () => {
    const p = patch(
      ['--- a/f', '+++ b/f', '@@ -1,2 +1,3 @@', ' line1', '+inserted', ' line2', '@@ -4,2 +5,2 @@', ' line4', '-line5', '+LINE5'].join('\n'),
    );
    const r = applyPatch(SRC, p);
    expect(r.ok).toBe(true);
    expect(r.result).toBe(['line1', 'inserted', 'line2', 'line3', 'line4', 'LINE5'].join('\n') + '\n');
  });

  it('preserves absence of a trailing newline', () => {
    const noNl = 'a\nb\nc';
    const p = patch(['--- a/f', '+++ b/f', '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'].join('\n'));
    const r = applyPatch(noNl, p);
    expect(r.result).toBe('a\nB\nc');
    expect(r.result.endsWith('\n')).toBe(false);
  });
});

describe('applyPatch — fuzzy (the point of the tool)', () => {
  it('applies when the hunk line numbers have drifted', () => {
    // Same change, but the hunk header claims line 2 while it actually sits at line 4.
    const drifted = ['x', 'y', 'line1', 'line2', 'line3', 'line4', 'line5'].join('\n') + '\n';
    const p = patch(['--- a/f', '+++ b/f', '@@ -2,3 +2,3 @@', ' line2', '-line3', '+LINE3', ' line4'].join('\n'));
    const r = applyPatch(drifted, p);
    expect(r.ok).toBe(true);
    expect(r.result).toContain('LINE3');
    expect(r.result.split('\n')).toEqual(['x', 'y', 'line1', 'line2', 'LINE3', 'line4', 'line5', '']);
  });

  it('tolerates a drifted trailing context line via fuzz', () => {
    // The hunk's trailing context is 'line4X' but the source has 'line4' — fuzz trims it.
    const p = patch(['--- a/f', '+++ b/f', '@@ -2,3 +2,3 @@', ' line2', '-line3', '+LINE3', ' line4X'].join('\n'));
    const r = applyPatch(SRC, p, { fuzz: 2 });
    expect(r.ok).toBe(true);
    expect(r.hunks[0].fuzzUsed).toBe(1);
    expect(r.result).toContain('LINE3');
  });
});

describe('applyPatch — rejection', () => {
  it('rejects a hunk whose context is nowhere in the source', () => {
    const p = patch(['--- a/f', '+++ b/f', '@@ -1,2 +1,2 @@', ' totally', '-different', '+new', ' context'].join('\n'));
    const r = applyPatch(SRC, p);
    expect(r.ok).toBe(false);
    expect(r.hunks[0].applied).toBe(false);
    expect(r.result).toBe(SRC); // unchanged
  });

  it('applies the good hunk and rejects the bad one (partial)', () => {
    const p = patch(
      ['--- a/f', '+++ b/f', '@@ -2,1 +2,1 @@', '-line2', '+LINE2', '@@ -9,1 +9,1 @@', '-nonexistent', '+x'].join('\n'),
    );
    const r = applyPatch(SRC, p);
    expect(r.ok).toBe(false);
    expect(r.hunks[0].applied).toBe(true);
    expect(r.hunks[1].applied).toBe(false);
    expect(r.result).toContain('LINE2');
  });
});
