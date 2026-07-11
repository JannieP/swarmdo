/**
 * memory-inject/select.ts — pure selection + formatting for prompt-time
 * semantic memory injection (#43).
 *
 * A UserPromptSubmit hook embeds the current prompt, vector-searches AgentDB
 * across the memory namespaces, and injects the most relevant stored memories
 * into Claude's context under a strict token budget — recall at the moment of
 * need instead of a manual `memory search` or a bulk session-start dump.
 *
 * This module is the DIFFERENTIATING logic and is deliberately pure (no I/O, no
 * embeddings): given already-scored candidates it decides WHICH memories to
 * inject (relevance threshold, cross-namespace dedup, token budget, top-k) and
 * formats the context block. The command layer (`hooks memory-inject`) supplies
 * the real embedding + vector search and emits the hook JSON.
 */

/** One candidate memory returned by the vector search. */
export interface InjectionCandidate {
  key: string;
  namespace: string;
  content: string;
  /** Relevance (higher = more relevant), from the vector search. */
  score: number;
  provenance?: string;
}

export interface InjectionOptions {
  /** Max tokens the whole injected block may occupy (estimate). Default 800. */
  budgetTokens?: number;
  /** Drop candidates scoring below this. Default 0.35. */
  minRelevance?: number;
  /** Never inject more than this many memories. Default 5. */
  topK?: number;
  /** Chars-per-token estimate for the budget. Default 4. */
  charsPerToken?: number;
  /** Trim each memory's content to this many chars before formatting. Default 400. */
  maxItemChars?: number;
  /** Heading for the injected block. */
  header?: string;
}

export interface InjectionResult {
  /** The formatted context block, or '' when nothing qualifies. */
  block: string;
  /** Candidates actually included (content already trimmed), in injection order. */
  used: InjectionCandidate[];
  /** Qualifying, unique candidates left out by the token budget or top-k cap. */
  skipped: number;
  /** Estimated tokens the rendered block occupies. */
  tokensUsed: number;
}

const DEFAULTS = {
  budgetTokens: 800,
  minRelevance: 0.35,
  topK: 5,
  charsPerToken: 4,
  maxItemChars: 400,
  header: '## 🧠 Relevant memories (swarmdo)',
};

/**
 * Intro line placed under the header. States the provenance + a verify caveat —
 * injected memories reflect what was true WHEN WRITTEN, so file/flag names may
 * be stale (matches the auto-memory guidance).
 */
const INTRO =
  'Retrieved from stored memory by semantic search — may be relevant to this request. ' +
  'They reflect what was true when written; verify file/flag/function names before relying on them.';

/** Rough token estimate: ceil(chars / charsPerToken). */
export function estimateTokens(text: string, charsPerToken = DEFAULTS.charsPerToken): number {
  const cpt = charsPerToken > 0 ? charsPerToken : DEFAULTS.charsPerToken;
  return Math.ceil(text.length / cpt);
}

/** Collapse whitespace and cap length at a word boundary, adding an ellipsis. */
export function trimContent(content: string, maxChars: number): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (maxChars <= 0 || collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return body.trimEnd() + '…';
}

