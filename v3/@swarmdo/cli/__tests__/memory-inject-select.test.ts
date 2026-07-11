import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  trimContent,
  selectInjectionMemories,
  extractPromptFromPayload,
  mapSearchResultsToCandidates,
  type InjectionCandidate,
  type SearchRow,
} from '../src/memory-inject/select.ts';

const cand = (
  key: string,
  score: number,
  content: string,
  namespace = 'claude-memories',
): InjectionCandidate => ({ key, namespace, content, score });

describe('estimateTokens', () => {
  it('is ceil(chars / charsPerToken)', () => {
    expect(estimateTokens('12345678', 4)).toBe(2);
    expect(estimateTokens('123456789', 4)).toBe(3); // 9/4 → 2.25 → 3
    expect(estimateTokens('abc', 1)).toBe(3);
    expect(estimateTokens('', 4)).toBe(0);
  });
  it('falls back to the default when charsPerToken is zero or negative', () => {
    expect(estimateTokens('12345678', 0)).toBe(2); // uses default 4
    expect(estimateTokens('12345678', -1)).toBe(2);
  });
});

describe('trimContent', () => {
  it('collapses whitespace and passes short content through', () => {
    expect(trimContent('  hello   world \n\t x ', 100)).toBe('hello world x');
  });
  it('caps at a word boundary and appends an ellipsis', () => {
    const out = trimContent('alpha beta gamma delta epsilon', 18);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(19); // <= cap + ellipsis
    expect(out).not.toContain('  ');
  });
  it('maxChars <= 0 returns the whole collapsed string', () => {
    expect(trimContent('a  b   c', 0)).toBe('a b c');
  });
});

describe('selectInjectionMemories', () => {
  it('returns an empty block for no candidates', () => {
    const r = selectInjectionMemories([]);
    expect(r.block).toBe('');
    expect(r.used).toEqual([]);
    expect(r.tokensUsed).toBe(0);
  });

  it('drops every candidate below the relevance threshold', () => {
    const r = selectInjectionMemories([cand('a', 0.2, 'low relevance'), cand('b', 0.1, 'lower')], {
      minRelevance: 0.35,
    });
    expect(r.block).toBe('');
    expect(r.used).toHaveLength(0);
  });

  it('includes above-threshold memories, highest score first, with source + percent', () => {
    const r = selectInjectionMemories([
      cand('low', 0.4, 'second memory body', 'patterns'),
      cand('high', 0.9, 'first memory body', 'auto-memory'),
    ]);
    expect(r.used.map((u) => u.key)).toEqual(['high', 'low']);
    expect(r.block).toContain('## 🧠 Relevant memories (swarmdo)');
    expect(r.block).toContain('verify file/flag/function names'); // the caveat intro
    expect(r.block).toContain('- **[auto-memory/high]** (90%) first memory body');
    expect(r.block).toContain('- **[patterns/low]** (40%) second memory body');
  });

  it('dedups the same memory bridged into multiple namespaces, keeping the higher score', () => {
    const body = 'the same memory content';
    const r = selectInjectionMemories([
      cand('k1', 0.7, body, 'claude-memories'),
      cand('k2', 0.9, body, 'auto-memory'),
    ]);
    expect(r.used).toHaveLength(1);
    expect(r.used[0].score).toBe(0.9); // higher-scored copy survives
    expect(r.skipped).toBe(0); // dedup drops are not counted as skipped
  });

  it('caps at topK and counts the remainder as skipped', () => {
    const r = selectInjectionMemories(
      [cand('a', 0.9, 'aaa'), cand('b', 0.8, 'bbb'), cand('c', 0.7, 'ccc')],
      { topK: 1 },
    );
    expect(r.used).toHaveLength(1);
    expect(r.used[0].key).toBe('a');
    expect(r.skipped).toBe(2);
  });

  it('packs under the token budget: a huge memory is skipped while a small one still fits', () => {
    const big = cand('big', 0.9, 'X'.repeat(8000));
    const small = cand('small', 0.5, 'short note');
    const r = selectInjectionMemories([big, small], {
      budgetTokens: 1000,
      charsPerToken: 1,
      maxItemChars: 10000, // no trimming, so the big item really is huge
    });
    expect(r.used.map((u) => u.key)).toEqual(['small']);
    expect(r.skipped).toBe(1); // the big one
  });

  it('returns an empty block when even the header cannot fit the budget', () => {
    const r = selectInjectionMemories([cand('a', 0.9, 'anything')], { budgetTokens: 1 });
    expect(r.block).toBe('');
    expect(r.used).toHaveLength(0);
  });

  it('trims long content in the rendered block', () => {
    const r = selectInjectionMemories([cand('a', 0.9, 'word '.repeat(400))], { maxItemChars: 40 });
    expect(r.used[0].content.length).toBeLessThanOrEqual(41); // cap + ellipsis
    expect(r.block).toContain('…');
  });
});

describe('extractPromptFromPayload', () => {
  it('reads the .prompt field from a Claude Code hook payload', () => {
    expect(extractPromptFromPayload('{"prompt":"fix the auth bug","session_id":"x"}')).toBe(
      'fix the auth bug',
    );
  });
  it('falls back to userPrompt / message / text', () => {
    expect(extractPromptFromPayload('{"userPrompt":"a"}')).toBe('a');
    expect(extractPromptFromPayload('{"message":"b"}')).toBe('b');
    expect(extractPromptFromPayload('{"text":"c"}')).toBe('c');
  });
  it('treats non-JSON input as the raw prompt', () => {
    expect(extractPromptFromPayload('  just a plain prompt  ')).toBe('just a plain prompt');
  });
  it('returns empty string for empty input or JSON without a prompt field', () => {
    expect(extractPromptFromPayload('')).toBe('');
    expect(extractPromptFromPayload('   ')).toBe('');
    expect(extractPromptFromPayload('{"session_id":"x"}')).toBe('');
  });
});

describe('mapSearchResultsToCandidates', () => {
  const rows: SearchRow[] = [
    { key: 'a', content: 'alpha', score: 0.8, namespace: 'claude-memories' },
    { key: 'b', content: '   ', score: 0.7, namespace: 'auto-memory' }, // empty → dropped
    { key: 'c', content: 'gamma', score: 0.6, namespace: 'tasks' },
  ];

  it('maps rows and drops empty content', () => {
    const out = mapSearchResultsToCandidates(rows);
    expect(out.map((c) => c.key)).toEqual(['a', 'c']);
    expect(out[0]).toMatchObject({ key: 'a', namespace: 'claude-memories', score: 0.8 });
  });

  it('filters to an allowed namespace set (array or Set)', () => {
    expect(mapSearchResultsToCandidates(rows, ['claude-memories']).map((c) => c.key)).toEqual(['a']);
    expect(
      mapSearchResultsToCandidates(rows, new Set(['claude-memories', 'tasks'])).map((c) => c.key),
    ).toEqual(['a', 'c']);
  });

  it('defaults a missing score to 0', () => {
    const out = mapSearchResultsToCandidates([
      { key: 'x', content: 'y', namespace: 'patterns' } as SearchRow,
    ]);
    expect(out[0].score).toBe(0);
  });
});
