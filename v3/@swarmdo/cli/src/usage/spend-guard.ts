/**
 * spend-guard.ts — budget/rate-limit policy over the usage transcripts.
 *
 * The usage views *display* spend and 5-hour-block burn; this adds the policy
 * layer — compare the current active block / today / month against configured
 * limits and return an ok|warn|over verdict (+ a non-zero exit under --strict).
 * Useful as a CI gate or a Claude Code hook ("warn me before I blow the 5h
 * window"). The threshold evaluation is pure so it is unit-tested directly.
 */

export type GuardUnit = 'usd' | 'tokens';
export type GuardStatus = 'ok' | 'warn' | 'over';

export interface GuardThreshold {
  key: string;
  label: string;
  current: number;
  limit: number;
  unit: GuardUnit;
}
export interface GuardCheck extends GuardThreshold {
  /** current / limit, 0..∞ */
  pct: number;
  status: GuardStatus;
}
export interface GuardReport {
  checks: GuardCheck[];
  /** worst status across all configured checks */
  status: GuardStatus;
  /** whether any threshold was actually configured (limit > 0) */
  configured: boolean;
}

const RANK: Record<GuardStatus, number> = { ok: 0, warn: 1, over: 2 };

/** Evaluate thresholds. Only those with a positive limit count. `warnPct`
 * (0..1) is the fraction of the limit at which a check flips ok→warn. */
export function evaluateGuard(thresholds: GuardThreshold[], warnPct = 0.8): GuardReport {
  const wp = warnPct > 0 && warnPct < 1 ? warnPct : 0.8;
  const checks: GuardCheck[] = thresholds
    .filter((t) => t.limit > 0)
    .map((t) => {
      const pct = t.current / t.limit;
      const status: GuardStatus = pct >= 1 ? 'over' : pct >= wp ? 'warn' : 'ok';
      return { ...t, pct, status };
    });
  const status = checks.reduce<GuardStatus>((acc, c) => (RANK[c.status] > RANK[acc] ? c.status : acc), 'ok');
  return { checks, status, configured: checks.length > 0 };
}
