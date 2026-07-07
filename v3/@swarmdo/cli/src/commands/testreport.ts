/**
 * `swarmdo testreport` — parse JUnit-XML / TAP results into a failure digest.
 *
 *   swarmdo testreport junit.xml           # human digest
 *   swarmdo testreport ./reports           # scan a dir for *.xml/*.tap
 *   vitest --reporter=junit | swarmdo testreport   # from stdin
 *   swarmdo testreport junit.xml --format json     # machine output
 *   swarmdo testreport junit.xml --ci              # exit 1 if any failed
 *
 * The front-half of the test→fix loop: turn raw results into exact failing
 * test + file:line + message, then hand it to `repair`. Engine
 * (../testreport/testreport.ts) is pure + tested; this reads files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import {
  parseTestReport, detectFormat, mergeSummaries, formatSummary, type TestFormat, type TestSummary,
} from '../testreport/testreport.js';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(Buffer.from(c)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/** Expand path args into a list of result files (dirs → their *.xml/*.tap). */
function collectFiles(root: string, args: string[]): string[] {
  const files: string[] = [];
  for (const a of args) {
    const abs = path.resolve(root, a);
    let st: fs.Stats;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(abs)) {
        if (/\.(xml|tap)$/i.test(entry)) files.push(path.join(abs, entry));
      }
    } else {
      files.push(abs);
    }
  }
  return files;
}

function numFlag(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const root = ctx.cwd || process.cwd();
  const asJson = ctx.flags.format === 'json';
  const ci = ctx.flags.ci === true;
  const top = numFlag(ctx.flags.top, 0);
  // NB: --type, not --format (global --format is choices-validated to text|json|table).
  const typeOverride = typeof ctx.flags.type === 'string' ? ctx.flags.type : undefined;
  if (typeOverride && typeOverride !== 'junit' && typeOverride !== 'tap') {
    output.printError(`unknown --type '${typeOverride}' (use junit|tap)`);
    return { success: false, exitCode: 1 };
  }

  let summary: TestSummary;
  if (ctx.args.length === 0) {
    if (process.stdin.isTTY) {
      output.writeln(output.error('Usage: swarmdo testreport <file|dir>   OR   <runner> | swarmdo testreport'));
      return { success: false, exitCode: 1 };
    }
    const content = await readStdin();
    const fmt: TestFormat = (typeOverride as TestFormat) ?? detectFormat(content);
    summary = parseTestReport(content, fmt);
  } else {
    const files = collectFiles(root, ctx.args);
    if (files.length === 0) {
      output.printError('no test-result files found (looked for *.xml / *.tap)');
      return { success: false, exitCode: 1 };
    }
    const summaries: TestSummary[] = [];
    for (const f of files) {
      let content: string;
      try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
      const fmt: TestFormat = (typeOverride as TestFormat) ?? detectFormat(content, f);
      summaries.push(parseTestReport(content, fmt));
    }
    summary = mergeSummaries(summaries);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    output.writeln(formatSummary(summary, { top: top > 0 ? top : undefined }));
  }

  const code = ci && summary.failed > 0 ? 1 : 0;
  return { success: code === 0, exitCode: code };
}

export const testreportCommand: Command = {
  name: 'testreport',
  description: 'Parse JUnit-XML / TAP test results into a compact failure digest (test name + file:line + message) — the front-half of the test→fix loop',
  options: [
    { name: 'type', description: 'force input format: junit|tap (default: auto-detect)', type: 'string' },
    { name: 'top', description: 'show only the first N failures', type: 'string' },
    { name: 'ci', description: 'exit 1 if any test failed', type: 'boolean' },
  ],
  examples: [
    { command: 'swarmdo testreport junit.xml', description: 'Digest a JUnit report' },
    { command: 'vitest --reporter=junit | swarmdo testreport --ci', description: 'Parse from stdin, fail on any failure' },
  ],
  action: run,
};

export default testreportCommand;
