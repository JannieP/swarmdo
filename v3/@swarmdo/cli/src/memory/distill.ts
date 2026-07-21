/**
 * distill.ts — L0→L1 memory distillation engine (ADR-155).
 *
 * Reads a Claude Code session transcript, uses a single headless `claude` call
 * to extract atomic, self-contained facts worth remembering across sessions,
 * and stores them (with provenance) in the existing memory store — where they
 * become retrievable through the normal `memory search` path.
 *
 * This is a near-clone of task/parse-prd.ts: transcript→facts JSON is the same
 * shape as PRD→tasks JSON. The claude runner is injectable so the whole pipeline
 * (prompt → JSON extract → validate → clamp) is unit-tested with a fake runner
 * and ZERO billable calls. The command layer (commands/memory.ts) gates the real
 * call behind SWARMDO_HEADLESS + --confirm, exactly like `parse-prd` / `repair`.
 *
 * Provenance: `defaultRunClaude` and the JSON-extraction shape are copied from
 * parse-prd.ts:52 / parse-prd.ts:116 (extractJsonArray is reused as-is).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { cleanUserText, contentToText, resolveSessionFile } from '../transcript/export.js';
import { defaultClaudeProjectDirs, findTranscriptFiles } from '../usage/transcript-usage.js';
import { encodeProjectDir } from '../command-usage/usage.js';
import { extractJsonArray } from '../task/parse-prd.js';
import { redactText } from '../redact/redact.js';
// Sibling module (both live in src/memory/) — hence `./`, not `../memory/`.
import { storeEntry, searchEntries } from './memory-initializer.js';

/** One atomic fact distilled from a session transcript. */
export interface DistilledFact {
  fact: string;
  turn: number;
  category: string;
}

/** One conversational turn parsed from a transcript .jsonl. */
export interface SessionTurn {
  role: 'user' | 'assistant';
  text: string;
}

// ── L0: resolve + read the transcript ────────────────────────────────────────

/** Resolve which transcript to distill.
 *
 * An explicit session id resolves anywhere (via resolveSessionFile). 'latest'/''
 * resolves to the newest MAIN session IN THE CURRENT PROJECT only. This matters:
 * resolveSessionFile('latest') picks the mtime-newest transcript machine-wide,
 * which can belong to an unrelated sibling project (a live demo distilled a
 * different project's session that way — cross-project bleed). We also prefer a
 * main-session transcript over a subagent's (`agent-*.jsonl`). Falls back to the
 * global latest only if the current project has no transcript at all. */
export function resolveDistillSession(idOrLatest: string, cwd: string): string | null {
  const id = (idOrLatest || 'latest').trim();
  if (id && id !== 'latest') return resolveSessionFile(id);

  const wantProject = encodeProjectDir(cwd);
  const candidates: Array<{ file: string; mtime: number; agent: boolean }> = [];
  for (const root of defaultClaudeProjectDirs()) {
    for (const t of findTranscriptFiles(root)) {
      if (t.project !== wantProject) continue;
      let mtime = 0;
      try { mtime = fs.statSync(t.file).mtimeMs; } catch { continue; }
      const agent = /(^|\/)agent-/.test(t.file.replace(/\\/g, '/'));
      candidates.push({ file: t.file, mtime, agent });
    }
  }
  if (candidates.length === 0) return resolveSessionFile('latest');
  const mains = candidates.filter((c) => !c.agent);
  const pool = mains.length ? mains : candidates;
  pool.sort((a, b) => b.mtime - a.mtime);
  return pool[0].file;
}

/** Parse a Claude Code session .jsonl into conversational turns.
 *
 * Full-file load (no streaming — one session is small enough): split on lines,
 * JSON.parse each (skip on throw), keep role∈{user,assistant}, flatten content
 * with `contentToText`, strip harness `<system-reminder>` noise from user turns
 * with `cleanUserText`, and drop empty-text turns (e.g. tool-result-only carrier
 * lines). Reuses the transcript module's exports so no parsing is duplicated. */
export function sessionTurns(file: string): SessionTurn[] {
  const raw = fs.readFileSync(file, 'utf8');
  const turns: SessionTurn[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: { message?: { role?: string; content?: unknown } };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // malformed line — skip, matching export.ts's tolerant parse
    }
    const role = parsed.message?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const flat = contentToText(parsed.message?.content);
    const text = role === 'user' ? cleanUserText(flat) : flat.trim();
    if (!text) continue; // drop empty tool-result-only / reminder-only turns
    turns.push({ role, text });
  }
  return turns;
}

