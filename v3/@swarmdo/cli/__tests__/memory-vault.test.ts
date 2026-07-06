import { describe, it, expect } from 'vitest';
import {
  sanitizeNoteName,
  renderBody,
  renderNote,
  renderVault,
  type ExportPayload,
} from '../src/memory-vault/vault.ts';

const entry = (key: string, ns = 'default', value: string | null = 'hello'): any => ({
  key, namespace: ns, value, createdAt: '2026-07-06T10:00:00Z', updatedAt: null, accessCount: 3, hasEmbedding: true,
});

describe('memory-vault: sanitizeNoteName', () => {
  it('strips fs- and Obsidian-reserved characters', () => {
    expect(sanitizeNoteName('auth/patterns: [v2] #1')).toBe('auth-patterns- -v2- -1');
    expect(sanitizeNoteName('a|b*c?d"e<f>g')).toBe('a-b-c-d-e-f-g');
  });
  it('collapses repeats, trims edges, caps length, never returns empty', () => {
    expect(sanitizeNoteName('--x--')).toBe('x');
    expect(sanitizeNoteName('///')).toBe('untitled');
    expect(sanitizeNoteName('y'.repeat(300)).length).toBe(120);
  });
});

describe('memory-vault: renderBody', () => {
  it('passes markdown (and [[wikilinks]]) through untouched', () => {
    const md = 'See [[other-note]] and **bold**.';
    expect(renderBody(md)).toBe(md);
  });
  it('fences JSON object/array values', () => {
    expect(renderBody('{"a":1}')).toBe('```json\n{\n  "a": 1\n}\n```');
    expect(renderBody('[1,2]')).toContain('```json');
  });
  it('leaves invalid-JSON braces raw and placeholders nulls', () => {
    expect(renderBody('{not json}')).toBe('{not json}');
    expect(renderBody(null)).toBe('*(no stored value)*');
    expect(renderBody('')).toBe('*(no stored value)*');
  });
});

describe('memory-vault: renderNote', () => {
  it('emits YAML frontmatter with the entry metadata', () => {
    const note = renderNote(entry('auth-patterns', 'patterns'));
    expect(note.startsWith('---\n')).toBe(true);
    expect(note).toContain('key: auth-patterns');
    expect(note).toContain('namespace: patterns');
    expect(note).toContain('created: 2026-07-06T10:00:00.000Z');
    expect(note).not.toContain('updated:'); // null timestamp omitted
    expect(note).toContain('accessCount: 3');
    expect(note).toContain('source: swarmdo-memory');
    expect(note.trimEnd().endsWith('hello')).toBe(true);
  });
  it('quotes YAML-hostile keys', () => {
    expect(renderNote(entry('k: v'))).toContain('key: "k: v"');
  });
});

describe('memory-vault: renderVault', () => {
  const payload: ExportPayload = {
    schema: 'swarmdo-memory-export/v1',
    exportedAt: '2026-07-06T10:00:00Z',
    entries: [
      entry('beta', 'patterns'),
      entry('alpha', 'patterns'),
      entry('solo', 'tasks', '{"x":true}'),
      entry('a/b', 'patterns'),   // sanitizes to a-b
      entry('a\\b', 'patterns'),  // ALSO sanitizes to a-b → -2 suffix
    ],
  };

  it('writes namespace folders, dedupes collisions, appends INDEX.md', () => {
    const files = renderVault(payload);
    const paths = files.map((f) => f.relPath);
    expect(paths).toContain('patterns/beta.md');
    expect(paths).toContain('tasks/solo.md');
    expect(paths).toContain('patterns/a-b.md');
    expect(paths).toContain('patterns/a-b-2.md'); // collision suffix
    expect(paths[paths.length - 1]).toBe('INDEX.md');
    expect(files).toHaveLength(6); // 5 notes + index
  });

  it('INDEX.md groups by namespace, sorts, and wikilinks every note', () => {
    const index = renderVault(payload).find((f) => f.relPath === 'INDEX.md')!.content;
    expect(index).toContain('# Swarmdo memory vault');
    expect(index).toContain('5 notes across 2 namespaces.');
    expect(index).toContain('## patterns');
    expect(index).toContain('- [[patterns/alpha|alpha]]');
    expect(index).toContain('- [[tasks/solo|solo]]');
    expect(index.indexOf('## patterns')).toBeLessThan(index.indexOf('## tasks'));
    expect(index.indexOf('[[patterns/alpha|alpha]]')).toBeLessThan(index.indexOf('[[patterns/beta|beta]]'));
  });

  it('fenced JSON lands in the right note', () => {
    const solo = renderVault(payload).find((f) => f.relPath === 'tasks/solo.md')!.content;
    expect(solo).toContain('```json');
    expect(solo).toContain('"x": true');
  });

  it('names colon-scoped keys by their final segment (full key in frontmatter)', () => {
    const files = renderVault({ entries: [entry('auto-memory:file.md:nice-slug', 'auto-memory')] });
    expect(files[0].relPath).toBe('auto-memory/nice-slug.md');
    expect(files[0].content).toContain('key: auto-memory:file.md:nice-slug');
  });
});
