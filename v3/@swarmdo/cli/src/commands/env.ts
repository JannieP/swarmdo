/**
 * `swarmdo env` — reconcile the env vars the code references against what
 * `.env` declares (and, if present, `.env.example`). Catches deploy-breaking
 * drift before it ships:
 *
 *   swarmdo env                     # scan cwd vs .env / .env.example
 *   swarmdo env src --ci            # exit 1 if any referenced var is undeclared
 *   swarmdo env --json              # machine-readable report
 *
 * Engine (../env/env.ts) is pure + tested; this layer does the fs walk and
 * reads the dotenv files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { extractEnvRefs, parseDotenv, reconcile, formatEnvSummary, type EnvRef } from '../env/env.js';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.py', '.vue', '.svelte', '.astro']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.swarm', 'dist', 'dist-standalone', 'build',
  'coverage', '.next', '.turbo', 'out', 'vendor', '.cache',
]);
// Ubiquitous runtime/CI vars that are almost never declared in a project .env.
const DEFAULT_IGNORE = ['NODE_ENV', 'CI', 'PATH', 'HOME', 'PWD', 'USER', 'SHELL', 'TERM', 'TZ', 'LANG'];

function walk(root: string): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (SOURCE_EXT.has(ext) && !e.name.endsWith('.d.ts')) found.push(full);
      }
    }
  }
  return found;
}

function readKeys(file: string): string[] | null {
  try { return parseDotenv(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const repoRoot = ctx.cwd || process.cwd();
  const scanRoot = ctx.args[0] ? path.resolve(repoRoot, ctx.args[0]) : repoRoot;

  const envFile = path.resolve(repoRoot, typeof ctx.flags.env === 'string' ? ctx.flags.env : '.env');
  const exampleFlag = typeof ctx.flags.example === 'string' ? ctx.flags.example : '.env.example';
  const exampleFile = path.resolve(repoRoot, exampleFlag);

  const declared = readKeys(envFile);
  if (declared === null) {
    output.printError(`no env file at ${path.relative(repoRoot, envFile)} (use --env <file>)`);
    return { success: false, exitCode: 1 };
  }
  const example = readKeys(exampleFile) ?? undefined;

  const ignore = [...DEFAULT_IGNORE];
  if (typeof ctx.flags.ignore === 'string') ignore.push(...ctx.flags.ignore.split(',').map((s) => s.trim()).filter(Boolean));

  const refs: EnvRef[] = [];
  for (const abs of walk(scanRoot)) {
    let src: string;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    refs.push(...extractEnvRefs(src, rel));
  }

  const report = reconcile({ refs, declared, example, ignore });
  const hasExample = example !== undefined;

  if (ctx.flags.json === true) {
    output.printJson({ ...report, envFile: path.relative(repoRoot, envFile), hasExample });
  } else {
    const section = (title: string, keys: string[], withSites = false) => {
      if (keys.length === 0) return;
      output.writeln(output.bold(`${title} (${keys.length})`));
      output.printList(keys.map((k) => {
        if (!withSites) return k;
        const site = report.refs[k]?.[0];
        return site ? `${k}  ${output.dim(`${site.file}:${site.line}`)}` : k;
      }));
    };
    section('Missing — referenced in code, not in .env', report.missing, true);
    section('Unused — declared in .env, never referenced', report.unused);
    if (hasExample) section('Undocumented — in .env, not in .env.example', report.undocumented);
    output.writeln(output.dim(formatEnvSummary(report, hasExample)));
  }

  // --ci gates on `missing` (the runtime-breaking bucket); --strict also gates
  // on unused + undocumented.
  const strict = ctx.flags.strict === true;
  const bad = report.missing.length + (strict ? report.unused.length + report.undocumented.length : 0);
  const gate = ctx.flags.ci === true || strict;
  const code = gate && bad > 0 ? 1 : 0;
  return { success: code === 0, exitCode: code };
}

export const envCommand: Command = {
  name: 'env',
  description: 'Reconcile env vars referenced in code against .env / .env.example — find missing, unused, and undocumented vars',
  options: [
    { name: 'env', description: 'path to the env file (default .env)', type: 'string' },
    { name: 'example', description: 'path to the example env file (default .env.example)', type: 'string' },
    { name: 'ignore', description: 'comma-separated extra keys to ignore (NODE_ENV/CI/… already ignored)', type: 'string' },
    { name: 'ci', description: 'exit 1 if any referenced var is undeclared (missing bucket)', type: 'boolean' },
    { name: 'strict', description: 'exit 1 on missing OR unused OR undocumented', type: 'boolean' },
    { name: 'json', description: 'machine-readable report', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo env', description: 'Reconcile the repo against .env / .env.example' },
    { command: 'swarmdo env src --ci', description: 'Fail CI if code references an undeclared var' },
    { command: 'swarmdo env --env .env.production --json', description: 'Check a specific env file, JSON out' },
  ],
  action: run,
};

export default envCommand;
