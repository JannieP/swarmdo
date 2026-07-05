/**
 * tdd-repair.ts — Test-Driven Repair engine: a bounded headless-Claude loop
 * that edits SOURCE until a failing test command exits 0.
 *
 * Capability modeled on upstream claude-flow v3.14.0 "testgen Test-Driven
 * Repair"; independent implementation against swarmdo conventions.
 *
 * Design invariants (each one is a rail, not a preference):
 *   - The TEST RUN is the fitness function. This harness runs the test and
 *     reads the exit code; the model never gets Bash, so it cannot fake a
 *     green run — it can only Read and Edit.
 *   - Protected files (the test files + anything passed in) are snapshotted
 *     before the loop; any change to them is restored byte-for-byte and
 *     aborts the run as a violation. A repair that edits the test is not a
 *     repair.
 *   - Hard budget: each claude call carries --max-budget-usd for the
 *     REMAINING budget; measured spend (from --output-format json) is
 *     subtracted after every call and the loop stops at zero.
 *   - Bounded iterations and per-call timeouts — no unbounded loops.
 *
 * The claude/test runners are injectable so the test suite exercises every
 * path with zero billable calls (see __tests__/tdd-repair.test.ts).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TestRun {
  exitCode: number;
  output: string;
}

export interface ClaudeRepairRequest {
  prompt: string;
  cwd: string;
  model: string;
  maxBudgetUsd: number;
  timeoutMs: number;
}

export interface ClaudeRunResult {
  ok: boolean;
  text: string;
  /** measured spend from --output-format json; null when unparsable */
  costUsd: number | null;
}

export interface RepairOptions {
  /** shell command whose exit code is the fitness function */
  testCommand: string;
  cwd: string;
  /** extra files to protect beyond auto-detected test paths */
  protectFiles?: string[];
  /** files worth naming in the prompt as likely fix sites */
  contextFiles?: string[];
  maxIterations?: number;
  /** total spend ceiling across all iterations */
  maxBudgetUsd?: number;
  perCallTimeoutMs?: number;
  model?: string;
  runTest?: (cmd: string, cwd: string) => TestRun;
  runClaude?: (req: ClaudeRepairRequest) => ClaudeRunResult;
  log?: (line: string) => void;
}

export interface RepairReport {
  status: 'already-green' | 'fixed' | 'exhausted' | 'protection-violation';
  iterations: number;
  totalCostUsd: number;
  protectedFiles: string[];
  /** tail of the last test output (the failure when not fixed) */
  finalTestOutput: string;
  /** set when status is protection-violation: which files were restored */
  restoredFiles?: string[];
  note?: string;
}

const OUTPUT_TAIL = 4000;

function tail(s: string, n = OUTPUT_TAIL): string {
  return s.length > n ? s.slice(s.length - n) : s;
}

/** Paths in the test command that look like test files and exist. */
export function detectTestFiles(testCommand: string, cwd: string): string[] {
  const found: string[] = [];
  for (const token of testCommand.split(/\s+/)) {
    if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(token)) continue;
    const abs = path.isAbsolute(token) ? token : path.join(cwd, token);
    if (fs.existsSync(abs)) found.push(abs);
  }
  return found;
}

