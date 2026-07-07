import { describe, it, expect } from 'vitest';
import {
  compactOutput,
  stripAnsi,
  formatBytes,
  formatSavings,
} from '../src/compact/compact.ts';

describe('stripAnsi', () => {
  it('removes SGR colour codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });
  it('removes cursor moves and clear-line escapes', () => {
    expect(stripAnsi('a\x1b[2Kb\x1b[1Gc')).toBe('abc');
  });
  it('leaves plain text untouched', () => {
    expect(stripAnsi('no escapes here')).toBe('no escapes here');
  });
});

describe('compactOutput — repeats', () => {
  it('collapses runs of ≥minRun identical lines', () => {
    const input = 'x\nx\nx\nx\ny\n';
    const { text } = compactOutput(input, { minRun: 3 });
    expect(text).toBe('x\n  … (×4)\ny\n');
  });
  it('keeps short runs below minRun verbatim', () => {
    const input = 'x\nx\ny\n';
    const { text } = compactOutput(input, { minRun: 3 });
    expect(text).toBe('x\nx\ny\n');
  });
  it('minRun=0 disables collapsing', () => {
    const input = 'x\nx\nx\nx\n';
    const { text } = compactOutput(input, { minRun: 0, collapseBlanks: false });
    expect(text).toBe('x\nx\nx\nx\n');
  });
});

describe('compactOutput — carriage returns', () => {
  it('keeps only the final segment of a CR-updated line', () => {
    const { text } = compactOutput('10%\r50%\r100%\n', {});
    expect(text).toBe('100%\n');
  });
  it('handles a trailing CR', () => {
    const { text } = compactOutput('done\r\n', {});
    expect(text).toBe('done\n');
  });
});

describe('compactOutput — node_modules stack frames', () => {
  it('folds consecutive node_modules frames', () => {
    const input = [
      'Error: boom',
      '    at foo (/app/src/x.ts:1:1)',
      '    at bar (/app/node_modules/vitest/dist/index.js:2:2)',
      '    at baz (/app/node_modules/tinypool/dist/index.js:3:3)',
      '    at qux (/app/node_modules/@vitest/runner/dist/index.js:4:4)',
      '',
    ].join('\n');
    const { text } = compactOutput(input, {});
    expect(text).toContain('at foo (/app/src/x.ts:1:1)');
    expect(text).toContain('… 3 frames in node_modules');
    expect(text).not.toContain('tinypool');
  });
  it('leaves a single node_modules frame unfolded', () => {
    const input = 'Error\n    at one (/app/node_modules/a/i.js:1:1)\nnext\n';
    const { text } = compactOutput(input, {});
    expect(text).toContain('at one (/app/node_modules/a/i.js:1:1)');
    expect(text).not.toContain('frames in node_modules');
  });
});

describe('compactOutput — blank lines', () => {
  it('collapses ≥3 blank lines to one', () => {
    const { text } = compactOutput('a\n\n\n\n\nb\n', {});
    expect(text).toBe('a\n\nb\n');
  });
});

describe('compactOutput — windowing', () => {
  it('elides the middle when over head+tail', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n') + '\n';
    const { text } = compactOutput(lines, { minRun: 0, window: { head: 3, tail: 2 } });
    const out = text.split('\n');
    expect(out[0]).toBe('line0');
    expect(out[3]).toBe('… 15 lines elided …');
    expect(out[4]).toBe('line18');
    expect(out[5]).toBe('line19');
  });
  it('keeps everything when under the window budget', () => {
    const { text } = compactOutput('a\nb\nc\n', { window: { head: 3, tail: 3 } });
    expect(text).toBe('a\nb\nc\n');
  });
});

describe('compactOutput — stats & invariants', () => {
  it('reports line savings on a collapsed run', () => {
    const input = 'x\nx\nx\nx\nx\n';
    const { stats } = compactOutput(input, { minRun: 3 });
    expect(stats.linesIn).toBe(5);
    expect(stats.linesOut).toBe(2); // 'x' + '  … (×5)'
  });
  it('reports byte savings on a realistic repeated run', () => {
    // The `(×N)` marker has fixed overhead, so savings show once the
    // repeated lines carry real length (as build/install logs do).
    const line = 'npm warn deprecated some-package@1.2.3: please upgrade\n';
    const { stats } = compactOutput(line.repeat(40), { minRun: 3 });
    expect(stats.bytesOut).toBeLessThan(stats.bytesIn);
    expect(stats.savedFraction).toBeGreaterThan(0.9);
  });
  it('empty input yields empty output and zero savings', () => {
    const { text, stats } = compactOutput('', {});
    expect(text).toBe('');
    expect(stats.savedFraction).toBe(0);
    expect(stats.bytesIn).toBe(0);
  });
  it('preserves absence of a trailing newline', () => {
    const { text } = compactOutput('a\nb', {});
    expect(text).toBe('a\nb');
  });
  it('preserves a trailing newline', () => {
    const { text } = compactOutput('a\nb\n', {});
    expect(text).toBe('a\nb\n');
  });
  it('never increases byte count on already-clean input', () => {
    const clean = 'just\nsome\nclean\nlines\n';
    const { stats } = compactOutput(clean, {});
    expect(stats.bytesOut).toBeLessThanOrEqual(stats.bytesIn);
  });
});

describe('formatBytes / formatSavings', () => {
  it('formats byte magnitudes', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0MB');
  });
  it('renders a savings summary line', () => {
    const { stats } = compactOutput('x\nx\nx\nx\n', { minRun: 3 });
    const line = formatSavings(stats);
    expect(line).toMatch(/^compacted: 4→2 lines, .*B→.*B \(−\d+%\)$/);
  });
});
