/**
 * import.ts — parse an Obsidian vault produced by vault.ts back into memory
 * entries (the roundtrip half of the dual-plane memory strategy: edit notes
 * in Obsidian, sync them back into the vector DB).
 *
 * Pure mirror of renderNote/renderVault: takes {relPath, content} pairs,
 * returns swarmdo-memory-export/v1-shaped entries plus skip accounting.
 * Only notes stamped `source: swarmdo-memory` are imported — INDEX.md and
 * foreign notes in a mixed vault are counted, not touched. Fenced ```json
 * bodies are re-minified (storeEntry serializes objects compactly, so this
 * restores value-equality even though pretty-printed whitespace differs).
 */

import type { ExportEntry, VaultFile } from './vault.js';

export interface ParsedNote {
  key: string;
  namespace: string;
  value: string | null;
}

export interface VaultParseResult {
  entries: ExportEntry[];
  /** files skipped because they are not swarmdo memory notes */
  foreign: number;
  /** INDEX.md and other non-note markdown we generated ourselves */
  index: number;
}

/** Decode one frontmatter scalar emitted by vault.ts (JSON-quoted or bare). */
function decodeScalar(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t) as string; } catch { /* fall through */ }
  }
  return t;
}

/** Re-flatten a body that is exactly one fenced ```json block. */
export function unfenceBody(body: string): string {
  const t = body.trim();
  const m = /^```json\n([\s\S]*)\n```$/.exec(t);
  if (!m) return body;
  try { return JSON.stringify(JSON.parse(m[1])); } catch { return body; }
}

/** Parse one note. Returns null unless it carries our frontmatter stamp. */
export function parseNote(content: string): ParsedNote | null {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return null;
  const fm: Record<string, string> = {};
  for (const line of content.slice(4, end).split('\n')) {
    const i = line.indexOf(': ');
    if (i > 0) fm[line.slice(0, i)] = decodeScalar(line.slice(i + 2));
  }
  if (fm.source !== 'swarmdo-memory' || !fm.key || !fm.namespace) return null;

  // slice lands on the closing fence's line terminator; renderNote also emits
  // one blank separator line before the body — strip both, keep the rest
  let body = content.slice(end + 4).replace(/^\n\n?/, '');
  body = body.replace(/\n$/, '');
  const value = body.trim() === '*(no stored value)*' ? null : unfenceBody(body);
  return { key: fm.key, namespace: fm.namespace, value };
}

/** Parse a whole vault back into export entries. */
export function parseVault(files: VaultFile[]): VaultParseResult {
  const entries: ExportEntry[] = [];
  let foreign = 0;
  let index = 0;
  for (const f of files) {
    const base = f.relPath.split('/').pop() ?? f.relPath;
    if (base === 'INDEX.md') { index++; continue; }
    const note = parseNote(f.content);
    if (!note) { foreign++; continue; }
    entries.push({ key: note.key, namespace: note.namespace, value: note.value });
  }
  return { entries, foreign, index };
}
