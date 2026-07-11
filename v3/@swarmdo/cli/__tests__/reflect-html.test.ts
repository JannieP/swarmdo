import { describe, it, expect } from 'vitest';
import { escapeHtml, renderReflectionHtml } from '../src/usage/reflect-html.ts';
import { computeReflection } from '../src/usage/reflect.ts';
import type { DayRow, ModelRow, DayTotals } from '../src/usage/diff.ts';

const dt = (p: Partial<DayTotals>): DayTotals => ({
  costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, ...p,
});
const day = (key: string, p: Partial<DayTotals>): DayRow => ({ key, totals: dt(p) });
const mr = (k: string, d: string, p: Partial<DayTotals>): ModelRow => ({ key: k, day: d, totals: dt(p) });

describe('reflect-html: escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('reflect-html: renderReflectionHtml', () => {
  const hist = new Array(24).fill(0);
  hist[13] = 5;
  const r = computeReflection(
    [day('2026-03-01', { costUsd: 12.5, totalTokens: 1000, inputTokens: 400, cacheReadTokens: 600 })],
    [mr('claude-opus-4-8', '2026-03-01', { costUsd: 12.5, totalTokens: 1000 })],
    '2026-03-01', '2026-03-31', {},
    [mr('/repo/alpha', '2026-03-01', { costUsd: 12.5, totalTokens: 1000 })],
    hist,
  );

  it('is a self-contained document with no external references', () => {
    const html = renderReflectionHtml(r);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/https?:\/\//);           // no external URLs
    expect(html).not.toMatch(/<(script|link|img)\b/i); // no scripts / external assets
    expect(html).toContain('</html>');
  });

  it('renders the headline numbers and entities', () => {
    const html = renderReflectionHtml(r);
    expect(html).toContain('$12.50');           // total spend
    expect(html).toContain('claude-opus-4-8');  // top model
    expect(html).toContain('/repo/alpha');      // top project
    expect(html).toContain('13:00');            // peak hour
  });

  it('escapes user-controlled strings (a project path containing markup)', () => {
    const evil = computeReflection(
      [day('2026-03-01', { costUsd: 1, totalTokens: 1 })], [], '2026-03-01', '2026-03-31', {},
      [mr('<script>alert(1)</script>', '2026-03-01', { costUsd: 1, totalTokens: 1 })],
    );
    const html = renderReflectionHtml(evil);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders an empty reflection without crashing (— placeholders)', () => {
    const empty = computeReflection([], [], '2026-03-01', '2026-03-31');
    const html = renderReflectionHtml(empty);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('—');
  });

  it('includes a generated-at line only when provided (stays pure otherwise)', () => {
    expect(renderReflectionHtml(r)).not.toContain('generated ');
    expect(renderReflectionHtml(r, { generatedAt: '2026-03-31' })).toContain('generated 2026-03-31');
  });

  it('renders a delegation stat card when tool calls are present, omits it otherwise', () => {
    expect(renderReflectionHtml(r, { delegation: { taskCalls: 12, toolCalls: 100, ratio: 0.12 } })).toContain('Delegation');
    expect(renderReflectionHtml(r, { delegation: { taskCalls: 0, toolCalls: 0, ratio: 0 } })).not.toContain('Delegation');
    expect(renderReflectionHtml(r)).not.toContain('Delegation');
  });

  it('renders a Cache saved card only when caching actually saved money', () => {
    const withSavings = computeReflection(
      [day('2026-03-01', { costUsd: 1, totalTokens: 12000 })],
      [mr('m', '2026-03-01', { inputTokens: 1000, cacheWriteTokens: 1000, cacheReadTokens: 10000, costUsd: 1, totalTokens: 12000 })],
      '2026-03-01', '2026-03-31',
      { resolvePrice: () => ({ in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 } as any) },
    );
    expect(withSavings.cacheSavingsUsd).toBeGreaterThan(0);
    expect(renderReflectionHtml(withSavings)).toContain('Cache saved');
    expect(renderReflectionHtml(r)).not.toContain('Cache saved'); // fixture has no cache savings
  });
});
