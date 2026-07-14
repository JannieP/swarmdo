/**
 * account-plan.ts — decide what the statusline "cost" slot should mean for the
 * currently-authenticated Claude account.
 *
 * Claude Code stores the active account in `~/.claude.json` under `oauthAccount`
 * and OVERWRITES it on account switch — it never records history, and the
 * transcript is account-blind. So the only reliable signal is "who is logged in
 * right now", read live at render time. From that we pick the metric:
 *
 *   - subscription (Max/Team/Enterprise/Pro, flat fee) → a dollar figure is a
 *     phantom you never pay; show rate-limit % instead.
 *   - pay-as-you-go (API/console usage billing) → the dollar figure is real.
 *
 * Pure + injectable (no fs here) so it is unit-tested against literal account
 * objects. The statusline shim reads the file and passes the object in.
 */

/** The subset of `~/.claude.json.oauthAccount` we look at (never tokens). */
export interface OAuthAccountLike {
  billingType?: unknown;
  organizationType?: unknown;
  /** shown only when the user opts into --show-account */
  displayName?: unknown;
  organizationName?: unknown;
}

export type Plan = 'subscription' | 'payg' | 'unknown';

/** How the user configured the cost slot. `auto` defers to the detected plan. */
export type CostMode = 'auto' | 'dollars' | 'limits' | 'off';

/** What the slot actually renders after resolving `auto` against the plan. */
export type EffectiveCostMode = 'dollars' | 'limits' | 'off';

const SUBSCRIPTION_BILLING = /subscription/i; // e.g. "stripe_subscription"
const SUBSCRIPTION_ORG = /claude_(max|team|enterprise|pro)/i; // e.g. "claude_max"

/**
 * Classify the active account. Subscription when the billing type is a
 * subscription OR the org is a Claude consumer/team plan; pay-as-you-go when a
 * known non-subscription billing type is present; unknown when we can't tell
 * (no account, unrecognized shape) — callers treat unknown like payg so a real
 * dollar figure still shows rather than a blank.
 */
export function detectPlan(account: OAuthAccountLike | null | undefined): Plan {
  if (!account || typeof account !== 'object') return 'unknown';
  const billing = typeof account.billingType === 'string' ? account.billingType : '';
  const org = typeof account.organizationType === 'string' ? account.organizationType : '';
  if (SUBSCRIPTION_BILLING.test(billing) || SUBSCRIPTION_ORG.test(org)) return 'subscription';
  if (billing) return 'payg'; // a known, non-subscription billing type
  return 'unknown';
}

/**
 * Resolve the configured mode against the detected plan into what to actually
 * render. `auto` → limits for subscription, dollars otherwise. Explicit modes
 * pass through unchanged (the user overrides the heuristic on purpose).
 */
export function resolveEffectiveCostMode(mode: CostMode, plan: Plan): EffectiveCostMode {
  if (mode === 'off') return 'off';
  if (mode === 'dollars') return 'dollars';
  if (mode === 'limits') return 'limits';
  // auto
  return plan === 'subscription' ? 'limits' : 'dollars';
}

/** A short, screenshare-safe account label. Prefers displayName, then org. */
export function accountLabel(account: OAuthAccountLike | null | undefined, maxLen = 16): string {
  if (!account) return '';
  const raw =
    (typeof account.displayName === 'string' && account.displayName) ||
    (typeof account.organizationName === 'string' && account.organizationName) ||
    '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen - 1) + '…' : trimmed;
}

/** Normalize a raw cost-mode string (env/config) to a valid CostMode or null. */
export function parseCostMode(raw: unknown): CostMode | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return v === 'auto' || v === 'dollars' || v === 'limits' || v === 'off' ? v : null;
}
