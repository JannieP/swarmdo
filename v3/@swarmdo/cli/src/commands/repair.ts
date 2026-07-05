/**
 * V3 CLI Repair Command
 *
 * `swarmdo repair --test "<cmd>" --confirm` — Test-Driven Repair: a bounded,
 * budget-capped headless-Claude loop that edits source until the failing
 * test command exits 0 (engine: ../repair/tdd-repair.ts).
 *
 * Billable-call gates, in order:
 *   1. SWARMDO_HEADLESS=0|false|off forbids the run outright
 *   2. without --confirm the command only prints the plan (dry-run)
 *   3. the engine enforces --max-budget-usd and iteration/timeout ceilings
 */

import { execSync } from 'node:child_process';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';

function csv(v: unknown): string[] | undefined {
  return typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const testCommand = ctx.flags.test as string | undefined;
  if (!testCommand) {
    output.printError('--test "<command>" is required (its exit code is the fitness function)');
    return { success: false, exitCode: 1 };
  }

  const headlessFlag = (process.env.SWARMDO_HEADLESS ?? '').toLowerCase();
  if (headlessFlag === '0' || headlessFlag === 'false' || headlessFlag === 'off') {
    output.printError('SWARMDO_HEADLESS forbids billable headless claude runs on this host');
    return { success: false, exitCode: 1 };
  }

  const options = {
    testCommand,
    cwd: ctx.cwd || process.cwd(),
    protectFiles: csv(ctx.flags.protect),
    contextFiles: csv(ctx.flags.context),
    maxIterations: (ctx.flags['max-iterations'] as number) || 4,
    maxBudgetUsd: (ctx.flags['max-budget-usd'] as number) || 5,
    perCallTimeoutMs: ((ctx.flags['timeout-secs'] as number) || 300) * 1000,
    model: (ctx.flags.model as string) || 'sonnet',
  };

  if (ctx.flags.confirm !== true) {
    output.writeln(output.bold('Test-Driven Repair — plan (dry-run, nothing executed)'));
    output.printList([
      `Test command:  ${options.testCommand}`,
      `Max iterations: ${options.maxIterations} · budget ceiling: $${options.maxBudgetUsd.toFixed(2)} · model: ${options.model}`,
      `Per-call timeout: ${options.perCallTimeoutMs / 1000}s`,
      `Protected: auto-detected test files in the command${options.protectFiles ? ` + ${options.protectFiles.join(', ')}` : ''}`,
      `Model tools: Read, Edit only — the harness runs the test, the model cannot`,
    ]);
    output.printInfo('re-run with --confirm to execute (makes billable claude calls)');
    return { success: true, exitCode: 0 };
  }

  try {
    execSync('claude --version', { stdio: 'pipe', timeout: 10_000 });
  } catch {
    output.printError('claude CLI not found on PATH — Test-Driven Repair needs Claude Code installed');
    return { success: false, exitCode: 1 };
  }

  const { runTddRepair } = await import('../repair/tdd-repair.js');
  const report = await runTddRepair({ ...options, log: (line) => output.writeln(output.dim(`  ${line}`)) });

  if (ctx.flags.json === true) {
    output.writeln(JSON.stringify(report, null, 2));
    return { success: report.status === 'fixed' || report.status === 'already-green', exitCode: report.status === 'fixed' || report.status === 'already-green' ? 0 : report.status === 'protection-violation' ? 2 : 1, data: report };
  }

  output.writeln();
  switch (report.status) {
    case 'already-green':
      output.printSuccess('Test already passes — nothing to repair');
      break;
    case 'fixed':
      output.printSuccess(`Fixed in ${report.iterations} iteration(s) — test now exits 0`);
      break;
    case 'protection-violation':
      output.printError(`Aborted: protected files were modified and have been restored: ${report.restoredFiles?.join(', ')}`);
      break;
    case 'exhausted':
      output.printError(`Not fixed — ${report.note}`);
      break;
  }
  output.printList([
    `Iterations: ${report.iterations}`,
    `Measured spend: $${report.totalCostUsd.toFixed(4)}`,
    `Protected files: ${report.protectedFiles.length ? report.protectedFiles.join(', ') : '(none)'}`,
  ]);
  if (report.status === 'exhausted') {
    output.writeln(output.dim('--- last failure output (tail) ---'));
    output.writeln(output.dim(report.finalTestOutput));
  }

  const ok = report.status === 'fixed' || report.status === 'already-green';
  return { success: ok, exitCode: ok ? 0 : report.status === 'protection-violation' ? 2 : 1, data: report };
}

export const repairCommand: Command = {
  name: 'repair',
  aliases: ['tdd-repair'],
  description: 'Test-Driven Repair — bounded, budget-capped headless claude loop fixes source until a failing test passes',
  options: [
    { name: 'test', description: 'shell command whose exit code is the fitness function (required)', type: 'string', required: true },
    { name: 'confirm', description: 'actually run (billable claude calls); omit for a dry-run plan', type: 'boolean', default: false },
    { name: 'protect', description: 'comma-separated files to protect beyond auto-detected test files', type: 'string' },
    { name: 'context', description: 'comma-separated likely fix sites to name in the prompt', type: 'string' },
    { name: 'max-iterations', description: 'iteration ceiling (default 4)', type: 'number', default: 4 },
    { name: 'max-budget-usd', description: 'total spend ceiling across iterations (default 5)', type: 'number', default: 5 },
    { name: 'timeout-secs', description: 'per-claude-call timeout (default 300)', type: 'number', default: 300 },
    { name: 'model', description: 'model for repair calls (default sonnet)', type: 'string', default: 'sonnet' },
    { name: 'json', description: 'machine-readable report', type: 'boolean', default: false },
  ],
  examples: [
    { command: 'swarmdo repair --test "npx vitest run src/auth.test.ts"', description: 'Dry-run: show the plan without spending' },
    { command: 'swarmdo repair --test "npx vitest run src/auth.test.ts" --confirm', description: 'Repair until green (≤4 iterations, ≤$5)' },
    { command: 'swarmdo repair --test "npm test" --context src/parser.ts --max-budget-usd 2 --confirm', description: 'Point at a likely fix site with a tighter budget' },
  ],
  action: run,
};

export default repairCommand;
