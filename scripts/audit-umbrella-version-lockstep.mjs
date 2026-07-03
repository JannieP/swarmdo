#!/usr/bin/env node
/**
 * Static guard for upstream/swarmdo#2151 — enforce three-way version lockstep
 * across the umbrella packages that ship together:
 *
 *   - @swarmdo/cli  (v3/@swarmdo/cli/package.json)
 *   - swarmdo       (root package.json — umbrella)
 *   - swarmdo             (swarmdo/package.json — thin user-facing wrapper)
 *
 * Why: when these drift (e.g. swarmdo@3.10.2 but cli@3.10.1, observed in
 * #2151), `npx swarmdo --version` prints the bundled CLI's version (3.10.1),
 * not the wrapper's package.json version (3.10.2). Users see the "wrong"
 * version and reasonably assume the install is broken.
 *
 * The Publishing Rules in CLAUDE.md require all three to ship at the same
 * version. This audit enforces that locally so a drift can't reach a
 * release. Wired into v3-ci.yml as `umbrella-version-lockstep-audit`.
 *
 * Also asserts swarmdo's @swarmdo/cli dep range INCLUDES the cli's
 * actual version (overlap with audit-wrapper-dep-ranges.mjs is intentional;
 * this audit is about identity, that one is about inclusion).
 *
 * Exit codes:
 *   0 — versions identical and dep range covers cli
 *   1 — drift detected; remediation hints printed
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import semver from 'semver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const TARGETS = [
  { label: '@swarmdo/cli', path: 'v3/@swarmdo/cli/package.json' },
  { label: 'swarmdo',       path: 'package.json' },
  { label: 'swarmdo',             path: 'swarmdo/package.json' },
];

function readPkg(rel) {
  const p = join(REPO_ROOT, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return null; }
}

const versions = {};
const violations = [];

for (const { label, path } of TARGETS) {
  const pkg = readPkg(path);
  if (!pkg) {
    violations.push(`${label} (${path}) not found`);
    continue;
  }
  versions[label] = pkg.version;
}

console.log('umbrella-version-lockstep audit — three-package identity check');
for (const { label } of TARGETS) {
  console.log(`  ${label.padEnd(20)} ${versions[label] ?? '(missing)'}`);
}

const unique = new Set(Object.values(versions));
if (unique.size > 1) {
  violations.push(
    `version drift across umbrella packages: ${[...unique].join(' / ')}.\n` +
    `    Bump all three to the same version per CLAUDE.md "Publishing Rules" before shipping:\n` +
    `      v3/@swarmdo/cli/package.json   ← ${versions['@swarmdo/cli'] ?? '?'}\n` +
    `      package.json (swarmdo)         ← ${versions['swarmdo'] ?? '?'}\n` +
    `      swarmdo/package.json                 ← ${versions['swarmdo'] ?? '?'}`
  );
}

// Cross-check: swarmdo's dep range must include cli's actual version.
const swarmdoPkg = readPkg('swarmdo/package.json');
const cliVersion = versions['@swarmdo/cli'];
if (swarmdoPkg && cliVersion) {
  const range = swarmdoPkg.dependencies?.['@swarmdo/cli'];
  if (range) {
    if (!semver.satisfies(cliVersion, range, { includePrerelease: true })) {
      violations.push(
        `swarmdo "@swarmdo/cli": "${range}" does NOT include cli's actual version ${cliVersion}.\n` +
        `    Update swarmdo/package.json dependencies to "^${cliVersion}".`
      );
    } else {
      console.log(`  swarmdo dep "@swarmdo/cli": "${range}" covers ${cliVersion} ✓`);
    }
  }
}

if (violations.length === 0) {
  console.log('\n  ok: all three umbrella packages at identical version, swarmdo dep covers cli');
  process.exit(0);
}

console.error('\nviolations:');
for (const v of violations) console.error(`  ✗ ${v}`);
console.error(`\n${violations.length} violation(s).`);
console.error('Reference: upstream/swarmdo#2151 (version mismatch — swarmdo@3.10.2 + cli@3.10.1).');
process.exit(1);
