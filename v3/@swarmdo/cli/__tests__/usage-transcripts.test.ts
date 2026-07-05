/**
 * Usage analytics — transcript parsing, dedup, pricing and aggregation.
 *
 * Fixtures replicate the shapes Claude Code actually writes to
 * ~/.claude/projects/<encoded-cwd>/<session>.jsonl:
 *   - multi-line JSON entries with message.usage on assistant lines
 *   - the SAME (message.id, requestId) repeated across files (session resume
 *     copies history) and across lines (multi-content-block responses)
 *   - a '<synthetic>' model line (API error placeholder, no billing)
 *   - a legacy entry carrying its own costUSD (must win over computed price)
 *   - a model absent from the price table (must count tokens, cost $0)
 */

// Date grouping is local-time; pin the zone before anything imports.
process.env.TZ = 'UTC';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  collectUsage,
  aggregateUsage,
  aggregateBlocks,
  totalUsage,
  localDateKey,
  normalizeDateBound,
  type UsageEvent,
} from '../src/usage/transcript-usage.js';
import {
  normalizeTranscriptModelId,
  resolveTranscriptPrice,
  transcriptCostUsd,
} from '../src/usage/claude-pricing.js';

// (100×$3 + 200×$15 + 1000×$3.75 + 5000×$0.30) / 1M
const SONNET_COST = (100 * 3 + 200 * 15 + 1000 * 3.75 + 5000 * 0.3) / 1_000_000; // 0.00855

function entry(over: Record<string, unknown>, usage?: Record<string, number>, model = 'claude-sonnet-4-6') {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-01T12:00:00.000Z',
    sessionId: 'sess-aaaa-bbbb',
    requestId: 'req_1',
    cwd: '/Users/tester/proj-a',
    message: {
      id: 'msg_1',
      role: 'assistant',
      model,
      usage: usage ?? {
        input_tokens: 100,
        output_tokens: 200,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 5000,
      },
    },
    ...over,
  });
}

