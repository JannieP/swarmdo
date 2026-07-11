import { describe, it, expect } from 'vitest';
import {
  forecastWindow,
  worstStatus,
  bindingWindow,
  humanizeMs,
  formatForecast,
  type LimitForecast,
} from '../src/usage/limits.ts';

const H5 = 18_000_000;   // 5 hours in ms
const D7 = 604_800_000;  // 7 days in ms
// Reference frame: window resets at H5, so windowStart = 0 and `now` == elapsed.

describe('limits: forecastWindow — projection', () => {
  it('no usage → no projection, status ok', () => {
    const f = forecastWindow({ usedPercentage: 0, windowMs: H5, resetsAtMs: H5 }, H5 / 2);
    expect(f.exhaustionMs).toBeNull();
    expect(f.willExhaust).toBe(false);
    expect(f.status).toBe('ok');
    expect(f.msToReset).toBe(H5 / 2);
  });

  it('exactly on pace (50% at the halfway point) projects to hit the cap right at reset', () => {
    const f = forecastWindow({ usedPercentage: 50, windowMs: H5, resetsAtMs: H5 }, H5 / 2);
    expect(f.exhaustionMs).toBe(H5);      // now(9M) + msTo100(9M)
    expect(f.willExhaust).toBe(true);     // <= resetsAt (boundary)
    expect(f.status).toBe('warn');
  });

  it('a fast burn exhausts well before reset → warn', () => {
    // 50% used only a quarter of the way in
    const f = forecastWindow({ usedPercentage: 50, windowMs: H5, resetsAtMs: H5 }, H5 / 4);
    expect(f.willExhaust).toBe(true);
    expect(f.exhaustionMs).toBe(H5 / 2);  // 4.5M + 4.5M
    expect(f.status).toBe('warn');
  });

  it('a slow burn stays under the cap → ok', () => {
    // only 10% used halfway through
    const f = forecastWindow({ usedPercentage: 10, windowMs: H5, resetsAtMs: H5 }, H5 / 2);
    expect(f.willExhaust).toBe(false);
    expect(f.status).toBe('ok');
    expect(f.exhaustionMs!).toBeGreaterThan(H5); // projected past the reset
  });

  it('already at/over 100% → over, exhaustion marked now', () => {
    const f = forecastWindow({ usedPercentage: 100, windowMs: H5, resetsAtMs: H5 }, H5 / 2);
    expect(f.status).toBe('over');
    expect(f.exhaustionMs).toBe(H5 / 2);
    expect(f.willExhaust).toBe(true);
  });

  it('high usage that will NOT exhaust before reset still warns off the percentage threshold', () => {
    // 85% used but almost at the end of the window → tiny remaining burn projects past reset
    const f = forecastWindow({ usedPercentage: 85, windowMs: H5, resetsAtMs: H5 }, H5 - 100_000);
    expect(f.willExhaust).toBe(false);
    expect(f.status).toBe('warn');        // from used >= warnPct(80)
  });

  it('clock skew (now before the window start) → no projection, never-negative msToReset', () => {
    const f = forecastWindow({ usedPercentage: 50, windowMs: H5, resetsAtMs: H5 }, -1_000_000);
    expect(f.exhaustionMs).toBeNull();    // elapsed <= 0
    expect(f.msToReset).toBe(H5 + 1_000_000);
    expect(f.status).toBe('ok');
  });

  it('respects a custom warn threshold', () => {
    const w = { usedPercentage: 60, windowMs: H5, resetsAtMs: H5 };
    // slow enough not to exhaust: 60% used very late in the window
    const late = H5 - 50_000;
    expect(forecastWindow(w, late, { warnPct: 50 }).status).toBe('warn'); // 60 >= 50
    expect(forecastWindow(w, late, { warnPct: 90 }).status).toBe('ok');   // 60 < 90, no exhaust
  });
});

describe('limits: worstStatus', () => {
  const f = (status: LimitForecast['status']): LimitForecast =>
    ({ usedPercentage: 0, resetsAtMs: 0, msToReset: 0, exhaustionMs: null, willExhaust: false, status });
  it('takes the worst of over > warn > ok, ok for empty', () => {
    expect(worstStatus([])).toBe('ok');
    expect(worstStatus([f('ok'), f('warn'), f('ok')])).toBe('warn');
    expect(worstStatus([f('warn'), f('over')])).toBe('over');
  });
});

describe('limits: bindingWindow', () => {
  const mk = (p: Partial<LimitForecast>): LimitForecast =>
    ({ usedPercentage: 0, resetsAtMs: 0, msToReset: 0, exhaustionMs: null, willExhaust: false, status: 'ok', ...p });
  it('prefers a window that will exhaust; among those, the earliest', () => {
    const early = mk({ willExhaust: true, exhaustionMs: 5_000_000 });
    const late = mk({ willExhaust: true, exhaustionMs: 10_000_000 });
    const safeHigh = mk({ willExhaust: false, usedPercentage: 95 });
    expect(bindingWindow([safeHigh, late, early])).toBe(early);
  });
  it('falls back to the highest percentage when none will exhaust', () => {
    const a = mk({ willExhaust: false, usedPercentage: 40 });
    const b = mk({ willExhaust: false, usedPercentage: 70 });
    expect(bindingWindow([a, b])).toBe(b);
  });
  it('returns null for no windows', () => {
    expect(bindingWindow([])).toBeNull();
  });
});

describe('limits: humanizeMs', () => {
  it('formats minutes, hours, days, and zero', () => {
    expect(humanizeMs(0)).toBe('0m');
    expect(humanizeMs(90_000)).toBe('1m');       // 1.5 min floors to 1
    expect(humanizeMs(3_600_000)).toBe('1h');    // exactly 1h, no minutes
    expect(humanizeMs(9_000_000)).toBe('2h30m'); // 150 min
    expect(humanizeMs(D7)).toBe('7d');           // 7 days, no hours
    expect(humanizeMs(90_060_000)).toBe('1d1h'); // 1501 min = 1d1h1m → 1d1h
  });
});

describe('limits: formatForecast', () => {
  it('describes the over, on-pace, and safe cases', () => {
    const over = formatForecast('7d', { usedPercentage: 100, resetsAtMs: D7, msToReset: 1000, exhaustionMs: 0, willExhaust: true, status: 'over' }, 0);
    expect(over).toMatch(/CAP REACHED/);

    const now = H5 / 4;
    const pace = formatForecast('5h', forecastWindow({ usedPercentage: 50, windowMs: H5, resetsAtMs: H5 }, now), now);
    expect(pace).toMatch(/on pace to hit the cap/);
    expect(pace).toMatch(/before reset/);

    const safe = formatForecast('5h', forecastWindow({ usedPercentage: 5, windowMs: H5, resetsAtMs: H5 }, H5 / 2), H5 / 2);
    expect(safe).toMatch(/stay under the cap/);
  });
});
