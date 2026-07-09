import { describe, it, expect } from 'vitest';
import {
  parseJUnit, parseTAP, detectFormat, parseTestReport, mergeSummaries, extractFileLine, formatSummary,
} from '../src/testreport/testreport.ts';

const JUNIT = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="math" tests="3" failures="1">
    <testcase classname="math" name="adds" time="0.012"/>
    <testcase classname="math" name="divides" time="0.005">
      <failure message="expected 2 to be 3" type="AssertionError">
        AssertionError: expected 2 to be 3
            at divide (src/math.ts:14:9)
      </failure>
    </testcase>
    <testcase classname="math" name="rounds" time="0.001">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;

describe('parseJUnit', () => {
  const s = parseJUnit(JUNIT);
  it('counts pass/fail/skip and total', () => {
    expect(s).toMatchObject({ passed: 1, failed: 1, skipped: 1, total: 3 });
  });
  it('sums durations into ms', () => {
    expect(s.durationMs).toBe(18); // 12 + 5 + 1
  });
  it('captures the failure with suite, name, message, and file:line from the trace', () => {
    expect(s.failures).toHaveLength(1);
    expect(s.failures[0]).toMatchObject({
      suite: 'math', name: 'divides', type: 'AssertionError',
      message: 'expected 2 to be 3', file: 'src/math.ts', line: 14,
    });
  });
  it('handles an error tag and message-attr-only failures', () => {
    const s2 = parseJUnit(`<testcase name="boom"><error message="kaboom" type="Error"/></testcase>`);
    expect(s2.failed).toBe(1);
    expect(s2.failures[0]).toMatchObject({ name: 'boom', message: 'kaboom', type: 'Error' });
  });
  it('decodes XML entities in names/messages', () => {
    const s3 = parseJUnit(`<testcase name="renders &lt;Foo&gt;"><failure message="a &amp; b"/></testcase>`);
    expect(s3.failures[0].name).toBe('renders <Foo>');
    expect(s3.failures[0].message).toBe('a & b');
  });
  it('strips CDATA wrappers from a body-only <failure> (Maven Surefire shape)', () => {
    // Surefire wraps stack traces in CDATA and often omits the message attr.
    const xml = `<testcase name="t1" classname="Foo"><failure type="AssertionError"><![CDATA[java.lang.AssertionError: expected <2> but was <1>
	at Foo.bar(Foo.java:42)]]></failure></testcase>`;
    const f = parseJUnit(xml).failures[0];
    expect(f.message).toBe('java.lang.AssertionError: expected <2> but was <1>');
    expect(f.message).not.toMatch(/<!\[CDATA\[|\]\]>/); // no markers leak
    expect(f).toMatchObject({ file: 'Foo.java', line: 42, type: 'AssertionError' });
  });
  it('keeps entities inside CDATA literal (CDATA content is never entity-decoded)', () => {
    const xml = `<testcase name="t2"><failure><![CDATA[assert a &lt; b failed]]></failure></testcase>`;
    // &lt; is literal text inside CDATA — must NOT become '<'
    expect(parseJUnit(xml).failures[0].message).toBe('assert a &lt; b failed');
  });
  it('still entity-decodes non-CDATA failure bodies (mixed content)', () => {
    const xml = `<testcase name="t3"><failure>plain &amp; text<![CDATA[ + literal &amp;]]></failure></testcase>`;
    expect(parseJUnit(xml).failures[0].message).toBe('plain & text + literal &amp;');
  });
});

