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
  /** true if a `\ No newline at end of file` marker immediately followed this line */
  noEol?: boolean;
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
    // CRLF tolerance (#9): a diff generated on/for CRLF files carries \r on
    // every line; strip it so hunk content compares EOL-agnostically.
    const raw = lines[i];
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
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
        // "\ No newline at end of file" — attaches to the preceding hunk line,
        // recording that that side of the diff has no trailing newline.
        if (hunk.lines.length) hunk.lines[hunk.lines.length - 1].noEol = true;
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

/** How many positions in `source` the `block` matches. Pure. */
function countMatches(source: string[], block: string[]): number {
  if (block.length === 0) return 0;
  let n = 0;
  for (let i = 0; i + block.length <= source.length; i++) if (blockMatchesAt(source, i, block)) n++;
  return n;
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
  /**
   * True when the matched block occurs at MORE THAN ONE position in the file —
   * the hunk landed at the nearest, but a duplicate/boilerplate block elsewhere
   * means it may have modified the wrong occurrence. Callers should verify.
   */
  ambiguous?: boolean;
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
  // CRLF support (#9): match EOL-agnostically, then write inserted lines with
  // the file's dominant EOL so CRLF sources stay CRLF. `lines` keeps each
  // line's original bytes (untouched lines round-trip exactly); `matchLines`
  // is the \r-stripped twin every comparison runs against. The two are spliced
  // in lockstep so indices stay aligned.
  const crlfCount = (source.match(/\r\n/g) ?? []).length;
  const newlineCount = (source.match(/\n/g) ?? []).length;
  const dominantCrlf = crlfCount > newlineCount - crlfCount;
  const lines = source.split('\n');
  if (trailingNewline) lines.pop(); // drop the empty element from a trailing \n
  const stripCr = (s: string) => (s.endsWith('\r') ? s.slice(0, -1) : s);
  const matchLines = lines.map(stripCr);
  let offset = 0;
  const results: HunkResult[] = [];
  // If a hunk that reaches EOF carries an explicit no-newline marker, it — not
  // the source — decides the output's trailing newline. undefined = no marker.
  let eofNoEol: boolean | undefined;

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
        const at = findBlock(matchLines, trimmed, expected + lead);
        if (at >= 0) { placed = at - lead; usedFuzz = f; trimLead = lead; trimTail = tail; break outer; }
      }
    }

    if (placed < 0) {
      results.push({ hunk, applied: false });
      continue;
    }
    // A hunk is AMBIGUOUS if the block it matched on occurs elsewhere too — the
    // nearest-match tiebreak may have picked the wrong duplicate. Check the
    // matched (trimmed) block against the current lines BEFORE splicing.
    const matchedBlock = oldBlock.slice(trimLead, oldBlock.length - trimTail);
    const ambiguous = countMatches(matchLines, matchedBlock) > 1;
    // Splice ONLY the matched middle. When fuzz trimmed leading/trailing context
    // (trimLead/trimTail > 0) the FULL block matched nowhere, so those trimmed
    // context lines are unverified anchors — the real source at those positions
    // may differ (drift). Splicing the whole oldBlock.length at `placed` would
    // delete a drifted-but-real line and rewrite it with the hunk's stale context
    // copy — silent data loss on a line the hunk never marked to change. So splice
    // from the matched position (placed + trimLead) over just the matched span,
    // inserting newBlock minus the same lead/tail (context is identical on both
    // sides), leaving the anchor lines exactly as the source has them. For a
    // non-fuzzy hunk (trimLead = trimTail = 0) this is byte-identical to before.
    const removeAt = placed + trimLead;
    const removeCount = oldBlock.length - trimLead - trimTail;
    const insert = newBlock.slice(trimLead, newBlock.length - trimTail);
    const insertRaw = dominantCrlf ? insert.map((l) => l + '\r') : insert;
    lines.splice(removeAt, removeCount, ...insertRaw);
    matchLines.splice(removeAt, removeCount, ...insert);
    offset += insert.length - removeCount; // === newBlock.length - oldBlock.length
    results.push({ hunk, applied: true, at: placed, fuzzUsed: usedFuzz, ...(ambiguous && { ambiguous: true }) });
    // If this hunk's new content is now the tail of the file, its markers
    // determine whether the file ends with a newline.
    if (removeAt + insert.length === lines.length) eofNoEol = newSideEndsNoEol(hunk);
  }

  let result = lines.join('\n');
  // The patch's explicit EOF marker wins; absent one, keep the source's state.
  const endWithNewline = eofNoEol === undefined ? trailingNewline : !eofNoEol;
  if (endWithNewline) result += '\n';
  // An inserted line that became the no-trailing-newline tail carries the
  // dominant-EOL \r it was given for joining — a bare CR at EOF is never
  // meaningful, so drop it.
  else if (result.endsWith('\r')) result = result.slice(0, -1);
  return { ok: results.every((r) => r.applied), result, hunks: results };
}

/**
 * Whether the NEW side of `hunk` ends without a trailing newline — read from the
 * last context/addition line's marker. Returns undefined if the hunk carries no
 * `\ No newline` marker at all (so the source's state should be kept). Pure.
 */
function newSideEndsNoEol(hunk: Hunk): boolean | undefined {
  if (!hunk.lines.some((l) => l.noEol)) return undefined;
  for (let i = hunk.lines.length - 1; i >= 0; i--) {
    const l = hunk.lines[i];
    if (l.type === ' ' || l.type === '+') return !!l.noEol;
  }
  return undefined;
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
