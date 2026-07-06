import { describe, it, expect } from 'vitest';
import { renderVault, renderNote, type ExportPayload } from '../src/memory-vault/vault.ts';
import { parseNote, parseVault, unfenceBody } from '../src/memory-vault/import.ts';

const entry = (key: string, ns: string, value: string | null): any => ({
  key, namespace: ns, value, createdAt: '2026-07-06T10:00:00Z', accessCount: 1, hasEmbedding: true,
});

describe('vault-import: parseNote', () => {
  it('parses key/namespace/body from our own frontmatter', () => {
    const note = renderNote(entry('auth-patterns', 'patterns', 'Use [[jwt-refresh]] tokens.'));
    expect(parseNote(note)).toEqual({ key: 'auth-patterns', namespace: 'patterns', value: 'Use [[jwt-refresh]] tokens.' });
  });
  it('decodes JSON-quoted scalars (keys with colons)', () => {
    const note = renderNote(entry('k: v', 'ns', 'x'));
    expect(parseNote(note)!.key).toBe('k: v');
  });
  it('maps the null-value placeholder back to null', () => {
    const note = renderNote(entry('empty', 'ns', null));
    expect(parseNote(note)!.value).toBeNull();
  });
  it('rejects foreign notes (no swarmdo stamp / no frontmatter)', () => {
    expect(parseNote('# Just my own note\n\nhello')).toBeNull();
    expect(parseNote('---\ntitle: x\n---\nbody')).toBeNull();
  });
});

describe('vault-import: unfenceBody', () => {
  it('re-minifies a pure json fence and leaves everything else alone', () => {
    expect(unfenceBody('```json\n{\n  "a": 1\n}\n```')).toBe('{"a":1}');
    expect(unfenceBody('prose with ```json\ninline\n``` mixed')).toContain('prose');
    expect(unfenceBody('```json\nnot json\n```')).toBe('```json\nnot json\n```');
  });
});

describe('vault-import: roundtrip renderVault → parseVault', () => {
  const payload: ExportPayload = {
    schema: 'swarmdo-memory-export/v1',
    exportedAt: '2026-07-06T10:00:00Z',
    entries: [
      entry('alpha', 'patterns', 'Markdown with [[wikilink]] and **bold**.'),
      entry('compact-json', 'tasks', '{"x":true,"n":2}'),
      entry('auto-memory:file.md:slug', 'auto-memory', 'colon key note'),
      entry('empty-note', 'patterns', null),
    ],
  };

  it('recovers every entry: keys, namespaces, values (JSON value-equal)', () => {
    const { entries, foreign, index } = parseVault(renderVault(payload));
    expect(index).toBe(1); // INDEX.md skipped
    expect(foreign).toBe(0);
    expect(entries).toHaveLength(4);
    const byKey = new Map(entries.map((e) => [e.key, e]));
    expect(byKey.get('alpha')!.value).toBe('Markdown with [[wikilink]] and **bold**.');
    expect(byKey.get('alpha')!.namespace).toBe('patterns');
    expect(JSON.parse(byKey.get('compact-json')!.value!)).toEqual({ x: true, n: 2 });
    expect(byKey.get('auto-memory:file.md:slug')!.namespace).toBe('auto-memory'); // full key survived the pretty filename
    expect(byKey.get('empty-note')!.value).toBeNull();
  });

  it('counts foreign notes in a mixed vault without importing them', () => {
    const files = [...renderVault(payload), { relPath: 'my-own/diary.md', content: '# mine\n\nprivate' }];
    const { entries, foreign } = parseVault(files);
    expect(entries).toHaveLength(4);
    expect(foreign).toBe(1);
  });
});
