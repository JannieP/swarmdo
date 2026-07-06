/**
 * search.ts — full-text search across Claude Code session transcripts.
 *
 * "Which session did I discuss X in?" — answered locally. Matches only what
 * the humans and the model actually said (user/assistant messages; tool spam
 * and system reminders are not part of the conversation record we search).
 * All matching/snippeting/ranking is pure; the command layer streams files.
 */

import { contentToText, cleanUserText, type RawTranscriptLine } from './export.js';

export interface SearchHit {
  role: 'user' | 'assistant';
  snippet: string;
}

export interface SessionMatch {
  sessionId: string;
  project: string;
  mtimeMs: number;
  hits: number;
  snippets: SearchHit[];
}

/** Lowercased, deduped, non-empty terms. Throws on an effectively-empty query. */
export function parseQuery(raw: string): string[] {
  const terms = [...new Set(String(raw).toLowerCase().split(/\s+/).filter(Boolean))];
  if (terms.length === 0) throw new Error('empty search query');
  return terms;
}

/** Case-insensitive AND across terms. */
export function matchesQuery(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

/** Window the text around the first term occurrence; single-line ellipsized. */
export function makeSnippet(text: string, terms: string[], width = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) at = 0;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

/** Extract the searchable conversational text of one transcript line, or null. */
export function searchableText(line: RawTranscriptLine): { role: 'user' | 'assistant'; text: string } | null {
  const role = line.message?.role;
  if (role !== 'user' && role !== 'assistant') return null;
  const text = contentToText(line.message?.content);
  const cleaned = role === 'user' ? cleanUserText(text) : text;
  if (!cleaned || !cleaned.trim()) return null;
  return { role, text: cleaned };
}

/** Search parsed lines of one session; returns hit count + top snippets. */
export function searchLines(lines: RawTranscriptLine[], terms: string[], maxSnippets = 3): { hits: number; snippets: SearchHit[] } {
  let hits = 0;
  const snippets: SearchHit[] = [];
  for (const line of lines) {
    const s = searchableText(line);
    if (!s || !matchesQuery(s.text, terms)) continue;
    hits++;
    if (snippets.length < maxSnippets) snippets.push({ role: s.role, snippet: makeSnippet(s.text, terms) });
  }
  return { hits, snippets };
}

/** Rank: most hits first, then most recent. */
export function rankMatches(matches: SessionMatch[]): SessionMatch[] {
  return [...matches].sort((a, b) => b.hits - a.hits || b.mtimeMs - a.mtimeMs);
}