// ── L0→L1: headless LLM extraction (clone of parse-prd) ──────────────────────

export interface RunClaudeReq {
  prompt: string;
  model: string;
  budgetUsd: number;
  timeoutMs: number;
}
export interface RunClaudeResult {
  text: string;
  costUsd: number;
  error?: string;
}

/** Default runner: headless `claude --print --output-format json`, no tools
 * (pure text→JSON). Copied from parse-prd.ts:52 — env scrubbed so the nested
 * session never inherits the parent's session ids, prompt passed on STDIN,
 * cost read from stdout `total_cost_usd`, text from `.result`. */
export function defaultRunClaude(req: RunClaudeReq): RunClaudeResult {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_ENTRYPOINT: 'worker',
  };
  delete env.CLAUDE_SESSION_ID;
  delete env.CLAUDE_PARENT_SESSION_ID;

  const res = spawnSync(
    'claude',
    [
      '--print',
      '--output-format', 'json',
      '--allowedTools', '',
      '--model', req.model,
      '--max-budget-usd', String(req.budgetUsd),
    ],
    {
      env,
      input: req.prompt,
      encoding: 'utf8',
      timeout: req.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (res.error) {
    return { text: '', costUsd: 0, error: `claude spawn failed: ${res.error.message}` };
  }
  if (res.status !== 0) {
    // Non-zero exit, timeout (status null + signal), or budget abort.
    return { text: '', costUsd: 0, error: `claude exited with status ${res.status ?? res.signal ?? 'unknown'}` };
  }
  try {
    const parsed = JSON.parse(`${res.stdout ?? ''}`) as { result?: unknown; total_cost_usd?: unknown };
    const text = typeof parsed.result === 'string' ? parsed.result : '';
    const costUsd = typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : 0;
    return { text, costUsd };
  } catch {
    return { text: '', costUsd: 0, error: 'failed to parse claude JSON output' };
  }
}

/** Render the turns compactly and instruct the model to return a JSON array of
 * atomic facts. Mirrors buildDecomposePrompt's "ONLY a JSON array, no fences"
 * discipline. Turns are numbered so a fact can cite its source `[turn N]`. */
export function buildDistillPrompt(turns: SessionTurn[], maxFacts: number): string {
  const rendered = turns
    .map((t, i) => `[turn ${i}] ${t.role.toUpperCase()}: ${t.text}`)
    .join('\n\n');
  return `You are distilling a coding session transcript into durable long-term memory.

Extract at most ${maxFacts} atomic, self-contained facts worth remembering across sessions (decisions, preferences, constraints, resolved bugs, key file/API locations). Each fact must stand on its own without the surrounding dialogue.

Return ONLY a JSON array of objects {"fact": string, "turn": number, "category": string} (no prose, no markdown fences):
- "fact": a single, self-contained statement.
- "turn": the [turn N] number this fact was drawn from.
- "category": a short lowercase label (e.g. "decision", "preference", "constraint", "bug", "location").

Prefer fewer, high-signal facts over many trivial ones. Do not invent facts not supported by the transcript.

TRANSCRIPT:
${rendered}`;
}

/** Validate/coerce raw LLM objects into DistilledFact[]. Drops entries without
 * a non-empty `fact` string; coerces `turn` to a finite number (default 0) and
 * `category` to a non-empty string (default 'general'). Records what it dropped.
 * Modeled on parse-prd.ts's validateTasks. */
function validateFacts(raw: unknown, warnings: string[]): DistilledFact[] {
  if (!Array.isArray(raw)) {
    warnings.push('model response was not a JSON array');
    return [];
  }
  const facts: DistilledFact[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      warnings.push(`dropped fact #${i + 1}: not an object`);
      return;
    }
    const o = item as Record<string, unknown>;
    const fact = typeof o.fact === 'string' ? o.fact.trim() : '';
    if (!fact) {
      warnings.push(`dropped fact #${i + 1}: missing fact text`);
      return;
    }
    let turn = 0;
    if (typeof o.turn === 'number' && Number.isFinite(o.turn)) turn = o.turn;
    else if (typeof o.turn === 'string' && o.turn.trim() && Number.isFinite(Number(o.turn))) turn = Number(o.turn);
    const category = typeof o.category === 'string' && o.category.trim() ? o.category.trim() : 'general';
    facts.push({ fact, turn, category });
  });
  return facts;
}

