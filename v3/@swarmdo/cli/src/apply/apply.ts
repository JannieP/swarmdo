/**
 * apply.ts — apply a unified diff to source text with FUZZY context matching.
 *
 * LLM/agent-produced diffs frequently fail `git apply`: the model's context
 * lines drift by a few lines, or whitespace differs, and git rejects the whole
 * patch. This applier locates each hunk by searching for its context near the
 * declared line (not only AT it), tolerates leading/trailing context drift up
 * to a fuzz factor, and reports precisely which hunks couldn't land — instead
 * of an all-or-nothing failure.
 *
 * Pure + deterministic: text in, text (or rejects) out. The fs read/write lives
 * in ../commands/apply.ts.
 */

export interface HunkLine {
  /** ' ' context, '-' removal, '+' addition */
  type: ' ' | '-' | '+';
  content: string;
}

export interface Hunk {
  oldStart: number;
  newStart: number;
  lines: HunkLine[];
}

export interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
}

/** Parse a unified diff into per-file patches. Pure. Tolerates `a/`+`b/` prefixes. */
export function parsePatch(text: string): FilePatch[] {
  const files: FilePatch[] = [];
  const lines = text.split('\n');
  let cur: FilePatch | null = null;
  let hunk: Hunk | null = null;

  const stripPrefix = (p: string) => p.replace(/^[ab]\//, '').replace(/\t.*$/, '').trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git')) {
      cur = null; hunk = null;
      continue;
    }
    if (line.startsWith('--- ')) {
      const old = stripPrefix(line.slice(4));
      const next = lines[i + 1] ?? '';
      const neu = next.startsWith('+++ ') ? stripPrefix(next.slice(4)) : old;
      cur = { oldPath: old === '/dev/null' ? neu : old, newPath: neu === '/dev/null' ? old : neu, hunks: [] };
      files.push(cur);
      hunk = null;
      i++; // consume the +++ line
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m && cur) {
        hunk = { oldStart: parseInt(m[1], 10), newStart: parseInt(m[2], 10), lines: [] };
        cur.hunks.push(hunk);
      }
      continue;
    }
    if (hunk) {
      if (line === '' && i === lines.length - 1) continue; // trailing newline artifact
      const t = line[0];
      if (t === ' ' || t === '+' || t === '-') {
        hunk.lines.push({ type: t, content: line.slice(1) });
      } else if (line === '') {
        hunk.lines.push({ type: ' ', content: '' }); // blank context line written without the leading space
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" — ignore
      } else {
        hunk = null; // end of hunk block
      }
    }
  }
  return files;
}

/** The lines a hunk expects to find (context + removals), and produces (context + additions). */
function hunkBlocks(hunk: Hunk): { oldBlock: string[]; newBlock: string[] } {
  const oldBlock: string[] = [];
  const newBlock: string[] = [];
  for (const l of hunk.lines) {
    if (l.type === ' ') { oldBlock.push(l.content); newBlock.push(l.content); }
    else if (l.type === '-') oldBlock.push(l.content);
    else newBlock.push(l.content);
  }
  return { oldBlock, newBlock };
}

function blockMatchesAt(source: string[], at: number, block: string[]): boolean {
  if (at < 0 || at + block.length > source.length) return false;
  for (let i = 0; i < block.length; i++) if (source[at + i] !== block[i]) return false;
  return true;
}

/**
 * Find where `block` occurs in `source`, preferring the position nearest
 * `expected` (0-based). Returns -1 if not found. Deterministic: on ties the
 * lower index wins.
 */
function findBlock(source: string[], block: string[], expected: number): number {
  if (block.length === 0) return Math.max(0, Math.min(expected, source.length));
  if (blockMatchesAt(source, expected, block)) return expected;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i + block.length <= source.length; i++) {
    if (!blockMatchesAt(source, i, block)) continue;
    const dist = Math.abs(i - expected);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

export interface ApplyOptions {
  /** max leading/trailing context lines to drop when the full block won't match (default 2) */
  fuzz?: number;
}

export interface HunkResult {
  hunk: Hunk;
  applied: boolean;
  /** 0-based line where it landed (if applied) */
  at?: number;
  /** how many context lines were trimmed to make it fit */
  fuzzUsed?: number;
}

export interface ApplyResult {
  ok: boolean;
  result: string;
  hunks: HunkResult[];
}

/** Apply one file's hunks to `source`. Pure. Hunks are applied top-to-bottom with offset tracking. */
export function applyPatch(source: string, patch: FilePatch, opts: ApplyOptions = {}): ApplyResult {
  const fuzz = opts.fuzz ?? 2;
  const trailingNewline = source.endsWith('\n');
  const lines = source.split('\n');
  if (trailingNewline) lines.pop(); // drop the empty element from a trailing \n
  let offset = 0;
  const results: HunkResult[] = [];

  for (const hunk of patch.hunks) {
    const { oldBlock, newBlock } = hunkBlocks(hunk);
    const expected = hunk.oldStart - 1 + offset;

    // Try the full block, then progressively trim up to `fuzz` context lines
    // off each end (patch fuzz) to tolerate drift.
    let placed = -1;
    let usedFuzz = 0;
    let trimLead = 0;
    let trimTail = 0;
    outer: for (let f = 0; f <= fuzz; f++) {
      for (let lead = 0; lead <= f; lead++) {
        const tail = f - lead;
        const leadTrimmable = countLeadingContext(hunk);
        const tailTrimmable = countTrailingContext(hunk);
        if (lead > leadTrimmable || tail > tailTrimmable) continue;
        const trimmed = oldBlock.slice(lead, oldBlock.length - tail);
        const at = findBlock(lines, trimmed, expected + lead);
        if (at >= 0) { placed = at - lead; usedFuzz = f; trimLead = lead; trimTail = tail; break outer; }
      }
    }

    if (placed < 0) {
      results.push({ hunk, applied: false });
      continue;
    }
    // Splice: remove oldBlock.length lines at `placed`, insert newBlock.
    // (trimLead/trimTail only affected *matching*, not what we replace.)
    void trimLead; void trimTail;
    lines.splice(placed, oldBlock.length, ...newBlock);
    offset += newBlock.length - oldBlock.length;
    results.push({ hunk, applied: true, at: placed, fuzzUsed: usedFuzz });
  }

  let result = lines.join('\n');
  if (trailingNewline) result += '\n';
  return { ok: results.every((r) => r.applied), result, hunks: results };
}

function countLeadingContext(hunk: Hunk): number {
  let n = 0;
  for (const l of hunk.lines) { if (l.type === ' ') n++; else break; }
  return n;
}
function countTrailingContext(hunk: Hunk): number {
  let n = 0;
  for (let i = hunk.lines.length - 1; i >= 0; i--) { if (hunk.lines[i].type === ' ') n++; else break; }
  return n;
}
