/**
 * `swarmdo pack` — bundle a repo (or subset) into one AI-friendly context blob.
 *
 *   swarmdo pack                         # markdown bundle of the repo → stdout
 *   swarmdo pack src --format xml -o ctx.xml
 *   swarmdo pack --include '*.ts' --exclude '*.test.ts'
 *   swarmdo pack --tokens                # just per-file + total token counts
 *   swarmdo pack --redact                # mask secrets in each file first
 *
 * The fs walk lives here (default skips + .gitignore + glob include/exclude +
 * binary/size guards); the pure engine (../pack/pack.ts) does formatting +
 * token accounting. --redact composes the ../redact engine so secrets never
 * land in the bundle.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { packFiles, makeIgnoreMatcher, type PackFile, type PackFormat, type PackOptions } from '../pack/pack.js';
import { redactText } from '../redact/redact.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.swarm', 'dist', 'dist-standalone', 'build',
  'coverage', '.next', '.turbo', 'out', 'vendor', '.cache',
]);
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'tar', 'tgz',
  'woff', 'woff2', 'ttf', 'eot', 'mp4', 'mov', 'mp3', 'wav', 'wasm', 'so', 'dylib',
  'dll', 'exe', 'bin', 'node', 'lock', 'jpeg',
]);

/** Looks binary if it has a NUL in the first 8 KiB. */
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

interface WalkOpts {
  root: string;
  include?: (p: string) => boolean;
  exclude?: (p: string) => boolean;
  gitignore?: (p: string) => boolean;
  maxBytes: number;
}

function walk(o: WalkOpts): PackFile[] {
  const files: PackFile[] = [];
  const stack = [o.root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(o.root, full).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (o.gitignore?.(rel + '/')) continue;
        stack.push(full);
      } else if (e.isFile()) {
        if (o.gitignore?.(rel)) continue;
        if (o.exclude?.(rel)) continue;
        if (o.include && !o.include(rel)) continue;
        if (BINARY_EXT.has(e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase())) continue;
        let stat: fs.Stats;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.size > o.maxBytes) continue;
        let buf: Buffer;
        try { buf = fs.readFileSync(full); } catch { continue; }
        if (looksBinary(buf)) continue;
        files.push({ path: rel, content: buf.toString('utf8') });
      }
    }
  }
  return files;
}

function csv(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const repoRoot = ctx.cwd || process.cwd();
  const scanRoot = ctx.args[0] ? path.resolve(repoRoot, ctx.args[0]) : repoRoot;

  // NB: use --style, not --format — `format` is a global flag (text/json/table,
  // default 'text') that would shadow ours (#1425 removed its short alias).
  const format = (typeof ctx.flags.style === 'string' ? ctx.flags.style : 'md') as PackFormat;
  if (!['md', 'xml', 'json', 'plain'].includes(format)) {
    output.printError(`unknown --style '${format}' (use md|xml|json|plain)`);
    return { success: false, exitCode: 1 };
  }
  const maxKb = typeof ctx.flags['max-file-size'] === 'string' ? parseInt(ctx.flags['max-file-size'] as string, 10) : 512;
  const maxBytes = (Number.isFinite(maxKb) ? maxKb : 512) * 1024;

  const includePats = csv(ctx.flags.include);
  const excludePats = csv(ctx.flags.exclude);

  let gitignore: ((p: string) => boolean) | undefined;
  if (ctx.flags['no-gitignore'] !== true) {
    try {
      const gi = fs.readFileSync(path.join(scanRoot, '.gitignore'), 'utf8').split('\n');
      gitignore = makeIgnoreMatcher(gi);
    } catch { /* no .gitignore */ }
  }

  const files = walk({
    root: scanRoot,
    include: includePats ? makeIgnoreMatcher(includePats) : undefined,
    exclude: excludePats ? makeIgnoreMatcher(excludePats) : undefined,
    gitignore,
    maxBytes,
  });

  if (files.length === 0) {
    output.printError('no files matched — check the path, --include/--exclude, or .gitignore');
    return { success: false, exitCode: 1 };
  }

  const opts: PackOptions = { format, tree: ctx.flags['no-tree'] !== true };
  if (ctx.flags.redact === true) {
    opts.transform = (content) => redactText(content).output;
  }
  const { output: bundle, stats } = packFiles(files, opts);

  // --tokens: report accounting only, no bundle.
  if (ctx.flags.tokens === true) {
    if (ctx.flags.json === true) {
      output.printJson(stats);
    } else {
      for (const f of [...stats.perFile].sort((a, b) => b.tokens - a.tokens)) {
        output.writeln(`${String(f.tokens).padStart(8)}  ${f.path}`);
      }
      output.writeln(output.bold(`${String(stats.tokens).padStart(8)}  TOTAL (${stats.files} files, ${(stats.bytes / 1024).toFixed(1)} KiB)`));
    }
    return { success: true, exitCode: 0 };
  }

  const outFile = (typeof ctx.flags.output === 'string' && ctx.flags.output) || (typeof ctx.flags.o === 'string' && ctx.flags.o);
  if (outFile) {
    fs.writeFileSync(path.resolve(repoRoot, outFile), bundle);
    output.printSuccess(`packed ${stats.files} files (~${stats.tokens} tokens) → ${outFile}`);
  } else {
    process.stdout.write(bundle);
    if (!process.stdout.isTTY) { /* piped: keep stdout clean */ }
    process.stderr.write(output.dim(`packed ${stats.files} files (~${stats.tokens} tokens)\n`));
  }
  return { success: true, exitCode: 0 };
}

export const packCommand: Command = {
  name: 'pack',
  description: 'Bundle a repo (or subset) into one AI-friendly context blob (md/xml/json/plain) with a tree + token counts — deterministic',
  options: [
    { name: 'style', description: 'output format: md (default), xml, json, plain', type: 'string' },
    { name: 'include', description: 'comma-separated globs; keep only matching files (e.g. "*.ts,*.md")', type: 'string' },
    { name: 'exclude', description: 'comma-separated globs to skip (e.g. "*.test.ts")', type: 'string' },
    { name: 'output', short: 'o', description: 'write the bundle to a file instead of stdout', type: 'string' },
    { name: 'no-tree', description: 'omit the directory tree header', type: 'boolean' },
    { name: 'no-gitignore', description: "don't apply the repo's .gitignore", type: 'boolean' },
    { name: 'max-file-size', description: 'skip files larger than N KiB (default 512)', type: 'string' },
    { name: 'redact', description: 'mask secrets in each file before bundling (uses `swarmdo redact`)', type: 'boolean' },
    { name: 'tokens', description: 'print per-file + total token estimates only, no bundle', type: 'boolean' },
    { name: 'json', description: 'with --tokens, emit the stats as JSON', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo pack src -o context.md', description: 'Bundle src/ to a markdown file' },
    { command: "swarmdo pack --include '*.ts' --exclude '*.test.ts'", description: 'Only non-test TypeScript' },
    { command: 'swarmdo pack --tokens', description: 'Token budget breakdown, largest first' },
    { command: 'swarmdo pack --redact --style xml', description: 'Secret-safe XML bundle' },
  ],
  action: run,
};

export default packCommand;
