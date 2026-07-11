/**
 * limits.ts — forecast when a Claude Code usage window will hit its cap.
 *
 * Claude Code passes an official `rate_limits` payload to statusline scripts:
 * for the rolling 5-hour and 7-day windows it reports `used_percentage` and
 * `resets_at`. This is the projection layer on top — at the current burn rate,
 * when will the window hit 100%, and does that land before the window resets?
 * ("at this pace you hit the weekly cap Thu 14:00, 6h before it resets").
 *
 * Pure + deterministic: it takes a normalized window state + an injected `now`
 * (the statusline shim maps the raw payload to WindowState — see #46), so the
 * projection math is unit-tested with zero clock or wire-format coupling.
 */

export type LimitStatus = 'ok' | 'warn' | 'over';

/** Rolling-window durations Claude Code reports (5-hour + 7-day caps). */
export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
export const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;

export interface NamedWindow {
  /** short label, '5h' | '7d' */
  label: string;
  state: WindowState;
}

/** Coerce an epoch-seconds, epoch-ms, or ISO-string timestamp to epoch ms. */
function toEpochMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v; // secs vs ms
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
}

function pickWindow(obj: unknown, windowMs: number, label: string): NamedWindow | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const used = (o.used_percentage ?? o.usedPercentage) as unknown;
  const resetsAtMs = toEpochMs(o.resets_at ?? o.resetsAt);
  if (typeof used !== 'number' || !Number.isFinite(used) || resetsAtMs === null) return null;
  return { label, state: { usedPercentage: Math.max(0, Math.min(100, used)), windowMs, resetsAtMs } };
}

/**
 * Map Claude Code's statusline `rate_limits` payload to normalized windows.
 * Tolerant of shape drift: accepts the payload bare or wrapped in `rate_limits`,
 * snake_case or camelCase keys, and epoch-seconds / epoch-ms / ISO `resets_at`.
 * Windows missing usage or a reset time are dropped. Pure.
 */
export function parseRateLimits(payload: unknown): NamedWindow[] {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const rl = (p.rate_limits ?? p.rateLimits ?? p) as Record<string, unknown>;
  const out: NamedWindow[] = [];
  const w5 = pickWindow(rl.five_hour ?? rl.fiveHour, FIVE_HOUR_MS, '5h');
  const w7 = pickWindow(rl.seven_day ?? rl.sevenDay, SEVEN_DAY_MS, '7d');
  if (w5) out.push(w5);
  if (w7) out.push(w7);
  return out;
}

export interface WindowState {
  /** percent of the window's quota consumed, 0..100 */
  usedPercentage: number;
  /** window duration in ms (5h = 18_000_000, 7d = 604_800_000) */
  windowMs: number;
  /** epoch ms when the window resets to 0% */
  resetsAtMs: number;
}

export interface LimitForecast {
  usedPercentage: number;
  resetsAtMs: number;
  /** ms from now until the window resets (never negative) */
  msToReset: number;
  /** projected epoch ms when usage reaches 100% at the current burn rate, or
   *  null when it can't be projected (no burn yet, already at/over 100%, or the
   *  window hasn't started per the clock) */
  exhaustionMs: number | null;
  /** true when exhaustion is projected at or before the window resets */
  willExhaust: boolean;
  status: LimitStatus;
}

/**
 * Forecast a single window. Burn rate is `usedPercentage / elapsed`, where
 * elapsed = now − windowStart and windowStart = resetsAt − windowMs. Pure.
 */
export function forecastWindow(w: WindowState, nowMs: number, opts: { warnPct?: number } = {}): LimitForecast {
  const warnPct = opts.warnPct ?? 80;
  const used = w.usedPercentage;
  const msToReset = Math.max(0, w.resetsAtMs - nowMs);
  const windowStartMs = w.resetsAtMs - w.windowMs;
  const elapsed = nowMs - windowStartMs;

  let exhaustionMs: number | null = null;
  if (used >= 100) {
    // already exhausted — mark exhaustion as "now"
    exhaustionMs = nowMs;
  } else if (used > 0 && elapsed > 0) {
    const msTo100 = ((100 - used) * elapsed) / used; // (remaining%) / (used%/elapsed)
    exhaustionMs = nowMs + msTo100;
  }

  const willExhaust = exhaustionMs !== null && exhaustionMs <= w.resetsAtMs;
  const status: LimitStatus = used >= 100 ? 'over' : (willExhaust || used >= warnPct) ? 'warn' : 'ok';

  return { usedPercentage: used, resetsAtMs: w.resetsAtMs, msToReset, exhaustionMs, willExhaust, status };
}

/** Worst status across windows (over > warn > ok). Pure. */
export function worstStatus(forecasts: LimitForecast[]): LimitStatus {
  const rank: Record<LimitStatus, number> = { ok: 0, warn: 1, over: 2 };
  return forecasts.reduce<LimitStatus>((acc, f) => (rank[f.status] > rank[acc] ? f.status : acc), 'ok');
}

/**
 * The binding window — the one that constrains you first. A window projected to
 * exhaust before reset outranks one that won't; among those that will, the
 * earlier exhaustion wins; otherwise the higher used_percentage. null for [].
 */
export function bindingWindow(forecasts: LimitForecast[]): LimitForecast | null {
  if (forecasts.length === 0) return null;
  return [...forecasts].sort((a, b) => {
    if (a.willExhaust !== b.willExhaust) return a.willExhaust ? -1 : 1;
    if (a.willExhaust && b.willExhaust) return (a.exhaustionMs as number) - (b.exhaustionMs as number);
    return b.usedPercentage - a.usedPercentage;
  })[0];
}

/** Compact human duration for a ms span, e.g. 9000000 → "2h30m", 90000 → "1m". */
export function humanizeMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d${h > 0 ? `${h}h` : ''}`;
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ''}`;
  return `${m}m`;
}

/** One-line summary for a window, e.g. "5h window: 42% used, resets in 2h14m —
 * on pace to hit the cap in ~1h20m (before reset)". `label` names the window. */
export function formatForecast(label: string, f: LimitForecast, nowMs: number): string {
  const head = `${label}: ${Math.round(f.usedPercentage)}% used, resets in ${humanizeMs(f.msToReset)}`;
  if (f.status === 'over') return `${head} — CAP REACHED`;
  if (f.willExhaust && f.exhaustionMs !== null) {
    const inMs = Math.max(0, f.exhaustionMs - nowMs);
    const before = humanizeMs((f.resetsAtMs as number) - (f.exhaustionMs as number));
    return `${head} — on pace to hit the cap in ~${humanizeMs(inMs)} (${before} before reset)`;
  }
  return `${head} — on pace to stay under the cap`;
}
