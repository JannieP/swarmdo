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

  it('honors `\\ No newline` to REMOVE a trailing newline the source had', () => {
    const src = 'a\nb\nc\n'; // source ends with a newline
    const p = patch(['--- a/f', '+++ b/f', '@@ -1,3 +1,3 @@', ' a', ' b', '-c', '+C', '\\ No newline at end of file'].join('\n'));
    const r = applyPatch(src, p);
    expect(r.ok).toBe(true);
    expect(r.result).toBe('a\nb\nC'); // marker on the new line → no trailing newline
    expect(r.result.endsWith('\n')).toBe(false);
  });

  it('honors `\\ No newline` on the OLD side to ADD a trailing newline', () => {
    const src = 'a\nb\nc'; // source has NO trailing newline
    // old `c` had no newline (marker after -c); new `+C` has one (no marker)
    const p = patch(['--- a/f', '+++ b/f', '@@ -1,3 +1,3 @@', ' a', ' b', '-c', '\\ No newline at end of file', '+C'].join('\n'));
    const r = applyPatch(src, p);
    expect(r.ok).toBe(true);
    expect(r.result).toBe('a\nb\nC\n'); // new side has a newline → added
    expect(r.result.endsWith('\n')).toBe(true);
  });

  it('records the no-newline marker on the preceding hunk line during parse', () => {
    const p = patch(['--- a/f', '+++ b/f', '@@ -1 +1 @@', '-c', '+C', '\\ No newline at end of file'].join('\n'));
    const last = p.hunks[0].lines[p.hunks[0].lines.length - 1];
    expect(last).toMatchObject({ type: '+', content: 'C', noEol: true });
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

  it('flags a hunk as ambiguous when its matched block appears more than once', () => {
    // Two identical function bodies; a zero-context single-line hunk could land on either.
    const src = ['function a() {', '  return calc(x, y);', '}', '', 'function b() {', '  return calc(x, y);', '}'].join('\n') + '\n';
    const p = patch(['--- a/f', '+++ b/f', '@@ -2,1 +2,1 @@', '-  return calc(x, y);', '+  return calc(x, y) + 1;'].join('\n'));
    const r = applyPatch(src, p);
    expect(r.ok).toBe(true); // it still applies (at the nearest match)…
    expect(r.hunks[0].ambiguous).toBe(true); // …but flags that the block is duplicated
  });

  it('does NOT flag a unique block as ambiguous', () => {
    const p = patch(['--- a/f', '+++ b/f', '@@ -2,1 +2,1 @@', '-line2', '+LINE2'].join('\n'));
    const r = applyPatch(SRC, p);
    expect(r.hunks[0].applied).toBe(true);
    expect(r.hunks[0].ambiguous).toBeUndefined();
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

describe('applyPatch — CRLF sources (#9)', () => {
  const LF_DIFF = ['--- a/f', '+++ b/f', '@@ -1,3 +1,3 @@', ' line1', '-line2', '+LINE2', ' line3'].join('\n');

  it('applies an LF diff to a CRLF source and preserves CRLF throughout', () => {
    const src = ['line1', 'line2', 'line3'].join('\r\n') + '\r\n';
    const r = applyPatch(src, patch(LF_DIFF));
    expect(r.ok).toBe(true);
    expect(r.result).toBe(['line1', 'LINE2', 'line3'].join('\r\n') + '\r\n');
  });

  it('applies a CRLF diff to an LF source and stays LF', () => {
    const crlfDiff = LF_DIFF.split('\n').join('\r\n');
    const src = ['line1', 'line2', 'line3'].join('\n') + '\n';
    const r = applyPatch(src, patch(crlfDiff));
    expect(r.ok).toBe(true);
    expect(r.result).toBe(['line1', 'LINE2', 'line3'].join('\n') + '\n');
  });

  it('applies a CRLF diff to a CRLF source', () => {
    const crlfDiff = LF_DIFF.split('\n').join('\r\n');
    const src = ['line1', 'line2', 'line3'].join('\r\n') + '\r\n';
    const r = applyPatch(src, patch(crlfDiff));
    expect(r.ok).toBe(true);
    expect(r.result).toBe(['line1', 'LINE2', 'line3'].join('\r\n') + '\r\n');
  });

  it('never emits a bare CR when the replaced line is the no-trailing-newline tail', () => {
    const src = 'line1\r\nline2'; // CRLF file, no trailing newline
    const d = ['--- a/f', '+++ b/f', '@@ -1,2 +1,2 @@', ' line1', '-line2', '+LINE2'].join('\n');
    const r = applyPatch(src, patch(d));
    expect(r.ok).toBe(true);
    expect(r.result).toBe('line1\r\nLINE2');
  });

  it('leaves untouched lines of a mixed-EOL source byte-exact', () => {
    const src = 'a\r\nb\nc\r\nd\n'; // mixed: a,c CRLF; b,d LF
    const d = ['--- a/f', '+++ b/f', '@@ -2,1 +2,1 @@', '-b', '+B'].join('\n');
    const r = applyPatch(src, patch(d));
    expect(r.ok).toBe(true);
    // CRLF is not dominant (2 of 4), so the inserted line gets LF; a and c keep \r\n
    expect(r.result).toBe('a\r\nB\nc\r\nd\n');
  });

  it('still flags ambiguity on CRLF sources', () => {
    const src = ['dup', 'x', 'dup', 'y'].join('\r\n') + '\r\n';
    const d = ['--- a/f', '+++ b/f', '@@ -1,1 +1,1 @@', '-dup', '+DUP'].join('\n');
    const r = applyPatch(src, patch(d));
    expect(r.ok).toBe(true);
    expect(r.hunks[0].ambiguous).toBe(true);
  });
});
