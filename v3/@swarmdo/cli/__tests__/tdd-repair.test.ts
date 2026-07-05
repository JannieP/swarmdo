/**
 * tdd-repair engine — every path via injected runners, ZERO claude calls.
 *
 * The rails under test are the point of the feature:
 *   exit-code-is-fitness · protected-file restore · budget ceiling ·
 *   iteration ceiling · test-file auto-detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTddRepair, detectTestFiles, type ClaudeRepairRequest } from '../src/repair/tdd-repair.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'swarmdo-tdr-'));
  writeFileSync(path.join(dir, 'source.js'), 'module.exports = () => "broken";\n');
  writeFileSync(path.join(dir, 'thing.test.js'), 'const f = require("./source"); if (f() !== "fixed") process.exit(1);\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Fitness: pass iff source.js returns "fixed" — evaluated by real content. */
function realishRunTest() {
  return (_cmd: string, cwd: string) => {
    const src = readFileSync(path.join(cwd, 'source.js'), 'utf8');
    return src.includes('"fixed"')
      ? { exitCode: 0, output: 'ok' }
      : { exitCode: 1, output: 'Expected "fixed", got "broken" at thing.test.js:1' };
  };
}

describe('detectTestFiles', () => {
  it('finds existing test-looking paths in the command, ignores the rest', () => {
    const found = detectTestFiles(`npx vitest run thing.test.js missing.test.js src/util.js`, dir);
    expect(found).toEqual([path.join(dir, 'thing.test.js')]);
  });
});

describe('runTddRepair', () => {
  it('returns already-green without any claude call when the test passes', async () => {
    writeFileSync(path.join(dir, 'source.js'), 'module.exports = () => "fixed";\n');
    let claudeCalls = 0;
    const report = await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      runTest: realishRunTest(),
      runClaude: () => { claudeCalls++; return { ok: true, text: '', costUsd: 0 }; },
    });
    expect(report.status).toBe('already-green');
    expect(report.iterations).toBe(0);
    expect(claudeCalls).toBe(0);
  });

  it('fixes on the first iteration when the model repairs the source', async () => {
    const report = await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      runTest: realishRunTest(),
      runClaude: (req: ClaudeRepairRequest) => {
        // "model" applies the minimal source fix
        writeFileSync(path.join(req.cwd, 'source.js'), 'module.exports = () => "fixed";\n');
        return { ok: true, text: 'changed source.js to return "fixed"', costUsd: 0.12 };
      },
    });
    expect(report.status).toBe('fixed');
    expect(report.iterations).toBe(1);
    expect(report.totalCostUsd).toBeCloseTo(0.12, 10);
  });

  it('restores protected test files byte-for-byte and aborts on violation', async () => {
    const testFile = path.join(dir, 'thing.test.js');
    const original = readFileSync(testFile, 'utf8');
    const report = await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      runTest: realishRunTest(),
      runClaude: () => {
        // "model" cheats: weakens the test instead of fixing the source
        writeFileSync(testFile, 'process.exit(0);\n');
        return { ok: true, text: 'made the test pass', costUsd: 0.2 };
      },
    });
    expect(report.status).toBe('protection-violation');
    expect(report.restoredFiles).toEqual([testFile]);
    expect(readFileSync(testFile, 'utf8')).toBe(original); // byte-for-byte
    expect(report.iterations).toBe(1);
  });

  it('stops at the iteration ceiling when the model never fixes it', async () => {
    let calls = 0;
    const report = await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      maxIterations: 2,
      runTest: realishRunTest(),
      runClaude: () => { calls++; return { ok: true, text: 'tried something useless', costUsd: 0.3 }; },
    });
    expect(report.status).toBe('exhausted');
    expect(report.iterations).toBe(2);
    expect(calls).toBe(2);
    expect(report.totalCostUsd).toBeCloseTo(0.6, 10);
    expect(report.note).toMatch(/iteration ceiling/);
  });

  it('stops when measured spend reaches the budget ceiling', async () => {
    let calls = 0;
    const report = await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      maxIterations: 10,
      maxBudgetUsd: 0.4,
      runTest: realishRunTest(),
      runClaude: () => { calls++; return { ok: true, text: 'expensive attempt', costUsd: 0.5 }; },
    });
    expect(report.status).toBe('exhausted');
    expect(calls).toBe(1); // second call never happens — remaining ≤ 0
    expect(report.note).toMatch(/budget ceiling/);
  });

  it('passes the REMAINING budget to each claude call', async () => {
    const budgets: number[] = [];
    await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      maxIterations: 3,
      maxBudgetUsd: 1.0,
      runTest: realishRunTest(),
      runClaude: (req) => { budgets.push(req.maxBudgetUsd); return { ok: true, text: '', costUsd: 0.4 }; },
    });
    expect(budgets[0]).toBeCloseTo(1.0, 10);
    expect(budgets[1]).toBeCloseTo(0.6, 10);
    // third call skipped at 0.2 remaining? No: 0.2 > 0 → runs with 0.2
    expect(budgets[2]).toBeCloseTo(0.2, 10);
  });

  it('default test runner treats a real exit code as fitness', async () => {
    // uses the actual defaultRunTest via /bin/sh — no claude involved
    const report = await runTddRepair({
      testCommand: 'exit 0',
      cwd: dir,
      runClaude: () => { throw new Error('must not be called'); },
    });
    expect(report.status).toBe('already-green');
  });

  it('includes failure tail and protected list in the prompt', async () => {
    let seenPrompt = '';
    await runTddRepair({
      testCommand: 'node thing.test.js',
      cwd: dir,
      maxIterations: 1,
      runTest: realishRunTest(),
      runClaude: (req) => { seenPrompt = req.prompt; return { ok: true, text: '', costUsd: 0 }; },
    });
    expect(seenPrompt).toContain('Expected "fixed", got "broken"');
    expect(seenPrompt).toContain('thing.test.js');
    expect(seenPrompt).toContain('NEVER edit these protected files');
  });
});
