import { describe, it, expect } from 'vitest';
import {
  classifyLicense,
  spdxComponents,
  evaluateDep,
  auditLicenses,
  formatLicenseSummary,
} from '../src/license/license.ts';

describe('classifyLicense', () => {
  it('reads the modern string field', () => {
    expect(classifyLicense({ license: 'MIT' })).toBe('MIT');
  });
  it('reads the legacy {type} object', () => {
    expect(classifyLicense({ license: { type: 'Apache-2.0', url: 'x' } as any })).toBe('Apache-2.0');
  });
  it('joins the legacy licenses[] array with OR', () => {
    expect(classifyLicense({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] as any })).toBe('MIT OR Apache-2.0');
  });
  it('falls back to UNKNOWN', () => {
    expect(classifyLicense({})).toBe('UNKNOWN');
    expect(classifyLicense({ license: '' })).toBe('UNKNOWN');
  });
});

describe('spdxComponents', () => {
  it('splits OR/AND expressions and strips parens/+', () => {
    expect(spdxComponents('(MIT OR Apache-2.0)')).toEqual(['MIT', 'Apache-2.0']);
    expect(spdxComponents('Apache-2.0 WITH LLVM-exception')).toEqual(['Apache-2.0', 'LLVM-exception']);
    expect(spdxComponents('GPL-2.0+')).toEqual(['GPL-2.0']);
    expect(spdxComponents('MIT')).toEqual(['MIT']);
  });
});

describe('evaluateDep', () => {
  const dep = (license: string) => ({ name: 'p', version: '1.0.0', license });

  it('passes when no policy', () => {
    expect(evaluateDep(dep('GPL-3.0'), {})).toBeNull();
  });
  it('flags a denied license', () => {
    expect(evaluateDep(dep('GPL-3.0'), { deny: ['GPL-3.0'] })?.reason).toBe('denied');
  });
  it('deny matches any OR component', () => {
    expect(evaluateDep(dep('MIT OR GPL-3.0'), { deny: ['GPL-3.0'] })?.reason).toBe('denied');
  });
  it('flags not-allowed when allowlist misses all components', () => {
    expect(evaluateDep(dep('GPL-3.0'), { allow: ['MIT', 'Apache-2.0'] })?.reason).toBe('not-allowed');
  });
  it('passes when at least one OR component is allowed', () => {
    expect(evaluateDep(dep('MIT OR GPL-3.0'), { allow: ['MIT'] })).toBeNull();
  });
  it('flags UNKNOWN under an allowlist', () => {
    expect(evaluateDep(dep('UNKNOWN'), { allow: ['MIT'] })?.reason).toBe('unknown');
  });
  it('allowUnknown lets UNKNOWN pass', () => {
    expect(evaluateDep(dep('UNKNOWN'), { allow: ['MIT'], allowUnknown: true })).toBeNull();
  });
  it('UNKNOWN passes when only a denylist is set', () => {
    expect(evaluateDep(dep('UNKNOWN'), { deny: ['GPL-3.0'] })).toBeNull();
  });
});

describe('auditLicenses', () => {
  const deps = [
    { name: 'b-pkg', version: '1.0.0', license: 'MIT' },
    { name: 'a-pkg', version: '2.0.0', license: 'GPL-3.0' },
    { name: 'c-pkg', version: '1.0.0', license: 'MIT' },
    { name: 'd-pkg', version: '1.0.0', license: 'UNKNOWN' },
  ];

  it('counts totals and licenses', () => {
    const r = auditLicenses(deps);
    expect(r.total).toBe(4);
    expect(r.byLicense.MIT).toBe(2);
    expect(r.byLicense['GPL-3.0']).toBe(1);
    expect(r.violations).toHaveLength(0); // no policy
  });

  it('reports violations sorted by name under an allowlist', () => {
    const r = auditLicenses(deps, { allow: ['MIT'] });
    expect(r.violations.map((v) => v.name)).toEqual(['a-pkg', 'd-pkg']);
    expect(r.violations[0].reason).toBe('not-allowed');
    expect(r.violations[1].reason).toBe('unknown');
  });

  it('denylist flags only the denied dep', () => {
    const r = auditLicenses(deps, { deny: ['GPL-3.0'] });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].name).toBe('a-pkg');
  });
});

describe('formatLicenseSummary', () => {
  it('reports clean and violation counts', () => {
    expect(formatLicenseSummary({ total: 3, violations: [], byLicense: {} })).toBe('license: 3 deps, 0 violations');
    const r = auditLicenses([{ name: 'x', version: '1', license: 'GPL-3.0' }], { deny: ['GPL-3.0'] });
    expect(formatLicenseSummary(r)).toBe('license: 1 violation across 1 deps');
  });
});
