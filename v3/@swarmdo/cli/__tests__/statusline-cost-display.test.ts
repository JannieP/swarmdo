/**
 * Statusline session-cost display configuration.
 *
 * Claude Code's `cost.total_cost_usd` is documented as a client-side estimate
 * that "may differ from your actual bill", and on subscription plans it reads as
 * misleading (token usage is not billed per dollar). The statusline therefore
 * lets each user relabel or hide the cost segment without changing the default:
 *
 *   SWARMDO_STATUSLINE_COST_SYMBOL  override the leading '$' ('' => number alone)
 *   SWARMDO_STATUSLINE_HIDE_COST    1/true/yes/on => omit the segment
 *
 * These tests cover three layers:
 *   1. Generator contract — the emitted script wires the env vars and keeps '$'
 *      as the default, so the customization can never silently regress.
 *   2. Runtime behavior — the generated script renders the right thing for each
 *      configuration when fed a Claude Code stdin payload.
 *   3. Drift guard — the committed `.claude/helpers/statusline.cjs` artifact stays
 *      byte-identical to the generator output for the default options.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { generateStatuslineScript } from '../src/init/statusline-generator.js';
import { DEFAULT_INIT_OPTIONS } from '../src/init/types.js';

const SCRIPT = generateStatuslineScript(DEFAULT_INIT_OPTIONS);

const stripAnsi = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Run the generated statusline against a Claude Code stdin payload. PATH is
 * neutered so the script's `npx`/`git` probes fail instantly and fall back to
 * local data — the cost segment comes purely from stdin, so this stays offline
 * and deterministic. Returns the first (header) line with ANSI stripped.
 */