/** Normalized dedup key — the same memory bridged into >1 namespace collapses. */
function dedupKey(c: InjectionCandidate): string {
  return c.content.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Format one memory as a source-attributed bullet. Score shown as a percent. */
function formatItem(c: InjectionCandidate): string {
  const pct = Math.round(Math.max(0, Math.min(1, c.score)) * 100);
  return `- **[${c.namespace}/${c.key}]** (${pct}%) ${c.content}`;
}

function renderBlock(used: InjectionCandidate[], header: string): string {
  const lines = [header, INTRO, '', ...used.map(formatItem)];
  return lines.join('\n');
}

/**
 * Select and format the memories to inject.
 *
 * Pipeline: drop empty/below-threshold → sort by score desc (shorter content
 * wins ties so the budget packs more) → dedup by normalized content → greedily
 * fill the token budget up to top-k, trimming each item. Returns block: '' when
 * nothing qualifies (caller injects nothing — no context noise).
 */
export function selectInjectionMemories(
  candidates: InjectionCandidate[],
  options: InjectionOptions = {},
): InjectionResult {
  const opts = {
    budgetTokens: options.budgetTokens ?? DEFAULTS.budgetTokens,
    minRelevance: options.minRelevance ?? DEFAULTS.minRelevance,
    topK: options.topK ?? DEFAULTS.topK,
    charsPerToken: options.charsPerToken ?? DEFAULTS.charsPerToken,
    maxItemChars: options.maxItemChars ?? DEFAULTS.maxItemChars,
    header: options.header ?? DEFAULTS.header,
  };
  const budget = Math.max(0, opts.budgetTokens);
  const topK = Math.max(0, Math.floor(opts.topK));

  const qualifying = (candidates || []).filter(
    (c) =>
      c &&
      typeof c.content === 'string' &&
      c.content.trim().length > 0 &&
      typeof c.score === 'number' &&
      c.score >= opts.minRelevance,
  );

  const sorted = [...qualifying].sort(
    (a, b) => b.score - a.score || a.content.length - b.content.length || a.key.localeCompare(b.key),
  );

  const seen = new Set<string>();
  const unique: InjectionCandidate[] = [];
  for (const c of sorted) {
    const k = dedupKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
  }

  // Fixed overhead of the header + intro line; every bullet must fit alongside it.
  const overhead = estimateTokens(`${opts.header}\n${INTRO}\n`, opts.charsPerToken);
  const used: InjectionCandidate[] = [];
  let lineTokens = 0;
  let skipped = 0;
  for (const c of unique) {
    if (used.length >= topK) {
      skipped++;
      continue;
    }
    const trimmed = { ...c, content: trimContent(c.content, opts.maxItemChars) };
    const cost = estimateTokens('\n' + formatItem(trimmed), opts.charsPerToken);
    if (overhead + lineTokens + cost > budget) {
      skipped++;
      continue;
    }
    used.push(trimmed);
    lineTokens += cost;
  }

  if (used.length === 0) {
    return { block: '', used: [], skipped, tokensUsed: 0 };
  }
  const block = renderBlock(used, opts.header);
  return { block, used, skipped, tokensUsed: estimateTokens(block, opts.charsPerToken) };
}

/**
 * Extract the user's prompt from a Claude Code UserPromptSubmit hook payload.
 * Claude Code pipes JSON like `{"prompt":"…","session_id":"…"}` on stdin. Falls
 * back to `.userPrompt`/`.message`, then to the raw text when it isn't JSON
 * (a caller passing a plain string). Returns '' when nothing usable is found.
 */
export function extractPromptFromPayload(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object') {
      const p = obj.prompt ?? obj.userPrompt ?? obj.message ?? obj.text;
      return typeof p === 'string' ? p.trim() : '';
    }
    // JSON that parsed to a bare string/number → use its string form.
    return typeof obj === 'string' ? obj.trim() : '';
  } catch {
    // Not JSON — treat the raw text as the prompt.
    return text;
  }
}

/** A vector-search row as returned by bridgeSearchEntries. */
export interface SearchRow {
  key: string;
  content: string;
  score: number;
  namespace: string;
  provenance?: string;
}

/**
 * Map raw search rows to injection candidates, dropping empty content and
 * (when `allowed` is given) rows outside the requested namespace set.
 */
export function mapSearchResultsToCandidates(
  results: SearchRow[],
  allowed?: string[] | Set<string>,
): InjectionCandidate[] {
  const allow = allowed ? (allowed instanceof Set ? allowed : new Set(allowed)) : null;
  const out: InjectionCandidate[] = [];
  for (const r of results || []) {
    if (!r || typeof r.content !== 'string' || r.content.trim().length === 0) continue;
    if (allow && !allow.has(r.namespace)) continue;
    out.push({
      key: r.key,
      namespace: r.namespace,
      content: r.content,
      score: typeof r.score === 'number' ? r.score : 0,
      provenance: r.provenance,
    });
  }
  return out;
}
