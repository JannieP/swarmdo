#!/usr/bin/env node
/**
 * build-standalone.mjs — stage a self-contained @swarmdo/cli for npm publish.
 *
 * The dev manifest links siblings with `file:../…` specs that neither ship in
 * the tarball nor exist on the registry, so a standalone `npm i @swarmdo/cli`
 * crashed with ERR_MODULE_NOT_FOUND (@swarmdo/cli-core). This stages a publish
 * directory that vendors those siblings *inside* the package — the same
 * file:-specs-resolve-inside-the-tarball pattern the `swarmdo` umbrella
 * already uses — without touching the working tree or monorepo dev linkage.
 *
 *   node scripts/build-standalone.mjs     # → dist-standalone/
 *   npm publish dist-standalone/
 *
 * Layout: vendor/<short>/ siblings; the cli manifest points at
 * file:vendor/<short>, and vendored manifests reference each other as
 * file:../<short>. file:-spec'd optionals that are not vendored are stripped —
 * every one of those has a graceful MODULE_NOT_FOUND fallback at runtime.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const v3Root = path.resolve(cliRoot, '..', '..');
const repoRoot = path.resolve(v3Root, '..');
const stage = path.join(cliRoot, 'dist-standalone');

/** name → { src dir, short vendor dir name } */
const VENDOR = {
  '@swarmdo/cli-core': { src: path.join(v3Root, '@swarmdo', 'cli-core'), short: 'cli-core' },
  '@swarmdo/mcp': { src: path.join(v3Root, '@swarmdo', 'mcp'), short: 'mcp' },
  '@swarmdo/neural': { src: path.join(v3Root, '@swarmdo', 'neural'), short: 'neural' },
  '@swarmdo/shared': { src: path.join(v3Root, '@swarmdo', 'shared'), short: 'shared' },
  '@swarmdo/memory': { src: path.join(v3Root, '@swarmdo', 'memory'), short: 'memory' },
  '@swarmvector/sona': { src: path.join(v3Root, '@swarmvector', 'sona'), short: 'sona' },
  '@swarmvector/rabitq-wasm': { src: path.join(v3Root, '@swarmvector', 'rabitq-wasm'), short: 'rabitq-wasm' },
};

const RUNTIME_DIRS = ['dist', 'bin', 'pkg', 'scripts'];
const RUNTIME_ROOT_EXT = new Set(['.js', '.cjs', '.mjs', '.d.ts', '.wasm', '.node', '.json']);
// pruned at the top level of a copied tree only — dist/src/** is the tsc
// output layout and must ship; node_modules is skipped at every depth
const SKIP_TOP = new Set(['src', 'test', 'tests', '__tests__', 'coverage', '.turbo']);

function copyDir(src, dest, top = false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'node_modules' || (top && SKIP_TOP.has(e.name))) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

/** Copy a package's runtime surface: manifest, runtime dirs, root runtime files. */
function vendorPackage(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const dir of RUNTIME_DIRS) {
    const s = path.join(srcDir, dir);
    if (fs.existsSync(s) && fs.statSync(s).isDirectory()) copyDir(s, path.join(destDir, dir));
  }
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const ext = e.name.endsWith('.d.ts') ? '.d.ts' : path.extname(e.name);
    if (RUNTIME_ROOT_EXT.has(ext) || e.name === 'README.md' || e.name === 'LICENSE') {
      fs.copyFileSync(path.join(srcDir, e.name), path.join(destDir, e.name));
    }
  }
}

/** Rewrite file: specs in a staged manifest: vendored names → relative vendor
 * paths; un-vendored file: optionals are dropped (they degrade at runtime). */
function transformManifest(manifestPath, relPrefix) {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const field of ['dependencies', 'optionalDependencies']) {
    const deps = m[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!String(spec).startsWith('file:')) continue;
      if (VENDOR[name]) deps[name] = `file:${relPrefix}${VENDOR[name].short}`;
      else if (field === 'optionalDependencies') delete deps[name];
      else throw new Error(`hard file: dep not in vendor set: ${name} (${manifestPath})`);
    }
    if (Object.keys(deps).length === 0) delete m[field];
  }
  return m;
}

// --- stage the cli itself -------------------------------------------------
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const dir of ['dist', 'bin', 'scripts', '.claude']) {
  const s = path.join(cliRoot, dir);
  if (!fs.existsSync(s)) throw new Error(`missing ${dir}/ — run \`npm run build\` first`);
  copyDir(s, path.join(stage, dir));
}
// don't ship the stager inside the staged package
fs.rmSync(path.join(stage, 'scripts', 'build-standalone.mjs'), { force: true });

// bundled plugin + README, mirroring the old prepublishOnly behavior
const metaharness = path.join(repoRoot, 'plugins', 'swarmdo-metaharness');
if (fs.existsSync(metaharness)) copyDir(metaharness, path.join(stage, 'plugins', 'swarmdo-metaharness'));
fs.copyFileSync(path.join(repoRoot, 'README.md'), path.join(stage, 'README.md'));
const license = path.join(repoRoot, 'LICENSE');
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(stage, 'LICENSE'));

// --- vendor the siblings ---------------------------------------------------
for (const { src, short } of Object.values(VENDOR)) {
  if (!fs.existsSync(src)) throw new Error(`vendor source missing: ${src}`);
  const dest = path.join(stage, 'vendor', short);
  vendorPackage(src, dest);
  const staged = transformManifest(path.join(src, 'package.json'), '../');
  delete staged.scripts; // no lifecycle scripts from vendored copies
  delete staged.devDependencies;
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(staged, null, 2) + '\n');
}

// --- transform the cli manifest ---------------------------------------------
const cliManifest = transformManifest(path.join(cliRoot, 'package.json'), 'vendor/');
delete cliManifest.devDependencies;
// only postinstall survives staging — dev/test/publish-guard scripts reference
// paths that don't ship (src/, this stager, ../../../README.md)
cliManifest.scripts = cliManifest.scripts?.postinstall
  ? { postinstall: cliManifest.scripts.postinstall }
  : undefined;
if (!cliManifest.scripts) delete cliManifest.scripts;
cliManifest.files = ['dist', 'bin', 'scripts', '.claude', 'plugins', 'vendor', 'README.md', 'LICENSE'];
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(cliManifest, null, 2) + '\n');

// --- report ------------------------------------------------------------------
const count = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? count(path.join(dir, e.name)) : 1;
  }
  return n;
};
console.log(`staged @swarmdo/cli@${cliManifest.version} → ${path.relative(cliRoot, stage)}/`);
console.log(`  files: ${count(stage)} · vendored: ${Object.keys(VENDOR).length} packages`);
console.log(`  publish with: npm publish ${path.relative(cliRoot, stage)}/`);