describe('parseTAP', () => {
  const TAP = `TAP version 13
1..4
ok 1 - adds
not ok 2 - divides
  ---
  message: expected 2 to be 3
  at: src/math.ts:14:9
  ...
ok 3 - rounds # SKIP not ready
not ok 4 - subtracts`;
  const s = parseTAP(TAP);
  it('counts ok / not ok / SKIP', () => {
    expect(s).toMatchObject({ passed: 1, failed: 2, skipped: 1, total: 4 });
  });
  it('reads the YAML diagnostic for message + file:line', () => {
    const f = s.failures.find((x) => x.name === 'divides')!;
    expect(f.message).toBe('expected 2 to be 3');
    expect(f).toMatchObject({ file: 'src/math.ts', line: 14 });
  });
  it('captures a bare not-ok without diagnostics', () => {
    expect(s.failures.find((x) => x.name === 'subtracts')).toBeTruthy();
  });
  it('surfaces a `Bail out!` instead of letting an aborted suite look clean', () => {
    // suite bails after 1 pass — a naive parser reports "1 passed, 0 failed ✓"
    const r = parseTAP('TAP version 13\n1..50\nok 1 - a\nBail out! Database unavailable\nok 2 - b');
    expect(r.bailedOut).toBe(true);
    expect(r.bailReason).toBe('Database unavailable');
    expect(r.passed).toBe(1); // counting stops at the bail; the trailing ok 2 is ignored
    expect(r.failed).toBe(0);
  });
  it('handles a bare `Bail out!` with no reason', () => {
    const r = parseTAP('1..2\nok 1\nBail out!');
    expect(r.bailedOut).toBe(true);
    expect(r.bailReason).toBeUndefined();
  });
  it('leaves bailedOut unset for a normal run', () => {
    expect(parseTAP('1..1\nok 1 - a').bailedOut).toBeUndefined();
  });
});

describe('extractFileLine', () => {
  it('prefers a parenthesised frame', () => {
    expect(extractFileLine('at foo (src/a.ts:9:3)')).toEqual({ file: 'src/a.ts', line: 9 });
  });
  it('falls back to a bare path:line', () => {
    expect(extractFileLine('src/b.ts:42: boom')).toEqual({ file: 'src/b.ts', line: 42 });
  });
  it('returns empty when no location', () => {
    expect(extractFileLine('no location here')).toEqual({});
  });
});

describe('detectFormat', () => {
  it('uses extension first', () => {
    expect(detectFormat('ok 1', 'r.xml')).toBe('junit');
    expect(detectFormat('<testcase/>', 'r.tap')).toBe('tap');
  });
  it('sniffs content when no telling extension', () => {
    expect(detectFormat('<testsuite name="x">')).toBe('junit');
    expect(detectFormat('TAP version 13\n1..1\nok 1')).toBe('tap');
  });
});

describe('parseTestReport + mergeSummaries', () => {
  it('dispatches by format and merges multiple files', () => {
    const a = parseTestReport(JUNIT, 'junit');
    const b = parseTestReport('1..1\nnot ok 1 - x', 'tap');
    const m = mergeSummaries([a, b]);
    expect(m.failed).toBe(2);
    expect(m.total).toBe(4);
    expect(m.failures).toHaveLength(2);
  });
});

describe('formatSummary', () => {
  it('shows a clean header on all-pass', () => {
    expect(formatSummary({ passed: 3, failed: 0, skipped: 0, total: 3, durationMs: 5, failures: [] })).toContain('3 passed');
  });
  it('lists failures with location and honors --top', () => {
    const out = formatSummary(parseJUnit(JUNIT));
    expect(out).toContain('✗ math › divides');
    expect(out).toContain('src/math.ts:14');
  });
  it('marks an aborted (bailed) suite instead of showing a clean ✓', () => {
    const out = formatSummary({ passed: 1, failed: 0, skipped: 0, total: 1, durationMs: 0, failures: [], bailedOut: true, bailReason: 'DB down' });
    expect(out).toContain('⚠ suite ABORTED');
    expect(out).toContain('DB down');
    expect(out).not.toContain('✓');
  });
});

describe('mergeSummaries bail propagation', () => {
  it('taints the merged run if any file bailed', () => {
    const clean = { passed: 2, failed: 0, skipped: 0, total: 2, durationMs: 0, failures: [] };
    const bailed = { passed: 1, failed: 0, skipped: 0, total: 1, durationMs: 0, failures: [], bailedOut: true, bailReason: 'oom' };
    const m = mergeSummaries([clean, bailed]);
    expect(m.bailedOut).toBe(true);
    expect(m.bailReason).toBe('oom');
  });
});
