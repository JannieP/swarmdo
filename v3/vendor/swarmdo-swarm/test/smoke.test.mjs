import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));

// swarmdo-swarm — renamed fork of swarmdo-swarm@1.0.20 (github.com/ruvnet/ruv-FANN),
// the optional MCP swarm server (`npx swarmdo-swarm mcp start`; tools surface as
// mcp__swarmdo-swarm__*). Upstream quirks preserved verbatim: the main module
// starts persistent handles at import, and the bin initializes its
// persistence layer and keeps running even after `--version` prints — so
// both checks assert output and then kill, never process exit.
test('main module loads (subprocess, killed after check)', () => {
  const out = execFileSync('node', ['-e',
    `const m=require(${JSON.stringify(join(pkgDir, 'src/index.js'))});` +
    `console.log(typeof m==='object'&&m!==null?'OK':'BAD');process.exit(0);`
  ], { encoding: 'utf8', timeout: 30000 });
  assert.match(out, /OK/);
});

test('bin prints a semver version (then killed — upstream never exits)', async () => {
  const child = spawn('node', [join(pkgDir, 'bin/swarmdo-swarm-secure.js'), '--version']);
  let out = '';
  const got = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no version within 20s; got: ${out.slice(0, 200)}`)), 20000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (/\d+\.\d+\.\d+/.test(out)) { clearTimeout(timer); resolve(out); }
    });
  });
  try {
    assert.match(await got, /\d+\.\d+\.\d+/);
  } finally {
    child.kill('SIGKILL');
  }
});
