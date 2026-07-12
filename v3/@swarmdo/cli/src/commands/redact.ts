/**
 * `swarmdo redact` — strip secrets from a stream before it reaches an LLM, a
 * log, or memory. Sibling of `compact`: same stdin-filter / command-wrap shape,
 * but instead of de-noising it detects API keys / tokens / private keys (rule
 * catalog + entropy fallback) and masks them. Deterministic, zero tokens.
 *
 *   cat deploy.log | swarmdo redact          # stdin filter → redacted stdout
 *   swarmdo redact -- npm run deploy          # wrap a command (stdout+stderr)
 *   swarmdo redact --scan -- terraform apply  # scan only; exit 1 if secrets found (CI gate)
 *
 * Redacted text → stdout (pipeable); a one-line summary → stderr unless --quiet.
 * In --scan mode nothing is rewritten and the process exits non-zero when any
 * secret is present, so it gates CI. See ../redact/redact.ts.
 */

import { spawnSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { redactText, scanText, formatFindingsSummary, type RedactOptions } from '../redact/redact.js';
import { toSarif } from '../redact/sarif.js';
import { writeStdout } from '../util/stdout.js';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(Buffer.from(c)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function optsFromFlags(ctx: CommandContext): RedactOptions {
  const opts: RedactOptions = { entropy: ctx.flags['no-entropy'] !== true };
  const keep = ctx.flags.keep;
  if (typeof keep === 'number') opts.keepPrefix = keep;
  else if (typeof keep === 'string') opts.keepPrefix = parseInt(keep, 10) || 0;
  if (typeof ctx.flags.token === 'string') opts.token = ctx.flags.token;
  if (typeof ctx.flags.threshold === 'string') opts.entropyThreshold = parseFloat(ctx.flags.threshold as string);
  const allow = ctx.flags.allow;
  if (typeof allow === 'string' && allow) opts.allowlist = allow.split(',').map((s) => s.trim()).filter(Boolean);
  return opts;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const opts = optsFromFlags(ctx);
  const quiet = ctx.flags.quiet === true;
  const scanMode = ctx.flags.scan === true;
  const asJson = ctx.flags.json === true;

  // Gather input: either the wrapped command's combined output, or stdin.
  let input: string;
  let wrappedCode = 0;
  const wrapping = ctx.args.length > 0;

  if (wrapping) {
    const [cmd, ...cmdArgs] = ctx.args;
    const r = spawnSync(cmd, cmdArgs, {
      cwd: ctx.cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    if (r.error) {
      output.printError(`failed to run ${cmd}: ${r.error.message}`);
      return { success: false, exitCode: 127 };
    }
    input = (r.stdout || '') + (r.stderr || '');
    wrappedCode = r.status ?? (r.signal ? 1 : 0);
  } else {
    if (process.stdin.isTTY) {
      output.writeln(output.error('Usage: swarmdo redact [--scan] -- <command>   OR   <command> | swarmdo redact'));
      return { success: false, exitCode: 1 };
    }
    input = await readStdin();
  }

  // Scan mode: report findings, never rewrite; exit non-zero if any secret.
  if (scanMode) {
    const findings = scanText(input, opts);
    if (ctx.flags.sarif === true) {
      const source = typeof ctx.flags.source === 'string' ? ctx.flags.source : undefined;
      process.stdout.write(toSarif(findings, { artifactUri: source }) + '\n');
      // Same gate as text --scan: exit 1 on any secret (a CI author piping to
      // upload-sarif adds `|| true` so the upload step still runs).
      const code = findings.length > 0 ? 1 : wrappedCode;
      return { success: code === 0, exitCode: code };
    }
    if (asJson) {
      process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + '\n');
    } else if (findings.length === 0) {
      if (!quiet) process.stderr.write('redact: no secrets found\n');
    } else {
      for (const f of findings) {
        process.stderr.write(`${f.line}:${f.column}  ${f.ruleId}  ${f.description}\n`);
      }
      if (!quiet) process.stderr.write(formatFindingsSummary(findings) + '\n');
    }
    // A wrapped command that itself failed should still surface its failure.
    const code = findings.length > 0 ? 1 : wrappedCode;
    return { success: code === 0, exitCode: code };
  }

  // Redact mode: rewrite and emit.
  const { output: redacted, findings } = redactText(input, opts);
  await writeStdout(redacted);
  if (asJson) {
    process.stderr.write(JSON.stringify({ count: findings.length, findings }, null, 2) + '\n');
  } else if (!quiet) {
    process.stderr.write(formatFindingsSummary(findings) + '\n');
  }
  // In wrap mode propagate the command's exit code; in filter mode success.
  return { success: wrappedCode === 0, exitCode: wrapping ? wrappedCode : 0 };
}

export const redactCommand: Command = {
  name: 'redact',
  description: 'Detect & mask secrets (API keys, tokens, private keys) in a stream before it reaches an LLM/log/memory — deterministic, zero tokens',
  options: [
    { name: 'scan', description: 'scan only: report findings and exit 1 if any secret is present (CI gate), never rewrite', type: 'boolean' },
    { name: 'json', description: 'emit findings as JSON', type: 'boolean' },
    { name: 'sarif', description: 'scan only: emit findings as a SARIF 2.1.0 report (pipe to github/codeql-action/upload-sarif for code-scanning alerts)', type: 'boolean' },
    { name: 'source', description: 'with --sarif: artifact URI/path the findings are anchored to (a stream has no file by default)', type: 'string' },
    { name: 'keep', description: 'keep this many leading chars of each secret (default 3; 0 = full mask)', type: 'string' },
    { name: 'token', description: 'replacement token after the kept prefix (default [REDACTED])', type: 'string' },
    { name: 'no-entropy', description: 'disable the high-entropy keyword=value fallback', type: 'boolean' },
    { name: 'threshold', description: 'entropy threshold in bits/char for the fallback (default 3.5)', type: 'string' },
    { name: 'allow', description: 'comma-separated allowlist substrings; matching secrets are left untouched', type: 'string' },
    { name: 'quiet', description: 'suppress the summary on stderr', type: 'boolean' },
  ],
  examples: [
    { command: 'cat deploy.log | swarmdo redact', description: 'Mask secrets in a log on stdin' },
    { command: 'swarmdo redact -- npm run deploy', description: 'Wrap a command; redact its output, exit code propagates' },
    { command: 'swarmdo redact --scan -- terraform apply', description: 'Fail CI if the output contains secrets' },
    { command: 'swarmdo redact --keep 0 --json', description: 'Full-mask and emit JSON findings' },
  ],
  action: run,
};

export default redactCommand;