function defaultRunTest(cmd: string, cwd: string): TestRun {
  const res = spawnSync('/bin/sh', ['-c', cmd], {
    cwd,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  // status null = signal/timeout — a fail, never a pass
  return { exitCode: res.status ?? 1, output };
}

function defaultRunClaude(req: ClaudeRepairRequest): ClaudeRunResult {
  // Same nested-session/env conventions as headless-worker-executor
  // (#1395/#1852): prompt via STDIN, entrypoint marker, session vars scrubbed.
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_ENTRYPOINT: 'worker',
  };
  delete env.CLAUDE_SESSION_ID;
  delete env.CLAUDE_PARENT_SESSION_ID;

  const res = spawnSync(
    'claude',
    [
      '--print',
      '--output-format', 'json',
      '--model', req.model,
      '--max-budget-usd', String(req.maxBudgetUsd),
      '--allowedTools', 'Read,Edit',
      '--permission-mode', 'acceptEdits',
    ],
    {
      cwd: req.cwd,
      env,
      input: req.prompt,
      encoding: 'utf8',
      timeout: req.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  const raw = `${res.stdout ?? ''}`;
  let costUsd: number | null = null;
  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    costUsd = typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null;
    text = typeof parsed.result === 'string' ? parsed.result : raw;
  } catch {
    // non-JSON output (old CLI or error path) — keep raw text, unknown cost
  }
  return { ok: res.status === 0, text, costUsd };
}

function buildPrompt(opts: RepairOptions, failureOutput: string, protectedFiles: string[], iteration: number, maxIterations: number): string {
  const protectedList = protectedFiles.map((f) => `- ${f}`).join('\n');
  const contextList = (opts.contextFiles ?? []).map((f) => `- ${f}`).join('\n');
  return `You are performing Test-Driven Repair (iteration ${iteration}/${maxIterations}).

A test command is failing. Fix the SOURCE code so it passes. You have Read and Edit only — you cannot run anything; the harness reruns the test after you finish.

Test command (run by the harness, not you):
  ${opts.testCommand}

Current failure output (tail):
\`\`\`
${tail(failureOutput)}
\`\`\`
${contextList ? `\nLikely fix sites:\n${contextList}\n` : ''}
RULES — violations abort the run:
- NEVER edit these protected files (the tests themselves):
${protectedList || '- (none detected)'}
- Make the minimal change that makes the test pass for the RIGHT reason — no test-detection hacks, no deleting assertions' targets, no new dependencies.
- Prefer editing existing source files over creating new ones.

When done, state in one sentence what you changed and why.`;
}

export async function runTddRepair(opts: RepairOptions): Promise<RepairReport> {
  const cwd = path.resolve(opts.cwd);
  const maxIterations = opts.maxIterations ?? 4;
  const totalBudget = opts.maxBudgetUsd ?? 5;
  const model = opts.model ?? 'sonnet';
  const perCallTimeoutMs = opts.perCallTimeoutMs ?? 5 * 60 * 1000;
  const runTest = opts.runTest ?? defaultRunTest;
  const runClaude = opts.runClaude ?? defaultRunClaude;
  const log = opts.log ?? (() => {});

  // Protected set: auto-detected test files + explicit list, snapshotted.
  const protectedFiles = [
    ...detectTestFiles(opts.testCommand, cwd),
    ...(opts.protectFiles ?? []).map((f) => (path.isAbsolute(f) ? f : path.join(cwd, f))),
  ].filter((f, i, all) => all.indexOf(f) === i);
  const snapshots = new Map<string, string>();
  for (const f of protectedFiles) {
    if (fs.existsSync(f)) snapshots.set(f, fs.readFileSync(f, 'utf8'));
  }

  log(`test: ${opts.testCommand}`);
  let test = runTest(opts.testCommand, cwd);
  if (test.exitCode === 0) {
    return {
      status: 'already-green',
      iterations: 0,
      totalCostUsd: 0,
      protectedFiles,
      finalTestOutput: tail(test.output),
      note: 'test command already exits 0 — nothing to repair',
    };
  }

  let totalCost = 0;
  for (let i = 1; i <= maxIterations; i++) {
    const remaining = totalBudget - totalCost;
    if (remaining <= 0) {
      return {
        status: 'exhausted',
        iterations: i - 1,
        totalCostUsd: totalCost,
        protectedFiles,
        finalTestOutput: tail(test.output),
        note: `budget ceiling reached ($${totalBudget.toFixed(2)})`,
      };
    }

    log(`iteration ${i}/${maxIterations} — invoking claude (budget left $${remaining.toFixed(2)})`);
    const result = runClaude({
      prompt: buildPrompt(opts, test.output, protectedFiles, i, maxIterations),
      cwd,
      model,
      maxBudgetUsd: remaining,
      timeoutMs: perCallTimeoutMs,
    });
    totalCost += result.costUsd ?? 0;
    if (result.text) log(`claude: ${result.text.slice(0, 300)}`);

    // Protection check BEFORE trusting anything the model did.
    const restored: string[] = [];
    for (const [file, original] of snapshots) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (current !== original) {
        fs.writeFileSync(file, original);
        restored.push(file);
      }
    }
    if (restored.length > 0) {
      return {
        status: 'protection-violation',
        iterations: i,
        totalCostUsd: totalCost,
        protectedFiles,
        finalTestOutput: tail(test.output),
        restoredFiles: restored,
        note: 'protected files were modified; originals restored byte-for-byte and the run aborted',
      };
    }

    test = runTest(opts.testCommand, cwd);
    if (test.exitCode === 0) {
      return {
        status: 'fixed',
        iterations: i,
        totalCostUsd: totalCost,
        protectedFiles,
        finalTestOutput: tail(test.output),
      };
    }
    log(`iteration ${i}: test still failing (exit ${test.exitCode})`);
  }

  return {
    status: 'exhausted',
    iterations: maxIterations,
    totalCostUsd: totalCost,
    protectedFiles,
    finalTestOutput: tail(test.output),
    note: `iteration ceiling reached (${maxIterations})`,
  };
}
