/**
 * `swarmdo compact` — compress noisy command output before it reaches an LLM.
 *
 * Two modes:
 *   npm test 2>&1 | swarmdo compact        # stdin filter
 *   swarmdo compact -- npm test            # wrap a command (stdout+stderr)
 *
 * Compacted text goes to stdout (pipeable); a one-line savings summary goes to
 * stderr unless --quiet. When wrapping a command, the command's exit code is
 * propagated verbatim — `swarmdo compact -- npm test` still fails if the tests
 * fail. Deterministic, zero tokens (see ../compact/compact.ts).
 */

import { spawnSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { compactOutput, formatSavings, type CompactOptions } from '../compact/compact.js';

/**
 * Read all of stdin as UTF-8. A stream read (not readFileSync(0)) — the
 * synchronous form throws EAGAIN on a non-blocking pipe on macOS/Linux.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(Buffer.from(c)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function optsFromFlags(ctx: CommandContext): CompactOptions {
  const opts: CompactOptions = {
    stripAnsi: ctx.flags['no-ansi'] !== true,
    foldNodeModules: ctx.flags['no-fold'] !== true,
    collapseBlanks: true,
  };
  if (typeof ctx.flags['min-run'] === 'number') opts.minRun = ctx.flags['min-run'] as number;
  else if (typeof ctx.flags['min-run'] === 'string') opts.minRun = parseInt(ctx.flags['min-run'] as string, 10) || 3;
  const win = ctx.flags.window;
  if (typeof win === 'string' && /^\d+:\d+$/.test(win)) {
    const [head, tail] = win.split(':').map((n) => parseInt(n, 10));
    opts.window = { head, tail };
  }
  return opts;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const opts = optsFromFlags(ctx);
  const quiet = ctx.flags.quiet === true;

  // Command-wrap mode: everything after `--` is the command to run.
  if (ctx.args.length > 0) {
    const [cmd, ...cmdArgs] = ctx.args;
    const r = spawnSync(cmd, cmdArgs, {
      cwd: ctx.cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      // Merge streams so interleaved stdout/stderr stay in order.
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    if (r.error) {
      output.printError(`failed to run ${cmd}: ${r.error.message}`);
      return { success: false, exitCode: 127 };
    }
    const combined = (r.stdout || '') + (r.stderr || '');
    const { text, stats } = compactOutput(combined, opts);
    process.stdout.write(text);
    if (!quiet) process.stderr.write(formatSavings(stats) + '\n');
    // Propagate the wrapped command's exit code verbatim.
    const code = r.status ?? (r.signal ? 1 : 0);
    return { success: code === 0, exitCode: code };
  }

  // Stdin-filter mode.
  if (process.stdin.isTTY) {
    output.writeln(output.error('Usage: swarmdo compact -- <command>   OR   <command> | swarmdo compact'));
    return { success: false, exitCode: 1 };
  }
  const input = await readStdin();
  const { text, stats } = compactOutput(input, opts);
  if (ctx.flags['stats-json'] === true) {
    process.stderr.write(JSON.stringify(stats) + '\n');
  } else if (!quiet) {
    process.stderr.write(formatSavings(stats) + '\n');
  }
  process.stdout.write(text);
  return { success: true, exitCode: 0 };
}

export const compactCommand: Command = {
  name: 'compact',
  description: 'Compress noisy command output (tests/builds/logs) before it reaches an LLM — deterministic, zero tokens',
  options: [
    { name: 'no-ansi', description: 'keep ANSI colour/escape codes (default: strip)', type: 'boolean' },
    { name: 'no-fold', description: 'keep full node_modules stack frames (default: fold)', type: 'boolean' },
    { name: 'min-run', description: 'collapse a run of ≥N identical lines (default 3; 0 disables)', type: 'string' },
    { name: 'window', description: 'keep first H + last T lines of long output, e.g. --window 40:20', type: 'string' },
    { name: 'stats-json', description: 'emit compaction stats as JSON on stderr (stdin mode)', type: 'boolean' },
    { name: 'quiet', description: 'suppress the savings summary on stderr', type: 'boolean' },
  ],
  examples: [
    { command: 'npm test 2>&1 | swarmdo compact', description: 'Filter noisy test output on stdin' },
    { command: 'swarmdo compact -- npm run build', description: 'Wrap a command; exit code propagates' },
    { command: 'swarmdo compact --window 40:20 -- pnpm install', description: 'Head+tail window a long install log' },
  ],
  action: run,
};

export default compactCommand;
