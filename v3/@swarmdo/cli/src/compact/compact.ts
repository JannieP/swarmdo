/**
 * compact.ts — deterministic command-output compression.
 *
 * Noisy command output (test runners, builds, installers, `git log`) burns a
 * large share of an agent's context window on repetition and formatting that
 * carries no signal. This engine shrinks that output BEFORE it reaches an LLM,
 * with no model call — every transform is a pure, signal-preserving rewrite:
 *
 *   1. strip ANSI escape sequences (colour, cursor moves)
 *   2. resolve carriage-return progress spam to each line's final state
 *   3. collapse runs of identical consecutive lines → `<line>  … (×N)`
 *   4. fold consecutive node_modules stack frames → `… N frames in node_modules`
 *   5. collapse ≥3 blank lines to one; trim trailing whitespace
 *   6. (opt-in) window very long output to head + tail with an elision marker
 *
 * Distinct from `swarmdo compress` (caveman, LLM-based, for memory FILES) —
 * this is a zero-token STREAM filter. Pure: no I/O, fully testable.
 */

export interface CompactOptions {
  /** Strip ANSI escape sequences. Default true. */
  stripAnsi?: boolean;
  /** Collapse a run of ≥ this many identical lines. Default 3; 0 disables. */
  minRun?: number;
  /** Fold consecutive node_modules stack frames. Default true. */
  foldNodeModules?: boolean;
  /** Collapse ≥3 consecutive blank lines to one. Default true. */
  collapseBlanks?: boolean;
  /**
   * Opt-in windowing for very long output: keep the first `head` and last
   * `tail` lines, eliding the middle. Omit to keep everything.
   */
  window?: { head: number; tail: number };
}

export interface CompactStats {
  linesIn: number;
  linesOut: number;
  bytesIn: number;
  bytesOut: number;
  /** Fraction of bytes removed, 0..1 (0 when input was empty). */
  savedFraction: number;
}

export interface CompactResult {
  text: string;
  stats: CompactStats;
}

// SGR colour codes, cursor moves, and other CSI/OSC escapes. Intentionally
// broad within the ESC-[ / ESC-] families; does not touch ordinary text.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

const NODE_FRAME_RE = /^\s*at\s.*[/\\]node_modules[/\\]/;

/** Remove ANSI escapes from a string. Exported for reuse/testing. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

/**
 * Resolve carriage-return progress updates: a terminal renders `a\rb\rc` as
 * just `c` (each CR returns to column 0 and overwrites). Keep the final
 * segment of each line so progress bars collapse to their last frame.
 */
function resolveCarriageReturns(line: string): string {
  if (!line.includes('\r')) return line;
  const segs = line.split('\r');
  // Drop empty trailing segment from a line that ended with \r.
  while (segs.length > 1 && segs[segs.length - 1] === '') segs.pop();
  return segs[segs.length - 1] ?? '';
}

/**
 * Collapse runs of ≥ minRun identical consecutive lines into `<line>  … (×N)`.
 * Blank/whitespace-only runs are left untouched — those are the blank-line
 * collapser's job, so the `(×N)` marker only ever tags repeated *content*.
 */
function collapseRepeats(lines: string[], minRun: number): string[] {
  if (minRun <= 0) return lines;
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') { out.push(lines[i]); i++; continue; }
    let j = i + 1;
    while (j < lines.length && lines[j] === lines[i]) j++;
    const run = j - i;
    out.push(lines[i]);
    if (run >= minRun) out.push(`  … (×${run})`);
    else for (let k = 1; k < run; k++) out.push(lines[i]);
    i = j;
  }
  return out;
}

/** Fold consecutive node_modules stack frames into a single summary line. */
function foldNodeFrames(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (NODE_FRAME_RE.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && NODE_FRAME_RE.test(lines[j])) j++;
      const run = j - i;
      if (run >= 2) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? '    ';
        out.push(`${indent}… ${run} frames in node_modules`);
      } else {
        out.push(lines[i]);
      }
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out;
}

/**
 * Collapse runs of ≥3 consecutive blank lines to a single blank. Runs of 1 or 2
 * blanks are preserved (a 2-blank run is meaningful — e.g. PEP 8 spacing between
 * top-level defs), so the full run length is counted before deciding.
 */
function collapseBlankLines(lines: string[]): string[] {
  const out: string[] = [];
  let blanks = 0;
  const flush = () => {
    if (blanks === 0) return;
    const keep = blanks >= 3 ? 1 : blanks; // ≥3 → 1; 1 or 2 → unchanged
    for (let i = 0; i < keep; i++) out.push('');
    blanks = 0;
  };
  for (const line of lines) {
    if (line.trim() === '') { blanks++; continue; }
    flush();
    out.push(line);
  }
  flush();
  return out;
}

/** Keep head + tail lines, eliding the middle with a marker. */
function windowLines(lines: string[], head: number, tail: number): string[] {
  if (lines.length <= head + tail + 1) return lines;
  const elided = lines.length - head - tail;
  return [
    ...lines.slice(0, head),
    `… ${elided} lines elided …`,
    ...lines.slice(lines.length - tail),
  ];
}

/**
 * Compact command output. Pure — returns the rewritten text plus byte/line
 * savings. The input's trailing newline (if any) is preserved.
 */
export function compactOutput(input: string, opts: CompactOptions = {}): CompactResult {
  const {
    stripAnsi: doStrip = true,
    minRun = 3,
    foldNodeModules = true,
    collapseBlanks = true,
    window,
  } = opts;

  const bytesIn = Buffer.byteLength(input, 'utf8');
  const hadTrailingNewline = input.endsWith('\n');

  let text = doStrip ? stripAnsi(input) : input;
  // Split without the trailing empty element a final newline would create.
  let lines = text.split('\n');
  if (hadTrailingNewline) lines.pop();
  const linesIn = lines.length;

  lines = lines.map(resolveCarriageReturns);
  if (minRun > 0) lines = collapseRepeats(lines, minRun);
  if (foldNodeModules) lines = foldNodeFrames(lines);
  if (collapseBlanks) lines = collapseBlankLines(lines);
  if (window) lines = windowLines(lines, window.head, window.tail);

  const linesOut = lines.length;
  text = lines.join('\n');
  if (hadTrailingNewline && text !== '') text += '\n';

  const bytesOut = Buffer.byteLength(text, 'utf8');
  const savedFraction = bytesIn === 0 ? 0 : Math.max(0, (bytesIn - bytesOut) / bytesIn);

  return { text, stats: { linesIn, linesOut, bytesIn, bytesOut, savedFraction } };
}

/** Human-readable byte count (for the savings summary). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/** One-line savings summary for stderr. */
export function formatSavings(stats: CompactStats): string {
  const pct = Math.round(stats.savedFraction * 100);
  return `compacted: ${stats.linesIn}→${stats.linesOut} lines, ${formatBytes(stats.bytesIn)}→${formatBytes(stats.bytesOut)} (−${pct}%)`;
}
