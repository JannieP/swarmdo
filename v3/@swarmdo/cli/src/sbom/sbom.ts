/**
 * sbom.ts — generate a Software Bill of Materials from an npm lockfile.
 *
 * Completes the supply-chain trio with `env` (config drift) and `license`
 * (license policy): `sbom` emits the standardized dependency manifest —
 * CycloneDX or SPDX JSON — that compliance, vuln scanners, and regulators
 * (US EO 14028, EU CRA) consume. Distinct from `pack` (repo→AI-context prose)
 * and `license` (policy gate): this is a machine artifact, not a check.
 *
 * Pure + deterministic (lockfile object → BOM object, no timestamps/IO), so
 * output is golden-testable. The file read lives in ../commands/sbom.ts.
 */

export interface Component {
  name: string;
  version: string;
  purl: string;
  license?: string;
  /** hex-encoded integrity, with its algorithm */
  hash?: { alg: string; content: string };
  dev?: boolean;
  optional?: boolean;
}

interface NpmLockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  license?: unknown;
  dev?: boolean;
  optional?: boolean;
}
interface NpmLock {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, NpmLockEntry>;
}

/** Derive the package name from a lockfile `packages` key (last node_modules segment, scope-aware). */
function nameFromKey(key: string): string {
  const idx = key.lastIndexOf('node_modules/');
  const tail = idx >= 0 ? key.slice(idx + 'node_modules/'.length) : key;
  return tail; // already includes @scope/name because we split on the LAST node_modules/
}

/** Package URL for an npm component. Scope `@` is percent-encoded per the purl spec. */
export function purlFor(name: string, version: string): string {
  const enc = name.startsWith('@') ? '%40' + name.slice(1) : name;
  return `pkg:npm/${enc}@${version}`;
}

/** Convert an SRI integrity string (`sha512-<base64>`) to `{alg, content(hex)}`. Deterministic. */
export function integrityToHash(integrity: string): { alg: string; content: string } | undefined {
  const m = integrity.match(/^(sha\d+)-(.+)$/);
  if (!m) return undefined;
  const algMap: Record<string, string> = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
  const alg = algMap[m[1]];
  if (!alg) return undefined;
  let hex: string;
  try {
    // base64 → hex, dependency-free and deterministic
    hex = Buffer.from(m[2], 'base64').toString('hex');
  } catch {
    return undefined;
  }
  return { alg, content: hex };
}

function licenseOf(entry: NpmLockEntry): string | undefined {
  const l = entry.license;
  if (typeof l === 'string' && l.trim()) return l.trim();
  if (l && typeof l === 'object' && typeof (l as { type?: unknown }).type === 'string') return (l as { type: string }).type;
  return undefined;
}

export interface ComponentOptions {
  /** exclude dev-only dependencies */
  productionOnly?: boolean;
}

/** Extract components from a parsed npm lockfile (v2/v3 `packages` map). Pure. */
export function componentsFromNpmLock(lock: NpmLock, opts: ComponentOptions = {}): Component[] {
  const packages = lock.packages ?? {};
  const out: Component[] = [];
  const seen = new Set<string>();
  for (const [key, entry] of Object.entries(packages)) {
    if (!key) continue; // the root project entry
    if (!key.includes('node_modules/')) continue;
    if (opts.productionOnly && entry.dev) continue;
    const name = nameFromKey(key);
    const version = entry.version ?? '0.0.0';
    const id = `${name}@${version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const comp: Component = { name, version, purl: purlFor(name, version) };
    const license = licenseOf(entry);
    if (license) comp.license = license;
    if (entry.integrity) {
      const h = integrityToHash(entry.integrity);
      if (h) comp.hash = h;
    }
    if (entry.dev) comp.dev = true;
    if (entry.optional) comp.optional = true;
    out.push(comp);
  }
  out.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
  return out;
}

export interface BomMeta {
  name: string;
  version: string;
}

/**
 * Is this npm `license` string an SPDX *expression* (compound), rather than a
 * single license identifier? npm permits expressions like `(MIT OR Apache-2.0)`
 * or `Apache-2.0 WITH LLVM-exception` for dual/multi-licensed packages. SPDX
 * operators are uppercase and space-delimited, so a single ID (`MIT`,
 * `BSD-3-Clause`, `CC-BY-SA-4.0`) never matches. Pure.
 */
export function isSpdxExpression(license: string): boolean {
  return / (OR|AND|WITH) /.test(license) || license.includes('(');
}

/**
 * A CycloneDX `licenses[]` entry for a license string. CycloneDX requires
 * `license.id` to be a single valid SPDX identifier, so an expression must use
 * the sibling `expression` field instead — otherwise strict validators and
 * scanners (Dependency-Track, Grype) reject or mis-parse the component. Pure.
 */
export function cdxLicenseEntry(license: string): Record<string, unknown> {
  return isSpdxExpression(license) ? { expression: license } : { license: { id: license } };
}

/** Build a CycloneDX 1.5 BOM object (no timestamp → deterministic). Pure. */
export function buildCycloneDX(components: Component[], meta: BomMeta): Record<string, unknown> {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: { type: 'application', name: meta.name, version: meta.version },
    },
    components: components.map((c) => {
      const comp: Record<string, unknown> = { type: 'library', name: c.name, version: c.version, purl: c.purl };
      // CycloneDX 1.5 `scope`: dev-only deps are `excluded` (not shipped),
      // optional deps are `optional`; a required runtime dep omits it (implicit
      // `required`), keeping the common case clean. dev wins over optional.
      const scope = c.dev ? 'excluded' : c.optional ? 'optional' : undefined;
      if (scope) comp.scope = scope;
      if (c.hash) comp.hashes = [{ alg: c.hash.alg, content: c.hash.content }];
      if (c.license) comp.licenses = [cdxLicenseEntry(c.license)];
      return comp;
    }),
  };
}

/** Build a minimal SPDX 2.3 JSON document (no created timestamp → deterministic). Pure. */
export function buildSpdx(components: Component[], meta: BomMeta): Record<string, unknown> {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9.-]/g, '-');
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: meta.name,
    documentNamespace: `https://swarmdo/spdx/${safe(meta.name)}-${meta.version}`,
    packages: [
      { SPDXID: 'SPDXRef-Package-root', name: meta.name, versionInfo: meta.version, downloadLocation: 'NOASSERTION' },
      ...components.map((c, i) => ({
        // Index prefix makes the ID self-delimiting (#11): name and version can
        // both contain `-` after sanitizing, so `${name}-${version}` alone can
        // collide across distinct (name, version) pairs.
        SPDXID: `SPDXRef-Package-${i}-${safe(c.name)}-${safe(c.version)}`,
        name: c.name,
        versionInfo: c.version,
        downloadLocation: 'NOASSERTION',
        licenseConcluded: c.license ?? 'NOASSERTION',
        externalRefs: [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: c.purl }],
      })),
    ],
  };
}

export type SbomFormat = 'cyclonedx' | 'spdx';

/** Build a BOM in the requested format. Pure. */
export function buildSbom(components: Component[], meta: BomMeta, format: SbomFormat): Record<string, unknown> {
  return format === 'spdx' ? buildSpdx(components, meta) : buildCycloneDX(components, meta);
}
