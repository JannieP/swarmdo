/**
 * `swarmdo apply` — apply a unified diff to the working tree with fuzzy context
 * matching. The forgiving counterpart to `git apply`: when an agent's diff has
 * drifted line numbers or a slightly-off context line, this still lands the
 * hunks it can and reports exactly which it couldn't, instead of rejecting the
 * whole patch.
 *
 *   swarmdo apply changes.patch          # apply a patch file
 *   agent-output | swarmdo apply         # apply a patch from stdin
 *   swarmdo apply --dry-run changes.patch # preview: what would apply/reject
 *   swarmdo apply --fuzz 3 changes.patch  # tolerate more context drift
 *
 * Engine (../apply/apply.ts) is pure + tested; this reads/writes files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { parsePatch, applyPatch, type FilePatch } from '../apply/apply.js';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(Buffer.from(c)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** Resolve the file a patch targets, preferring the new path, then the old. */
function targetFile(root: string, fp: FilePatch): string {
  return path.resolve(root, fp.newPath && fp.newPath !== '/dev/null' ? fp.newPath : fp.oldPath);
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const dryRun = ctx.flags['dry-run'] === true;
  const partial = ctx.flags.partial === true;
  const strict = ctx.flags.strict === true;
  // The parser may deliver --fuzz as a number or a string; accept both.
  const fuzz = typeof ctx.flags.fuzz === 'number' ? ctx.flags.fuzz
    : typeof ctx.flags.fuzz === 'string' ? parseInt(ctx.flags.fuzz, 10)
    : 2;

  // Read the patch: a file arg, or stdin.
  let patchText: string;
  if (ctx.args[0]) {
    try { patchText = fs.readFileSync(path.resolve(root, ctx.args[0]), 'utf8'); }
    catch { output.printError(`could not read patch file ${ctx.args[0]}`); return { success: false, exitCode: 1 }; }
  } else {
    if (process.stdin.isTTY) {
      output.writeln(output.error('Usage: swarmdo apply <patch-file>   OR   <patch> | swarmdo apply'));
      return { success: false, exitCode: 1 };
    }
    patchText = await readStdin();
  }

  const patches = parsePatch(patchText);
  if (patches.length === 0) {
    output.printError('no file patches found — is this a unified diff?');
    return { success: false, exitCode: 1 };
  }

  let totalApplied = 0;
  let totalRejected = 0;
  let totalAmbiguous = 0;
  const writes: Array<{ file: string; content: string }> = [];

  for (const fp of patches) {
    const file = targetFile(root, fp);
    const rel = path.relative(root, file);
    let source: string;
    try { source = fs.readFileSync(file, 'utf8'); }
    catch {
      // New-file patch (--- /dev/null): treat missing source as empty.
      if (fp.oldPath === '/dev/null' || !fs.existsSync(file)) source = '';
      else { output.printError(`cannot read ${rel}`); totalRejected += fp.hunks.length; continue; }
    }

    const res = applyPatch(source, fp, { fuzz });
    const applied = res.hunks.filter((h) => h.applied).length;
    const rejected = res.hunks.length - applied;
    totalApplied += applied;
    totalRejected += rejected;

    const fuzzy = res.hunks.filter((h) => h.applied && (h.fuzzUsed ?? 0) > 0).length;
    const ambiguous = res.hunks.filter((h) => h.applied && h.ambiguous).length;
    totalAmbiguous += ambiguous;
    const tag = rejected === 0 ? output.dim('ok') : output.bold(`${rejected} rejected`);
    const ambTag = ambiguous ? output.error(` ⚠ ${ambiguous} ambiguous`) : '';
    output.writeln(`${rel}  ${applied}/${res.hunks.length} hunks${fuzzy ? output.dim(` (${fuzzy} fuzzy)`) : ''}  ${tag}${ambTag}`);
    if (ambiguous) {
      for (const h of res.hunks.filter((x) => x.applied && x.ambiguous)) {
        output.writeln(output.dim(`    ⚠ hunk @ line ${(h.at ?? 0) + 1}: matched a block that also appears elsewhere — verify it landed on the intended one`));
      }
    }

    if (rejected === 0 || partial) {
      if (res.result !== source) writes.push({ file, content: res.result });
    }
  }

  if (!dryRun) {
    for (const w of writes) fs.writeFileSync(w.file, w.content);
  }

  const verb = dryRun ? 'would apply' : 'applied';
  const ambSummary = totalAmbiguous ? `, ${totalAmbiguous} ambiguous` : '';
  output.writeln(output.dim(`${verb} ${totalApplied} hunks, ${totalRejected} rejected${ambSummary}${dryRun ? ' (dry run)' : ''}`));

  // Exit 1 if anything was rejected — a CI/agent can branch on it. With --strict,
  // an ambiguous match (possibly landed on the wrong duplicate) also fails.
  const code = totalRejected > 0 || (strict && totalAmbiguous > 0) ? 1 : 0;
  return { success: code === 0, exitCode: code };
}

export const applyCommand: Command = {
  name: 'apply',
  description: 'Apply a unified diff to the working tree with fuzzy context matching — a forgiving `git apply` for agent-produced patches',
  options: [
    { name: 'dry-run', description: 'report what would apply/reject without writing', type: 'boolean' },
    { name: 'fuzz', description: 'max context lines to drop when matching a drifted hunk (default 2)', type: 'string' },
    { name: 'partial', description: 'write files even when some of their hunks are rejected', type: 'boolean' },
    { name: 'strict', description: 'exit 1 if any hunk matched an ambiguous (duplicated) block, even if it applied', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo apply changes.patch', description: 'Apply a patch file' },
    { command: 'cat out.diff | swarmdo apply --dry-run', description: 'Preview a patch from stdin' },
    { command: 'swarmdo apply --fuzz 3 changes.patch', description: 'Tolerate more context drift' },
  ],
  action: run,
};

export default applyCommand;
