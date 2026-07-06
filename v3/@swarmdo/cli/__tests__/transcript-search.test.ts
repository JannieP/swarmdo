import { describe, it, expect } from 'vitest';
import { parseQuery, matchesQuery, makeSnippet, searchableText, searchLines, rankMatches } from '../src/transcript/search.ts';

const userLine = (text: string): any => ({ type: 'user', message: { role: 'user', content: text } });
const asstLine = (text: string): any => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const toolLine = (): any => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] } });

describe('transcript-search: query', () => {
  it('lowercases, dedupes, rejects empty', () => {
    expect(parseQuery('  Obsidian VAULT obsidian ')).toEqual(['obsidian', 'vault']);
    expect(() => parseQuery('   ')).toThrow(/empty/);
  });
  it('AND semantics, case-insensitive', () => {
    expect(matchesQuery('The Obsidian vault sync', ['obsidian', 'vault'])).toBe(true);
    expect(matchesQuery('The Obsidian plan', ['obsidian', 'vault'])).toBe(false);
  });
});

describe('transcript-search: snippets', () => {
  it('windows around the first term and ellipsizes', () => {
    const long = 'x'.repeat(300) + ' NEEDLE here ' + 'y'.repeat(300);
    const s = makeSnippet(long, ['needle']);
    expect(s).toContain('NEEDLE');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(164);
  });
  it('flattens whitespace', () => {
    expect(makeSnippet('a\n\n  b\tc', ['b'])).toBe('a b c');
  });
});

describe('transcript-search: line extraction + session search', () => {
  it('searches user + assistant text, skips tool-only lines and system noise', () => {
    const lines = [
      userLine('let us build the obsidian vault sync'),
      asstLine('Shipping the Obsidian vault watcher now.'),
      toolLine(),
      { type: 'progress' },
      userLine('<system-reminder>obsidian vault</system-reminder>'), // stripped by cleanUserText
    ];
    expect(searchableText(toolLine() as any)).toBeNull();
    const { hits, snippets } = searchLines(lines as any, ['obsidian', 'vault']);
    expect(hits).toBe(2);
    expect(snippets).toHaveLength(2);
    expect(snippets[0].role).toBe('user');
    expect(snippets[1].role).toBe('assistant');
  });

  it('caps snippets but keeps counting hits', () => {
    const lines = Array.from({ length: 7 }, (_, i) => userLine(`obsidian mention ${i}`));
    const { hits, snippets } = searchLines(lines as any, ['obsidian']);
    expect(hits).toBe(7);
    expect(snippets).toHaveLength(3);
  });
});

describe('transcript-search: ranking', () => {
  it('hits desc, then recency', () => {
    const m = (id: string, hits: number, mtimeMs: number): any => ({ sessionId: id, project: 'p', mtimeMs, hits, snippets: [] });
    const ranked = rankMatches([m('old-many', 5, 1), m('new-few', 2, 9), m('new-many', 5, 9)]);
    expect(ranked.map((x) => x.sessionId)).toEqual(['new-many', 'old-many', 'new-few']);
  });
});
