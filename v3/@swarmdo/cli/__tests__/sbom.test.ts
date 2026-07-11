import { describe, it, expect } from 'vitest';
import {
  componentsFromNpmLock,
  purlFor,
  integrityToHash,
  buildCycloneDX,
  buildSpdx,
  buildSbom,
  isSpdxExpression,
  cdxLicenseEntry,
} from '../src/sbom/sbom.ts';

const LOCK = {
  name: 'my-app',
  version: '1.0.0',
  lockfileVersion: 3,
  packages: {
    '': { name: 'my-app', version: '1.0.0' },
    'node_modules/left-pad': { version: '1.3.0', license: 'WTFPL', integrity: 'sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQGinBN9yTQT3bFlCBy/aVx2HrNcqQGsdot8ghrjyrvMCoEA==' },
    'node_modules/@scope/pkg': { version: '2.1.0', license: { type: 'MIT' } as any },
    'node_modules/dev-tool': { version: '0.5.0', license: 'ISC', dev: true },
    'node_modules/nolicense': { version: '9.9.9' },
  },
};

describe('purlFor', () => {
  it('builds npm purls, encoding scope', () => {
    expect(purlFor('left-pad', '1.3.0')).toBe('pkg:npm/left-pad@1.3.0');
    expect(purlFor('@scope/pkg', '2.1.0')).toBe('pkg:npm/%40scope/pkg@2.1.0');
  });
});

describe('integrityToHash', () => {
  it('converts an SRI integrity to hex with the mapped algorithm', () => {
    const h = integrityToHash('sha512-XI5MPzVNApjAyhQzphX8Bg==')!;
    expect(h.alg).toBe('SHA-512');
    expect(h.content).toMatch(/^[0-9a-f]+$/);
  });
  it('returns undefined for junk', () => {
    expect(integrityToHash('nope')).toBeUndefined();
  });
});

describe('componentsFromNpmLock', () => {
  it('extracts components sorted by name, skipping the root entry', () => {
    const comps = componentsFromNpmLock(LOCK);
    expect(comps.map((c) => c.name)).toEqual(['@scope/pkg', 'dev-tool', 'left-pad', 'nolicense']);
    const lp = comps.find((c) => c.name === 'left-pad')!;
    expect(lp.version).toBe('1.3.0');
    expect(lp.license).toBe('WTFPL');
    expect(lp.hash?.alg).toBe('SHA-512');
    expect(lp.purl).toBe('pkg:npm/left-pad@1.3.0');
  });
  it('reads the legacy {type} license form', () => {
    const c = componentsFromNpmLock(LOCK).find((x) => x.name === '@scope/pkg')!;
    expect(c.license).toBe('MIT');
  });
  it('leaves license undefined when absent', () => {
    expect(componentsFromNpmLock(LOCK).find((c) => c.name === 'nolicense')!.license).toBeUndefined();
  });
  it('productionOnly drops dev deps', () => {
    const comps = componentsFromNpmLock(LOCK, { productionOnly: true });
    expect(comps.find((c) => c.name === 'dev-tool')).toBeUndefined();
    expect(comps).toHaveLength(3);
  });
  it('skips npm workspace symlinks (link:true) — no phantom @name@0.0.0 component', () => {
    const withLink = {
      ...LOCK,
      packages: { ...LOCK.packages, 'node_modules/@my/workspace-pkg': { resolved: '@my/workspace-pkg', link: true } },
    };
    const comps = componentsFromNpmLock(withLink);
    expect(comps.find((c) => c.name === '@my/workspace-pkg')).toBeUndefined();
    expect(comps.some((c) => c.version === '0.0.0')).toBe(false);
  });
});

