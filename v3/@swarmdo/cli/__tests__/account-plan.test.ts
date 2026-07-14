import { describe, it, expect } from 'vitest';
import {
  detectPlan,
  resolveEffectiveCostMode,
  accountLabel,
  parseCostMode,
} from '../src/usage/account-plan.js';

describe('detectPlan', () => {
  it('classifies a Max subscription (stripe_subscription / claude_max)', () => {
    expect(detectPlan({ billingType: 'stripe_subscription', organizationType: 'claude_max' })).toBe('subscription');
  });
  it('classifies by org type alone (Team/Enterprise/Pro)', () => {
    expect(detectPlan({ organizationType: 'claude_team' })).toBe('subscription');
    expect(detectPlan({ organizationType: 'claude_enterprise' })).toBe('subscription');
    expect(detectPlan({ organizationType: 'claude_pro' })).toBe('subscription');
  });
  it('classifies by billing type alone (any *subscription*)', () => {
    expect(detectPlan({ billingType: 'subscription' })).toBe('subscription');
  });
  it('treats a known non-subscription billing type as pay-as-you-go', () => {
    expect(detectPlan({ billingType: 'usage_based', organizationType: 'api_console' })).toBe('payg');
  });
  it('is unknown for no/empty/garbage account', () => {
    expect(detectPlan(null)).toBe('unknown');
    expect(detectPlan(undefined)).toBe('unknown');
    expect(detectPlan({})).toBe('unknown');
    expect(detectPlan({ billingType: 42 as unknown })).toBe('unknown');
  });
});

describe('resolveEffectiveCostMode', () => {
  it('auto → limits for subscription, dollars otherwise', () => {
    expect(resolveEffectiveCostMode('auto', 'subscription')).toBe('limits');
    expect(resolveEffectiveCostMode('auto', 'payg')).toBe('dollars');
    expect(resolveEffectiveCostMode('auto', 'unknown')).toBe('dollars');
  });
  it('explicit modes override the plan', () => {
    expect(resolveEffectiveCostMode('dollars', 'subscription')).toBe('dollars');
    expect(resolveEffectiveCostMode('limits', 'payg')).toBe('limits');
    expect(resolveEffectiveCostMode('off', 'subscription')).toBe('off');
  });
});

describe('accountLabel', () => {
  it('prefers displayName, falls back to org, truncates long values', () => {
    expect(accountLabel({ displayName: 'work' })).toBe('work');
    expect(accountLabel({ organizationName: 'Acme Corp' })).toBe('Acme Corp');
    expect(accountLabel({ displayName: 'a-very-long-account-name-indeed' }, 10)).toBe('a-very-lo…');
  });
  it('is empty when nothing usable', () => {
    expect(accountLabel(null)).toBe('');
    expect(accountLabel({})).toBe('');
    expect(accountLabel({ displayName: '   ' })).toBe('');
  });
});

describe('parseCostMode', () => {
  it('accepts the four valid modes case-insensitively', () => {
    expect(parseCostMode('AUTO')).toBe('auto');
    expect(parseCostMode(' dollars ')).toBe('dollars');
    expect(parseCostMode('limits')).toBe('limits');
    expect(parseCostMode('off')).toBe('off');
  });
  it('rejects anything else', () => {
    expect(parseCostMode('percent')).toBeNull();
    expect(parseCostMode('')).toBeNull();
    expect(parseCostMode(5 as unknown)).toBeNull();
  });
});
