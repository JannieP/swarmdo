/**
 * vault.ts — render a swarmdo memory export as an Obsidian-ready vault.
 *
 * `memory export` already emits machine formats (json/csv); this adds the
 * human plane: one markdown note per entry with YAML frontmatter, grouped in
 * per-namespace folders, plus an INDEX.md map-of-content. Values that already
 * contain `[[wikilinks]]` pass through untouched (Obsidian-native), JSON
 * values are pretty-printed in a fenced block. Pure: takes the parsed
 * swarmdo-memory-export/v1 payload, returns {relPath, content} pairs — the
 * command layer does the disk I/O.
 */

export interface ExportEntry {
  key: string;
  namespace: string;
  value: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  accessCount?: number | null;
  hasEmbedding?: boolean;
  size?: number | null;
}

export interface ExportPayload {
  schema?: string;
  exportedAt?: string;
  namespace?: string | null;
  count?: number;
  entries: ExportEntry[];
}

export interface VaultFile {
  relPath: string;
  content: string;
}

/** Filesystem-safe note name that stays readable (and Obsidian-linkable). */
export function sanitizeNoteName(key: string): string {
  const cleaned = (key ?? '')
    .replace(/[\\/:*?"<>|#^[\]]/g, '-') // fs + Obsidian-reserved chars
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '')
    .slice(0, 120);
  return cleaned || 'untitled';
}

function yamlEscape(v: string): string {
  // quote only real YAML ambiguities: ": "/" #" sequences, leading special
  // chars, edge whitespace, or an empty value — mid-word hyphens are fine
  return /(:\s)|(\s#)|^[-?[\]{}&*!|>'"%@`,\s]|\s$|^$/.test(v) ? JSON.stringify(v) : v;
}

function isoOrNull(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Pretty-print the body: fenced JSON when the value parses as an object or
 * array, raw markdown otherwise (preserves existing [[wikilinks]]). */
export function renderBody(value: string | null): string {
  if (value === null || value === '') return '*(no stored value)*';
  const t = value.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      const parsed = JSON.parse(t);
      if (parsed !== null && typeof parsed === 'object') {
        return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
      }
    } catch { /* not JSON — fall through to raw */ }
  }
  return value;
}

/** One markdown note with YAML frontmatter for one memory entry. */
export function renderNote(entry: ExportEntry): string {
  const lines = ['---'];
  lines.push(`key: ${yamlEscape(entry.key)}`);
  lines.push(`namespace: ${yamlEscape(entry.namespace)}`);
  const created = isoOrNull(entry.createdAt);
  const updated = isoOrNull(entry.updatedAt);
  if (created) lines.push(`created: ${created}`);
  if (updated) lines.push(`updated: ${updated}`);
  if (typeof entry.accessCount === 'number') lines.push(`accessCount: ${entry.accessCount}`);
  if (entry.hasEmbedding !== undefined) lines.push(`hasEmbedding: ${entry.hasEmbedding}`);
  lines.push('source: swarmdo-memory');
  lines.push('---');
  lines.push('');
  lines.push(renderBody(entry.value));
  lines.push('');
  return lines.join('\n');
}

/** Render the full vault: per-namespace folders + INDEX.md map-of-content.
 * Colliding sanitized names get -2, -3, … suffixes (deterministic order). */
export function renderVault(payload: ExportPayload): VaultFile[] {
  const files: VaultFile[] = [];
  const used = new Set<string>();
  const byNamespace = new Map<string, { name: string; relPath: string }[]>();

  for (const entry of payload.entries) {
    const ns = sanitizeNoteName(entry.namespace || 'default');
    // colon-scoped keys (e.g. `auto-memory:file.md:slug`) name the note by
    // their final segment — the full key lives in the frontmatter
    const lastSegment = entry.key.includes(':') ? entry.key.split(':').filter(Boolean).pop() ?? entry.key : entry.key;
    let name = sanitizeNoteName(lastSegment);
    let candidate = `${ns}/${name}`;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${ns}/${name}-${i}`;
    used.add(candidate.toLowerCase());
    const relPath = `${candidate}.md`;
    files.push({ relPath, content: renderNote(entry) });
    const list = byNamespace.get(ns) ?? [];
    list.push({ name: candidate.slice(ns.length + 1), relPath });
    byNamespace.set(ns, list);
  }

  const index: string[] = ['# Swarmdo memory vault', ''];
  if (payload.exportedAt) index.push(`Exported: ${payload.exportedAt}`, '');
  index.push(`${files.length} notes across ${byNamespace.size} namespace${byNamespace.size === 1 ? '' : 's'}.`, '');
  for (const ns of [...byNamespace.keys()].sort()) {
    const notes = byNamespace.get(ns)!;
    index.push(`## ${ns}`, '');
    for (const n of notes.sort((a, b) => a.name.localeCompare(b.name))) {
      index.push(`- [[${ns}/${n.name}|${n.name}]]`);
    }
    index.push('');
  }
  files.push({ relPath: 'INDEX.md', content: index.join('\n') });
  return files;
}
