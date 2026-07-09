import { describe, it, expect } from 'vitest';
import {
  classifyLicense,
  spdxComponents,
  evaluateDep,
  auditLicenses,
  formatLicenseSummary,
  expandLicenseId,
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
  it('maps npm special values (SEE LICENSE IN / UNLICENSED) to UNKNOWN', () => {
    expect(classifyLicense({ license: 'SEE LICENSE IN LICENSE.txt' })).toBe('UNKNOWN');
    expect(classifyLicense({ license: 'SEE LICENSE IN <filename>' })).toBe('UNKNOWN');
    expect(classifyLicense({ license: 'UNLICENSED' })).toBe('UNKNOWN');
    expect(classifyLicense({ license: { type: 'SEE LICENSE IN COPYING' } as any })).toBe('UNKNOWN');
    // a real SPDX id containing "see" is not mis-caught
    expect(classifyLicense({ license: 'MIT' })).toBe('MIT');
  });
});

describe('SEE LICENSE IN policy handling', () => {
  it('reports the accurate `unknown` reason under an allowlist, not a garbage not-allowed', () => {
    const dep = { name: 'x', version: '1.0.0', license: classifyLicense({ license: 'SEE LICENSE IN LICENSE.txt' }) };
    const v = evaluateDep(dep, { allow: ['MIT'] });
    // before the fix: license parsed to atom "SEE" → reason 'not-allowed', license text leaked
    expect(v?.reason).toBe('unknown');
    expect(v?.license).toBe('UNKNOWN');
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
  it('OR with a denied branch still PASSES — the other branch is a lawful choice (SPDX OR = choice)', () => {
    // (MIT OR GPL-3.0) under deny:[GPL-3.0]: the consumer may take MIT → compliant.
    expect(evaluateDep(dep('MIT OR GPL-3.0'), { deny: ['GPL-3.0'] })).toBeNull();
  });
  it('OR denied only when EVERY branch is denied', () => {
    expect(evaluateDep(dep('GPL-2.0 OR GPL-3.0'), { deny: ['GPL-2.0', 'GPL-3.0'] })?.reason).toBe('denied');
  });
  it('AND with a denied license IS denied (both apply concurrently)', () => {
    expect(evaluateDep(dep('MIT AND GPL-3.0'), { deny: ['GPL-3.0'] })?.reason).toBe('denied');
  });
  it('AND fails an allowlist that misses one conjunct — closes the copyleft-slips-through hole', () => {
    // MIT AND GPL-3.0 under allow:[MIT, Apache-2.0]: GPL-3.0 also applies and is unvetted → violation.
    expect(evaluateDep(dep('MIT AND GPL-3.0'), { allow: ['MIT', 'Apache-2.0'] })?.reason).toBe('not-allowed');
  });
  it('AND passes only when EVERY conjunct is allowed', () => {
    expect(evaluateDep(dep('MIT AND Apache-2.0'), { allow: ['MIT', 'Apache-2.0'] })).toBeNull();
  });
  it('respects AND-over-OR precedence (parenthesized and bare)', () => {
    // (MIT OR (Apache-2.0 AND GPL-3.0)) under allow:[MIT] → take the MIT branch → pass
    expect(evaluateDep(dep('MIT OR (Apache-2.0 AND GPL-3.0)'), { allow: ['MIT'] })).toBeNull();
    // AND binds tighter: `MIT OR Apache-2.0 AND GPL-3.0` = `MIT OR (Apache-2.0 AND GPL-3.0)`.
    // Deny MIT → the Apache-2.0 AND GPL-3.0 term survives as a lawful choice → pass.
    expect(evaluateDep(dep('MIT OR Apache-2.0 AND GPL-3.0'), { deny: ['MIT'] })).toBeNull();
    // …but allow:[Apache-2.0] only (GPL-3.0 unvetted) → neither branch fully allowed → not-allowed
    expect(evaluateDep(dep('MIT OR Apache-2.0 AND GPL-3.0'), { allow: ['Apache-2.0'] })?.reason).toBe('not-allowed');
  });
  it('matches the base license of a WITH-exception expression', () => {
    expect(evaluateDep(dep('Apache-2.0 WITH LLVM-exception'), { allow: ['Apache-2.0'] })).toBeNull();
    expect(evaluateDep(dep('GPL-3.0 WITH Classpath-exception-2.0'), { deny: ['GPL-3.0'] })?.reason).toBe('denied');
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

  it('a deprecated bare GNU id is denied by a modern -only/-or-later policy', () => {
    // npm dep declares legacy `GPL-2.0`; policy written in current SPDX form
    expect(evaluateDep(dep('GPL-2.0'), { deny: ['GPL-2.0-only', 'GPL-2.0-or-later'] })?.reason).toBe('denied');
    expect(evaluateDep(dep('GPL-2.0'), { deny: ['GPL-2.0-or-later'] })?.reason).toBe('denied');
  });
  it('the reverse: a policy written with the bare id catches a modern-declared dep', () => {
    expect(evaluateDep(dep('AGPL-3.0-only'), { deny: ['AGPL-3.0'] })?.reason).toBe('denied');
  });
  it('keeps -only and -or-later DISTINCT (bare form bridges, suffixed forms do not)', () => {
    // deny only the -only variant → an -or-later dep is NOT denied
    expect(evaluateDep(dep('GPL-2.0-or-later'), { deny: ['GPL-2.0-only'] })).toBeNull();
  });
  it('a bare GNU dep passes an allowlist naming its suffixed form', () => {
    expect(evaluateDep(dep('LGPL-2.1'), { allow: ['LGPL-2.1-only', 'MIT'] })).toBeNull();
  });
  it('expandLicenseId expands only the deprecated bare ids', () => {
    expect(expandLicenseId('GPL-2.0').sort()).toEqual(['GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later']);
    expect(expandLicenseId('GPL-2.0-only')).toEqual(['GPL-2.0-only']); // suffixed stays exact
    expect(expandLicenseId('MIT')).toEqual(['MIT']);
    expect(expandLicenseId('GPL-2.0+')).toEqual(['GPL-2.0+', 'GPL-2.0-or-later']);
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