export interface ExtractFactsOptions {
  turns: SessionTurn[];
  maxFacts: number;
  model: string;
  budgetUsd: number;
  timeoutMs: number;
  /** Injectable for tests — a fake runner keeps the pipeline billing-free. */
  runClaude?: (r: RunClaudeReq) => RunClaudeResult;
}

/** Full extraction pipeline: prompt → run → extract JSON → validate → clamp.
 * The runner is injectable → unit tests pass a fake, zero billable calls. */
export async function extractFacts(
  opts: ExtractFactsOptions,
): Promise<{ facts: DistilledFact[]; costUsd: number; warnings: string[] }> {
  const warnings: string[] = [];
  const prompt = buildDistillPrompt(opts.turns, opts.maxFacts);
  const run = opts.runClaude ?? defaultRunClaude;
  const res = run({ prompt, model: opts.model, budgetUsd: opts.budgetUsd, timeoutMs: opts.timeoutMs });

  if (res.error) {
    return { facts: [], costUsd: res.costUsd, warnings: [res.error] };
  }
  const jsonStr = extractJsonArray(res.text);
  if (!jsonStr) {
    return { facts: [], costUsd: res.costUsd, warnings: ['no JSON array found in the model response'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { facts: [], costUsd: res.costUsd, warnings: ['model response was not valid JSON'] };
  }

  let facts = validateFacts(parsed, warnings);
  if (facts.length > opts.maxFacts) {
    warnings.push(`clamped ${facts.length} facts to the --max-facts limit of ${opts.maxFacts}`);
    facts = facts.slice(0, opts.maxFacts);
  }
  return { facts, costUsd: res.costUsd, warnings };
}

// ── L1: store facts with provenance ──────────────────────────────────────────

/** 8-char djb2 hex hash — a stable local id component for the fact key, so the
 * same fact text from the same session/turn upserts idempotently. No deps. */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; // djb2, kept unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0');
}

export interface StoreFactsOptions {
  facts: DistilledFact[];
  sessionId: string;
  transcript: string;
  namespace?: string;
  dbPath?: string;
}

/** Store each fact in the memory store with provenance metadata. Before each
 * write, a semantic dedup check (threshold 0.9) skips near-duplicates already
 * present in the namespace. `value` is the pure fact text (clean embedding);
 * provenance rides in `metadata` (ADR-155 WU1 adds `metadata` to storeEntry). */
export async function storeFacts(
  opts: StoreFactsOptions,
): Promise<{ stored: number; skipped: number; redacted: number; keys: string[] }> {
  const namespace = opts.namespace ?? 'distilled';
  const keys: string[] = [];
  let stored = 0;
  let skipped = 0;
  let redacted = 0;

  for (const fact of opts.facts) {
    // NEVER persist secrets: scrub the fact text before it is embedded,
    // dedup-queried, or stored. A distilled transcript can carry API keys /
    // tokens (a live demo extracted a VAST_API_KEY value); redactText masks
    // them in place so the value never lands in the memory DB.
    const scrub = redactText(fact.fact);
    const factText = scrub.output;
    if (scrub.findings.length > 0) redacted++;

    // Dedup: a near-identical fact already in this namespace → skip.
    const hit = await searchEntries({
      query: factText,
      namespace,
      limit: 1,
      threshold: 0.9,
      dbPath: opts.dbPath,
    });
    if (hit.results && hit.results.length > 0) {
      skipped++;
      continue;
    }

    const key = `fact-${opts.sessionId}-${fact.turn}-${shortHash(factText)}`;
    await storeEntry({
      key,
      value: factText,
      namespace,
      tags: [`src:${opts.sessionId}`, `turn:${fact.turn}`, `cat:${fact.category}`],
      metadata: {
        source: 'distill',
        sessionId: opts.sessionId,
        transcript: opts.transcript,
        turn: fact.turn,
        category: fact.category,
        distilledAt: new Date().toISOString(),
      },
      generateEmbeddingFlag: true,
      upsert: true,
      dbPath: opts.dbPath,
    });
    keys.push(key);
    stored++;
  }

  return { stored, skipped, redacted, keys };
}
