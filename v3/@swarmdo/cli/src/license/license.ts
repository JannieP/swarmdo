/**
 * license.ts — audit dependency licenses against an allow/deny policy. Supply-
 * chain hygiene for agent-built projects: catch a copyleft (GPL) or unknown
 * license slipping into a tree that must stay permissive, and fail CI on it.
 *
 * Distinct from `security` (CVE/vulnerability scanning) — this is license
 * COMPLIANCE. Pure + deterministic: the engine takes a list of
 * {name, version, license} plus a policy and returns violations. The fs walk
 * over node_modules lives in ../commands/license.ts.
 */

export interface DepLicense {
  name: string;
  version: string;
  /** SPDX id/expression, or 'UNKNOWN' */
  license: string;
}

export interface LicensePolicy {
  /** if non-empty, a dep must match at least one to pass */
  allow?: string[];
  /** any match fails the dep */
  deny?: string[];
  /** treat UNKNOWN as a pass even when an allowlist is set (default false) */
  allowUnknown?: boolean;
}

export type ViolationReason = 'denied' | 'not-allowed' | 'unknown';

export interface Violation {
  name: string;
  version: string;
  license: string;
  reason: ViolationReason;
}

export interface LicenseReport {
  total: number;
  violations: Violation[];
  /** license id → count across all deps */
  byLicense: Record<string, number>;
}

/**
 * Normalize a package.json `license`/`licenses` field to an SPDX string.
 * Handles the modern string, the legacy `{type}` object, and the legacy
 * `licenses: [{type}]` array (→ `A OR B`). Missing → 'UNKNOWN'.
 */
export function classifyLicense(pkg: {
  license?: unknown;
  licenses?: unknown;
}): string {
  const l = pkg.license;
  if (typeof l === 'string' && l.trim()) return l.trim();
  if (l && typeof l === 'object' && typeof (l as { type?: unknown }).type === 'string') {
    return (l as { type: string }).type.trim() || 'UNKNOWN';
  }
  const arr = pkg.licenses;
  if (Array.isArray(arr) && arr.length) {
    const types = arr
      .map((e) => (typeof e === 'string' ? e : (e as { type?: unknown })?.type))
      .filter((t): t is string => typeof t === 'string' && !!t.trim());
    if (types.length) return types.join(' OR ');
  }
  return 'UNKNOWN';
}

/** Split an SPDX expression into its atomic license ids (strips OR/AND/WITH/parens/+). */
export function spdxComponents(expr: string): string[] {
  return expr
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND|WITH)\s+/i)
    .map((s) => s.trim().replace(/\+$/, ''))
    .filter(Boolean);
}

/** Evaluate one dep against the policy; null if it passes. Pure. */
export function evaluateDep(dep: DepLicense, policy: LicensePolicy): Violation | null {
  const allow = new Set(policy.allow ?? []);
  const deny = new Set(policy.deny ?? []);
  const isUnknown = dep.license === 'UNKNOWN' || !dep.license;
  const components = isUnknown ? [] : spdxComponents(dep.license);

  if (components.some((c) => deny.has(c))) {
    return { name: dep.name, version: dep.version, license: dep.license, reason: 'denied' };
  }
  if (isUnknown) {
    if (allow.size > 0 && !policy.allowUnknown) {
      return { name: dep.name, version: dep.version, license: 'UNKNOWN', reason: 'unknown' };
    }
    return null;
  }
  if (allow.size > 0 && !components.some((c) => allow.has(c))) {
    return { name: dep.name, version: dep.version, license: dep.license, reason: 'not-allowed' };
  }
  return null;
}

/** Audit a dependency set against a policy. Pure. */
export function auditLicenses(deps: DepLicense[], policy: LicensePolicy = {}): LicenseReport {
  const violations: Violation[] = [];
  const byLicense: Record<string, number> = {};
  for (const dep of deps) {
    const lic = dep.license || 'UNKNOWN';
    byLicense[lic] = (byLicense[lic] ?? 0) + 1;
    const v = evaluateDep(dep, policy);
    if (v) violations.push(v);
  }
  violations.sort((a, b) => a.name.localeCompare(b.name));
  return { total: deps.length, violations, byLicense };
}

/** One-line human summary. */
export function formatLicenseSummary(r: LicenseReport): string {
  if (r.violations.length === 0) return `license: ${r.total} deps, 0 violations`;
  return `license: ${r.violations.length} violation${r.violations.length === 1 ? '' : 's'} across ${r.total} deps`;
}