let root: string;
let projectsDir: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'swarmdo-usage-'));
  projectsDir = path.join(root, 'projects');
  const projA = path.join(projectsDir, '-Users-tester-proj-a');
  mkdirSync(projA, { recursive: true });

  // Session 1: the sonnet response written TWICE (two content-block lines,
  // same message.id + requestId) plus junk that must be skipped.
  writeFileSync(
    path.join(projA, 's1.jsonl'),
    [
      entry({}),
      entry({}), // duplicate line, same (msg_1, req_1)
      '{ not json',
      JSON.stringify({ type: 'user', timestamp: '2026-07-01T12:01:00Z', message: { role: 'user' } }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-07-01T12:02:00Z',
        requestId: 'req_err',
        message: { id: 'msg_err', role: 'assistant', model: '<synthetic>', usage: { input_tokens: 9, output_tokens: 9 } },
      }),
    ].join('\n'),
  );

  // Session 2 (resumed): history copy of msg_1/req_1 again, plus a legacy
  // opus entry with costUSD, plus an unpriced Claude 5 entry — next day.
  writeFileSync(
    path.join(projA, 's2.jsonl'),
    [
      entry({ sessionId: 'sess-cccc-dddd' }),
      entry(
        {
          timestamp: '2026-07-02T09:00:00.000Z',
          sessionId: 'sess-cccc-dddd',
          requestId: 'req_2',
          costUSD: 0.5,
          message: {
            id: 'msg_2',
            role: 'assistant',
            model: 'claude-opus-4-8',
            usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        },
        undefined,
        'claude-opus-4-8',
      ),
      entry(
        {
          timestamp: '2026-07-02T10:00:00.000Z',
          sessionId: 'sess-cccc-dddd',
          requestId: 'req_3',
          message: {
            id: 'msg_3',
            role: 'assistant',
            model: 'claude-fable-5',
            usage: { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        },
        undefined,
        'claude-fable-5',
      ),
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('claude-pricing', () => {
  it('normalizes provider-prefixed and versioned ids', () => {
    expect(normalizeTranscriptModelId('anthropic/claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(normalizeTranscriptModelId('us.anthropic.claude-sonnet-4-6-v2:0')).toBe('claude-sonnet-4-6');
    expect(normalizeTranscriptModelId('claude-sonnet-4-6@20260115')).toBe('claude-sonnet-4-6');
  });

  it('resolves families by longest prefix and refuses to guess', () => {
    expect(resolveTranscriptPrice('claude-sonnet-4-6-20260115')?.in).toBe(3);
    expect(resolveTranscriptPrice('claude-opus-4-8')?.out).toBe(75);
    expect(resolveTranscriptPrice('claude-3-5-haiku-20241022')?.in).toBe(0.8);
    expect(resolveTranscriptPrice('claude-fable-5')).toBeUndefined();
  });

  it('computes cache-aware cost', () => {
    const price = resolveTranscriptPrice('claude-sonnet-4-6')!;
    expect(
      transcriptCostUsd(price, { inputTokens: 100, outputTokens: 200, cacheWriteTokens: 1000, cacheReadTokens: 5000 }),
    ).toBeCloseTo(SONNET_COST, 10);
  });
});

describe('collectUsage', () => {
  it('dedupes (message.id, requestId) across lines and files, skips junk', () => {
    const c = collectUsage({ dirs: [projectsDir] });
    expect(c.filesScanned).toBe(2);
    // msg_1 counted once despite 3 occurrences; + opus + fable = 3 events
    expect(c.events).toHaveLength(3);
    const models = c.events.map((e) => e.model).sort();
    expect(models).toEqual(['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-4-6']);
  });

  it('prefers transcript costUSD, computes from table, and never guesses', () => {
    const c = collectUsage({ dirs: [projectsDir] });
    const byModel = Object.fromEntries(c.events.map((e) => [e.model, e]));
    expect(byModel['claude-sonnet-4-6'].costSource).toBe('computed');
    expect(byModel['claude-sonnet-4-6'].costUsd).toBeCloseTo(SONNET_COST, 10);
    expect(byModel['claude-opus-4-8'].costSource).toBe('transcript');
    expect(byModel['claude-opus-4-8'].costUsd).toBe(0.5);
    expect(byModel['claude-fable-5'].costSource).toBe('unpriced');
    expect(byModel['claude-fable-5'].costUsd).toBe(0);
    expect(c.unpricedModels).toEqual(['claude-fable-5']);
  });

  it('uses entry cwd as project identity', () => {
    const c = collectUsage({ dirs: [projectsDir] });
    expect(new Set(c.events.map((e) => e.project))).toEqual(new Set(['/Users/tester/proj-a']));
  });

  it('applies since/until date bounds inclusively', () => {
    expect(collectUsage({ dirs: [projectsDir], since: '2026-07-02' }).events).toHaveLength(2);
    expect(collectUsage({ dirs: [projectsDir], until: '2026-07-01' }).events).toHaveLength(1);
    expect(collectUsage({ dirs: [projectsDir], since: '20260701', until: '20260701' }).events).toHaveLength(1);
  });
});

describe('aggregation', () => {
  it('groups by day chronologically with correct totals', () => {
    const c = collectUsage({ dirs: [projectsDir] });
    const days = aggregateUsage(c.events, 'day');
    expect(days.map((d) => d.key)).toEqual(['2026-07-01', '2026-07-02']);
    expect(days[0].totals.costUsd).toBeCloseTo(SONNET_COST, 10);
    expect(days[0].totals.totalTokens).toBe(100 + 200 + 1000 + 5000);
    expect(days[1].totals.costUsd).toBeCloseTo(0.5, 10);
    expect(days[1].totals.entries).toBe(2);
  });

  it('groups by month and by model (cost-descending)', () => {
    const c = collectUsage({ dirs: [projectsDir] });
    const months = aggregateUsage(c.events, 'month');
    expect(months).toHaveLength(1);
    expect(months[0].key).toBe('2026-07');
    expect(months[0].totals.entries).toBe(3);

    const models = aggregateUsage(c.events, 'model');
    expect(models[0].key).toBe('claude-opus-4-8'); // $0.50 ranks first
  });

  it('grand total matches the sum of events', () => {
    const c = collectUsage({ dirs: [projectsDir] });
    const t = totalUsage(c.events);
    expect(t.entries).toBe(3);
    expect(t.costUsd).toBeCloseTo(0.5 + SONNET_COST, 10);
  });
});

describe('aggregateBlocks (5-hour billing windows)', () => {
  function ev(iso: string, costUsd = 1): UsageEvent {
    const ts = new Date(iso).getTime();
    return {
      dateKey: iso.slice(0, 10), monthKey: iso.slice(0, 7), timestampMs: ts,
      model: 'claude-sonnet-4-6', project: '/p', sessionId: 's',
      inputTokens: 10, outputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0,
      costUsd, costSource: 'computed',
    };
  }

  it('anchors blocks at the top of the first-activity hour and spans 5h', () => {
    const blocks = aggregateBlocks(
      [ev('2026-07-01T01:10:00Z'), ev('2026-07-01T02:59:00Z'), ev('2026-07-01T05:59:59Z')],
      { nowMs: new Date('2026-07-01T23:00:00Z').getTime() },
    );
    expect(blocks).toHaveLength(1); // all inside [01:00, 06:00)
    expect(new Date(blocks[0].startMs).toISOString()).toBe('2026-07-01T01:00:00.000Z');
    expect(blocks[0].totals.entries).toBe(3);
    expect(blocks[0].totals.costUsd).toBe(3);
    expect(blocks[0].active).toBe(false);
  });

  it('starts a fresh block anchored at the next activity after a gap', () => {
    const blocks = aggregateBlocks(
      [ev('2026-07-01T01:10:00Z'), ev('2026-07-01T06:00:00Z'), ev('2026-07-01T20:45:00Z')],
      { nowMs: new Date('2026-07-01T21:00:00Z').getTime() },
    );
    expect(blocks.map((b) => new Date(b.startMs).toISOString())).toEqual([
      '2026-07-01T01:00:00.000Z', // first
      '2026-07-01T06:00:00.000Z', // 06:00 is exactly past [01,06) — new block
      '2026-07-01T20:00:00.000Z', // gap → anchored at 20:00, NOT contiguous 11:00/16:00
    ]);
    expect(blocks[2].active).toBe(true); // now=21:00 inside [20:00, 01:00)
  });

  it('handles out-of-order events (sorts before blocking)', () => {
    const blocks = aggregateBlocks(
      [ev('2026-07-01T04:00:00Z'), ev('2026-07-01T01:10:00Z')],
      { nowMs: 0 },
    );
    expect(blocks).toHaveLength(1);
    expect(new Date(blocks[0].startMs).toISOString()).toBe('2026-07-01T01:00:00.000Z');
  });
});

describe('helpers', () => {
  it('localDateKey renders ISO order in the pinned zone', () => {
    expect(localDateKey(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01');
  });

  it('normalizeDateBound accepts both accepted forms only', () => {
    expect(normalizeDateBound('2026-07-01')).toBe('2026-07-01');
    expect(normalizeDateBound('20260701')).toBe('2026-07-01');
    expect(normalizeDateBound('July 1')).toBeUndefined();
    expect(normalizeDateBound(undefined)).toBeUndefined();
  });
});