describe('buildCycloneDX', () => {
  const bom = buildCycloneDX(componentsFromNpmLock(LOCK), { name: 'my-app', version: '1.0.0' });
  it('emits a well-formed CycloneDX 1.5 BOM', () => {
    expect(bom.bomFormat).toBe('CycloneDX');
    expect(bom.specVersion).toBe('1.5');
    expect((bom.metadata as any).component).toEqual({ type: 'application', name: 'my-app', version: '1.0.0' });
    const comps = bom.components as any[];
    expect(comps).toHaveLength(4);
    const lp = comps.find((c) => c.name === 'left-pad');
    expect(lp).toMatchObject({ type: 'library', version: '1.3.0', purl: 'pkg:npm/left-pad@1.3.0' });
    expect(lp.hashes[0].alg).toBe('SHA-512');
    expect(lp.licenses[0].license.id).toBe('WTFPL');
  });
  it('omits licenses/hashes when absent', () => {
    const comps = bom.components as any[];
    const nl = comps.find((c) => c.name === 'nolicense');
    expect(nl.licenses).toBeUndefined();
    expect(nl.hashes).toBeUndefined();
  });
  it('emits CycloneDX scope: dev → excluded, optional → optional, runtime → omitted', () => {
    const lock = {
      name: 'app', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'app', version: '1.0.0' },
        'node_modules/prod': { version: '1.0.0' },
        'node_modules/devdep': { version: '2.0.0', dev: true },
        'node_modules/optdep': { version: '3.0.0', optional: true },
      },
    };
    const comps = buildCycloneDX(componentsFromNpmLock(lock), { name: 'app', version: '1.0.0' }).components as any[];
    expect(comps.find((c) => c.name === 'prod').scope).toBeUndefined(); // implicit required
    expect(comps.find((c) => c.name === 'devdep').scope).toBe('excluded');
    expect(comps.find((c) => c.name === 'optdep').scope).toBe('optional');
  });
  it('is deterministic (no timestamp) — stable across calls', () => {
    const a = JSON.stringify(buildCycloneDX(componentsFromNpmLock(LOCK), { name: 'my-app', version: '1.0.0' }));
    const b = JSON.stringify(buildCycloneDX(componentsFromNpmLock(LOCK), { name: 'my-app', version: '1.0.0' }));
    expect(a).toBe(b);
  });
  it('emits license.expression for SPDX expressions, license.id for single IDs', () => {
    const lock = {
      name: 'app', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'app', version: '1.0.0' },
        'node_modules/dual': { version: '1.0.0', license: '(MIT OR Apache-2.0)' },
        'node_modules/excepted': { version: '2.0.0', license: 'Apache-2.0 WITH LLVM-exception' },
        'node_modules/simple': { version: '3.0.0', license: 'MIT' },
      },
    };
    const comps = buildCycloneDX(componentsFromNpmLock(lock), { name: 'app', version: '1.0.0' }).components as any[];
    // Compound expressions → { expression }, NOT an invalid license.id
    expect(comps.find((c) => c.name === 'dual').licenses[0]).toEqual({ expression: '(MIT OR Apache-2.0)' });
    expect(comps.find((c) => c.name === 'excepted').licenses[0]).toEqual({ expression: 'Apache-2.0 WITH LLVM-exception' });
    // A single valid SPDX ID still uses license.id
    expect(comps.find((c) => c.name === 'simple').licenses[0]).toEqual({ license: { id: 'MIT' } });
  });
});

describe('isSpdxExpression / cdxLicenseEntry', () => {
  it('detects compound expressions and leaves single IDs alone', () => {
    expect(isSpdxExpression('(MIT OR Apache-2.0)')).toBe(true);
    expect(isSpdxExpression('MIT OR Apache-2.0')).toBe(true);
    expect(isSpdxExpression('GPL-2.0-only WITH Classpath-exception-2.0')).toBe(true);
    expect(isSpdxExpression('MIT AND BSD-3-Clause')).toBe(true);
    // single IDs — must NOT be treated as expressions
    for (const id of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'CC-BY-SA-4.0', 'WTFPL', 'ISC']) {
      expect(isSpdxExpression(id)).toBe(false);
    }
  });
  it('cdxLicenseEntry branches on shape', () => {
    expect(cdxLicenseEntry('MIT')).toEqual({ license: { id: 'MIT' } });
    expect(cdxLicenseEntry('(MIT OR Apache-2.0)')).toEqual({ expression: '(MIT OR Apache-2.0)' });
  });
});

describe('buildSpdx', () => {
  const doc = buildSpdx(componentsFromNpmLock(LOCK), { name: 'my-app', version: '1.0.0' });
  it('emits a minimal SPDX 2.3 doc with a root + component packages', () => {
    expect(doc.spdxVersion).toBe('SPDX-2.3');
    const pkgs = doc.packages as any[];
    expect(pkgs[0].SPDXID).toBe('SPDXRef-Package-root');
    const lp = pkgs.find((p) => p.name === 'left-pad');
    expect(lp.versionInfo).toBe('1.3.0');
    expect(lp.licenseConcluded).toBe('WTFPL');
    expect(lp.externalRefs[0].referenceLocator).toBe('pkg:npm/left-pad@1.3.0');
  });
  it('uses NOASSERTION for a missing license', () => {
    const pkgs = doc.packages as any[];
    expect(pkgs.find((p) => p.name === 'nolicense').licenseConcluded).toBe('NOASSERTION');
  });
});

describe('buildSbom dispatch', () => {
  const comps = componentsFromNpmLock(LOCK);
  it('routes cyclonedx vs spdx', () => {
    expect(buildSbom(comps, { name: 'a', version: '1' }, 'cyclonedx').bomFormat).toBe('CycloneDX');
    expect(buildSbom(comps, { name: 'a', version: '1' }, 'spdx').spdxVersion).toBe('SPDX-2.3');
  });
});

describe('buildSpdx: SPDXID uniqueness (#11)', () => {
  it('gives distinct (name, version) pairs distinct SPDXIDs even when the join collides', () => {
    const comps = [
      { name: 'foo', version: '1.0-beta', purl: 'pkg:npm/foo@1.0-beta' },
      { name: 'foo-1.0', version: 'beta', purl: 'pkg:npm/foo-1.0@beta' },
    ] as never[];
    const doc = buildSpdx(comps, { name: 'root', version: '1.0.0' }) as { packages: { SPDXID: string }[] };
    const ids = doc.packages.map((p) => p.SPDXID);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
