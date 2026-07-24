/**
 * profiles — session capability profiles (ultra/smart/light/minimal + default).
 * Pure descriptors + env math; no filesystem here (the command owns fs writes).
 */
import { describe, it, expect } from 'vitest';
import {
  SWARMDO_PROFILES,
  PROFILE_OWNED_ENV_KEYS,
  profileNames,
  recommendedProfile,
  resolveProfile,
  applyProfileEnv,
  profileDotenv,
} from '../src/profiles/profiles.ts';

describe('profiles: ladder + resolution', () => {
  it('exposes exactly the four canonical tiers, leanest → everything', () => {
    expect(profileNames()).toEqual(['ultra', 'smart', 'light', 'minimal']);
    // tiers are distinct and ordered high → low as declared
    expect(SWARMDO_PROFILES.map((p) => p.tier)).toEqual([3, 2, 1, 0]);
  });

  it('recommends exactly one profile, and it is smart', () => {
    const rec = SWARMDO_PROFILES.filter((p) => p.recommended);
    expect(rec).toHaveLength(1);
    expect(recommendedProfile().name).toBe('smart');
  });

  it('resolves canonical names and friendly aliases (default → smart)', () => {
    expect(resolveProfile('ultra')?.name).toBe('ultra');
    expect(resolveProfile('SMART')?.name).toBe('smart'); // case-insensitive
    expect(resolveProfile('  default ')?.name).toBe('smart'); // the "default is an option" alias
    expect(resolveProfile('mid')?.name).toBe('smart');
    expect(resolveProfile('ultramode')?.name).toBe('ultra');
    expect(resolveProfile('bare')?.name).toBe('minimal');
    expect(resolveProfile('nonsense')).toBeUndefined();
  });

  it('every profile names a real base preset', () => {
    const presetNames = new Set(['minimal', 'basic', 'standard', 'advanced', 'max']);
    for (const p of SWARMDO_PROFILES) expect(presetNames.has(p.basePreset)).toBe(true);
  });
});

describe('profiles: env matrix coherence', () => {
  it('only ever sets keys from the owned set', () => {
    for (const p of SWARMDO_PROFILES) {
      for (const k of Object.keys(p.env)) {
        expect(PROFILE_OWNED_ENV_KEYS).toContain(k);
      }
    }
  });

  it('ultra is thorough (ULTRA on, PONYTAIL off) — the two never co-occur', () => {
    for (const p of SWARMDO_PROFILES) {
      const hasUltra = p.env.SWARMDO_ULTRA === '1';
      const hasPony = p.env.SWARMDO_PONYTAIL === '1';
      expect(hasUltra && hasPony).toBe(false); // opposite instincts, never both
    }
    const ultra = resolveProfile('ultra')!;
    expect(ultra.env.SWARMDO_ULTRA).toBe('1');
    expect(ultra.env.SWARMDO_PONYTAIL).toBeUndefined();
  });

  it('minimal opts out of the harness explicitly (=0), others keep it on', () => {
    expect(resolveProfile('minimal')!.env.SWARMDO_HARNESS).toBe('0');
    expect(resolveProfile('smart')!.env.SWARMDO_HARNESS).toBe('1');
    expect(resolveProfile('minimal')!.efficiency).toBe(false);
  });
});

describe('profiles: applyProfileEnv (clean switches)', () => {
  it('sets the profile keys and drops owned keys it does not want', () => {
    // pretend we were on ultra (all levers hot)
    const prev = {
      SWARMDO_ULTRA: '1',
      SWARMDO_HARNESS: '1',
      SWARMDO_ROUTER_NEURAL: '1',
      SWARMDO_V3_ENABLED: 'true', // NOT owned → must survive
      MY_OWN_VAR: 'keepme', // user var → must survive
    };
    const next = applyProfileEnv(prev, resolveProfile('light')!);
    // light wants HARNESS + PONYTAIL only
    expect(next.SWARMDO_HARNESS).toBe('1');
    expect(next.SWARMDO_PONYTAIL).toBe('1');
    // ultra-only levers are gone (no stale carry-over)
    expect(next.SWARMDO_ULTRA).toBeUndefined();
    expect(next.SWARMDO_ROUTER_NEURAL).toBeUndefined();
    // non-owned keys preserved
    expect(next.SWARMDO_V3_ENABLED).toBe('true');
    expect(next.MY_OWN_VAR).toBe('keepme');
  });

  it('switching minimal → ultra removes the HARNESS=0 opt-out', () => {
    const prev = { SWARMDO_HARNESS: '0' };
    const next = applyProfileEnv(prev, resolveProfile('ultra')!);
    expect(next.SWARMDO_HARNESS).toBe('1'); // flipped, not stuck at 0
    expect(next.SWARMDO_ULTRA).toBe('1');
  });
});

describe('profiles: profileDotenv (cross-CLI bridge)', () => {
  it('emits export lines for set keys and unset lines for the rest', () => {
    const dotenv = profileDotenv(resolveProfile('smart')!);
    expect(dotenv).toContain('export SWARMDO_PROFILE=smart');
    expect(dotenv).toContain('export SWARMDO_HARNESS=1');
    expect(dotenv).toContain('export SWARMDO_ROUTER_NEURAL=1');
    // smart wants neither → explicit unset so a re-source clears stale levers
    expect(dotenv).toContain('unset SWARMDO_ULTRA');
    expect(dotenv).toContain('unset SWARMDO_PONYTAIL');
  });
});
