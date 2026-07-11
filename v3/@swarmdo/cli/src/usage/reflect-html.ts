/**
 * reflect-html.ts — render a Reflection (see reflect.ts) into a self-contained,
 * shareable HTML dashboard for `swarmdo usage reflect --html`.
 *
 * Pure + deterministic: it takes an already-computed Reflection and returns a
 * complete HTML document string with all CSS inlined (no external requests, no
 * clock — any timestamp is passed in), so it unit-tests without a browser or a
 * network. Every user-controlled string (model ids, project paths) is HTML-
 * escaped. See #47.
 */

import type { Reflection } from './reflect.js';

/** HTML-escape a string for safe interpolation into text or attributes. */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const usd = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number): string => n.toLocaleString('en-US');
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** A labelled proportional bar (width is % of the largest value in its group). */
function bar(label: string, valueText: string, fillPct: number): string {
  const w = Math.max(0, Math.min(100, fillPct));
  return `<div class="bar"><div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`
    + `<div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%"></div></div>`
    + `<div class="bar-val">${escapeHtml(valueText)}</div></div>`;
}

function shareBars(rows: Array<{ model: string; costUsd: number; pct: number }>): string {
  if (!rows.length) return '<p class="empty">—</p>';
  const max = Math.max(...rows.map((r) => r.costUsd), 0) || 1;
  return rows.map((r) => bar(r.model, `${usd(r.costUsd)} · ${pct(r.pct)}`, (r.costUsd / max) * 100)).join('');
}

function hourBars(hist: number[]): string {
  if (!hist.some((v) => v > 0)) return '<p class="empty">—</p>';
  const max = Math.max(...hist) || 1;
  const cells = hist.map((v, h) => {
    const hpct = (v / max) * 100;
    return `<div class="hour" title="${String(h).padStart(2, '0')}:00 — ${usd(v)}">`
      + `<div class="hour-bar" style="height:${hpct.toFixed(1)}%"></div>`
      + `<div class="hour-tick">${h % 6 === 0 ? String(h).padStart(2, '0') : ''}</div></div>`;
  }).join('');
  return `<div class="hours">${cells}</div>`;
}

function stat(label: string, value: string): string {
  return `<div class="stat"><div class="stat-val">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;
}

/** Render the retrospective to a complete self-contained HTML document. Pure. */
export function renderReflectionHtml(r: Reflection, opts: { generatedAt?: string } = {}): string {
  const arrow = r.trend.direction === 'up' ? '↑' : r.trend.direction === 'down' ? '↓' : '→';
  const peak = r.peakHour ? `${String(r.peakHour.hour).padStart(2, '0')}:00` : '—';
  const busiest = r.busiestDay ? `${r.busiestDay.day} (${usd(r.busiestDay.costUsd)})` : '—';
  const gen = opts.generatedAt ? `<p class="gen">generated ${escapeHtml(opts.generatedAt)}</p>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Code Reflect — ${escapeHtml(r.period.from)}..${escapeHtml(r.period.to)}</title>
<style>
:root{--bg:#0f1117;--card:#181b24;--fg:#e6e8ee;--muted:#8b90a0;--accent:#7c9cff;--track:#262a36}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:32px}
.wrap{max-width:840px;margin:0 auto}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--muted);margin:0 0 24px}.gen{color:var(--muted);font-size:12px;margin:24px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px}
.stat{background:var(--card);border-radius:12px;padding:16px}
.stat-val{font-size:22px;font-weight:600}.stat-label{color:var(--muted);font-size:12px;margin-top:4px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:28px 0 12px}
.bar{display:grid;grid-template-columns:minmax(0,1fr) 3fr minmax(0,auto);align-items:center;gap:10px;margin:6px 0}
.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.bar-track{background:var(--track);border-radius:6px;height:14px;overflow:hidden}
.bar-fill{background:var(--accent);height:100%;border-radius:6px}
.bar-val{font-size:12px;color:var(--muted);white-space:nowrap}
.hours{display:flex;align-items:flex-end;gap:3px;height:90px}
.hour{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.hour-bar{width:100%;background:var(--accent);border-radius:3px 3px 0 0;min-height:1px}
.hour-tick{font-size:9px;color:var(--muted);margin-top:4px;height:12px}
.empty{color:var(--muted)}
</style></head><body><div class="wrap">
<h1>Claude Code Reflect ${escapeHtml(arrow)}</h1>
<p class="sub">${escapeHtml(r.period.from)} .. ${escapeHtml(r.period.to)} · ${r.period.spanDays} days · ${r.totals.activeDays} active</p>
<div class="grid">
${stat('Total spend', usd(r.totals.costUsd))}
${stat('Total tokens', num(r.totals.totalTokens))}
${stat('Avg / active day', usd(r.avgCostPerActiveDay))}
${stat('Longest streak', `${r.longestStreak} day${r.longestStreak === 1 ? '' : 's'}`)}
${stat('Peak hour', peak)}
${stat('Cache read', pct(r.cacheReadPct))}
${stat('Busiest day', busiest)}
${stat('Trend', `${arrow} ${pct(r.trend.firstHalfCost > 0 ? (r.trend.secondHalfCost - r.trend.firstHalfCost) / r.trend.firstHalfCost : 0)}`)}
</div>
<h2>Cost by hour of day</h2>${hourBars(r.hourHistogram)}
<h2>Top models</h2>${shareBars(r.topModels)}
<h2>Top projects</h2>${shareBars(r.topProjects)}
${gen}
</div></body></html>`;
}