function renderHeader(env: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'swarmdo-statusline-'));
  const scriptPath = path.join(dir, 'statusline.cjs');
  writeFileSync(scriptPath, SCRIPT, 'utf-8');
  const payload = JSON.stringify({
    model: { display_name: 'Opus 4.8' },
    context_window: { used_percentage: 34 },
    cost: { total_cost_usd: 1.3, total_duration_ms: 376000 },
  });
  try {
    const out = execFileSync(process.execPath, [scriptPath], {
      input: payload,
      encoding: 'utf-8',
      // SWARMDO_STATUSLINE_NO_CLI keeps this hermetic: the script probes absolute
      // global-node_modules paths (/opt/homebrew, /usr/local) that PATH-neutering
      // can't block, so on a dev box with a global install it would fork the real
      // CLI (slow + disturbs the stdin cost payload). NO_CLI skips that fork.
      env: { PATH: '/nonexistent', HOME: dir, SWARMDO_STATUSLINE_NO_CLI: '1', ...env },
      timeout: 15000,
    });
    return stripAnsi(out).split('\n')[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('statusline cost display — generator contract', () => {
  it('reads both env vars and keeps "$" as the default', () => {
    expect(SCRIPT).toContain('SWARMDO_STATUSLINE_COST_SYMBOL');
    expect(SCRIPT).toContain('SWARMDO_STATUSLINE_HIDE_COST');
    // Default must be the dollar sign (?? '$') so existing setups are unchanged.
    expect(SCRIPT).toContain("process.env.SWARMDO_STATUSLINE_COST_SYMBOL ?? '$'");
  });

  it('renders the cost via the configurable symbol, not a hardcoded "$"', () => {
    expect(SCRIPT).toContain('CONFIG.costSymbol + costInfo.costUsd.toFixed(2)');
    // The literal `'$' + costInfo.costUsd` render must be gone.
    expect(SCRIPT).not.toContain("'$' + costInfo.costUsd.toFixed(2)");
  });

  it('guards the cost segment with the plan-aware mode (off hides it)', () => {
    // The legacy SWARMDO_STATUSLINE_HIDE_COST now folds into mode 'off'.
    expect(SCRIPT).toContain("if (CONFIG.hideCost) mode = 'off'");
    expect(SCRIPT).toContain("COST_OPTS.mode !== 'off'");
  });

  it('wires the plan-aware cost mode + account label options', () => {
    expect(SCRIPT).toContain('SWARMDO_STATUSLINE_COST_MODE');
    expect(SCRIPT).toContain('SWARMDO_STATUSLINE_SHOW_ACCOUNT');
    expect(SCRIPT).toContain('function detectPlan');
    expect(SCRIPT).toContain('function renderRateLimitSlot');
    // account read is scoped to plan fields — never the OAuth tokens.
    expect(SCRIPT).toContain('oauthAccount');
    expect(SCRIPT).not.toContain('accessToken');
  });
});

describe('statusline cost display — runtime behavior', () => {
  it('shows "$1.30" by default (backward compatible)', () => {
    expect(renderHeader()).toContain('$1.30');
  });

  it('replaces the symbol when SWARMDO_STATUSLINE_COST_SYMBOL is set', () => {
    const header = renderHeader({ SWARMDO_STATUSLINE_COST_SYMBOL: '⚡' });
    expect(header).toContain('⚡1.30');
    expect(header).not.toContain('$1.30');
  });

  it('omits the segment when SWARMDO_STATUSLINE_HIDE_COST is truthy', () => {
    const header = renderHeader({ SWARMDO_STATUSLINE_HIDE_COST: '1' });
    expect(header).not.toContain('1.30');
  });

  it('shows the number alone when the symbol is an empty string', () => {
    const header = renderHeader({ SWARMDO_STATUSLINE_COST_SYMBOL: '' });
    expect(header).toContain('1.30');
    expect(header).not.toContain('$1.30');
  });
});

/**
 * Plan-aware cost slot. The account lives in ~/.claude.json (HOME points at the
 * temp dir), so we drop a synthetic oauthAccount there; rate_limits ride in on
 * the stdin payload like Claude Code sends them. Account switching is handled by
 * re-reading that file every render, so these are all pure-input renders.
 */
function renderPlan(opts: { env?: Record<string, string>; account?: object; rateLimits?: object } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'swarmdo-statusline-'));
  try {
    writeFileSync(path.join(dir, 'statusline.cjs'), SCRIPT, 'utf-8');
    if (opts.account) writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: opts.account }));
    const payload: Record<string, unknown> = {
      model: { display_name: 'Opus 4.8' },
      context_window: { used_percentage: 34 },
      cost: { total_cost_usd: 1.3, total_duration_ms: 376000 },
    };
    if (opts.rateLimits) payload.rate_limits = opts.rateLimits;
    const out = execFileSync(process.execPath, [path.join(dir, 'statusline.cjs')], {
      input: JSON.stringify(payload),
      encoding: 'utf-8',
      env: { PATH: '/nonexistent', HOME: dir, SWARMDO_STATUSLINE_NO_CLI: '1', ...opts.env },
      timeout: 15000,
    });
    return stripAnsi(out).split('\n')[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('statusline cost display — plan-aware (account switching)', () => {
  const SUB = { billingType: 'stripe_subscription', organizationType: 'claude_max', displayName: 'work' };
  const futureRL = (): object => ({
    five_hour: { used_percentage: 72, resets_at: new Date(Date.now() + 2 * 3600e3).toISOString() },
    seven_day: { used_percentage: 12, resets_at: new Date(Date.now() + 3 * 86400e3).toISOString() },
  });

  it('a subscription account (auto) shows rate-limit windows, not the phantom $', () => {
    const h = renderPlan({ account: SUB, rateLimits: futureRL() });
    expect(h).toContain('5h 72%');
    expect(h).toContain('7d 12%');
    expect(h).not.toContain('$1.30');
  });

  it('a subscription account with no rate_limits payload falls back to $', () => {
    const h = renderPlan({ account: SUB });
    expect(h).toContain('$1.30');
  });

  it('cost-mode=dollars overrides the plan (subscriber still sees $)', () => {
    const h = renderPlan({ account: SUB, rateLimits: futureRL(), env: { SWARMDO_STATUSLINE_COST_MODE: 'dollars' } });
    expect(h).toContain('$1.30');
    expect(h).not.toContain('5h 72%');
  });

  it('cost-mode=off hides the slot entirely', () => {
    const h = renderPlan({ account: SUB, rateLimits: futureRL(), env: { SWARMDO_STATUSLINE_COST_MODE: 'off' } });
    expect(h).not.toContain('5h 72%');
    expect(h).not.toContain('1.30');
  });

  it('the account label is silent by default, shown only with show-account', () => {
    expect(renderPlan({ account: SUB, rateLimits: futureRL() })).not.toContain('work ·');
    expect(renderPlan({ account: SUB, rateLimits: futureRL(), env: { SWARMDO_STATUSLINE_SHOW_ACCOUNT: '1' } })).toContain('work ·');
  });

  it('no logged-in account (unknown plan) defaults to $ — backward compatible', () => {
    expect(renderPlan({ rateLimits: futureRL() })).toContain('$1.30');
  });
});

describe('statusline cost display — committed artifact drift guard', () => {
  it('matches the generator output for default options', () => {
    const artifact = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../.claude/helpers/statusline.cjs',
    );
    if (!existsSync(artifact)) return; // package tested in isolation; nothing to guard
    // The generator bakes the cli version into a `let ver = '…'` line at
    // generation time, so the artifact is always one version-bump behind
    // within a release commit. The guard protects LOGIC sync, not the
    // version stamp — normalize it on both sides.
    const normalizeVer = (src: string): string => src.replace(/let ver = '[^']*'/, "let ver = '<VER>'");
    expect(normalizeVer(readFileSync(artifact, 'utf-8'))).toBe(normalizeVer(SCRIPT));
  });
});
