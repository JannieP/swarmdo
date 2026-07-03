/**
 * @swarmdo/codex - Dual-Mode Tests
 *
 * Covers parseWorkerSpecs (W2), CollaborationTemplates, the `dual`
 * command wiring, and DualModeOrchestrator dependency leveling.
 * No real workers are spawned — only pure logic is exercised.
 */
import { describe, it, expect } from 'vitest';
import { parseWorkerSpecs, createDualModeCommand } from '../src/dual-mode/cli.js';
import { DualModeOrchestrator, CollaborationTemplates } from '../src/dual-mode/index.js';
import type { WorkerConfig } from '../src/dual-mode/index.js';

describe('parseWorkerSpecs', () => {
  it('parses a single spec into a WorkerConfig', () => {
    const [w] = parseWorkerSpecs(['claude:architect:Design the API'], false);
    expect(w).toMatchObject({ id: 'architect', platform: 'claude', role: 'architect', prompt: 'Design the API' });
    expect(w.dependsOn).toBeUndefined();
  });

  it('chains workers sequentially by default', () => {
    const ws = parseWorkerSpecs(['claude:architect:Design', 'codex:coder:Build', 'codex:tester:Test'], false);
    expect(ws.map(w => w.id)).toEqual(['architect', 'coder', 'tester']);
    expect(ws.map(w => w.platform)).toEqual(['claude', 'codex', 'codex']);
    expect(ws[0].dependsOn).toBeUndefined();
    expect(ws[1].dependsOn).toEqual(['architect']);
    expect(ws[2].dependsOn).toEqual(['coder']);
  });

  it('runs workers in parallel when parallel=true (no dependsOn)', () => {
    const ws = parseWorkerSpecs(['claude:a:x', 'codex:b:y'], true);
    expect(ws.every(w => w.dependsOn === undefined)).toBe(true);
  });

  it('keeps colons inside the prompt (splits on the first two only)', () => {
    const [w] = parseWorkerSpecs(['codex:coder:Fix bug: handle null in foo:bar'], false);
    expect(w.prompt).toBe('Fix bug: handle null in foo:bar');
    expect(w.role).toBe('coder');
  });

  it('deduplicates ids for repeated roles', () => {
    const ws = parseWorkerSpecs(['codex:coder:a', 'codex:coder:b', 'codex:coder:c'], true);
    expect(ws.map(w => w.id)).toEqual(['coder', 'coder-2', 'coder-3']);
  });

  it('trims whitespace around platform/role/prompt', () => {
    const [w] = parseWorkerSpecs([' claude : architect : Design it '], false);
    expect(w).toMatchObject({ platform: 'claude', role: 'architect', prompt: 'Design it' });
  });

  it('throws on a spec with fewer than two colons', () => {
    expect(() => parseWorkerSpecs(['claude:architect'], false)).toThrow(/Expected/);
    expect(() => parseWorkerSpecs(['justaprompt'], false)).toThrow(/Expected/);
  });

  it('throws on an empty prompt', () => {
    expect(() => parseWorkerSpecs(['claude:architect:   '], false)).toThrow(/Missing prompt/);
  });

  it('throws on an unknown platform', () => {
    expect(() => parseWorkerSpecs(['gemini:coder:do it'], false)).toThrow(/claude.*codex/);
  });
});

describe('CollaborationTemplates', () => {
  it('featureDevelopment: architect -> coder -> tester -> reviewer', () => {
    const ws = CollaborationTemplates.featureDevelopment('Add OAuth');
    expect(ws.map(w => w.id)).toEqual(['architect', 'coder', 'tester', 'reviewer']);
    expect(ws.find(w => w.id === 'architect')!.platform).toBe('claude');
    expect(ws.find(w => w.id === 'coder')!.platform).toBe('codex');
    expect(ws.find(w => w.id === 'coder')!.dependsOn).toEqual(['architect']);
    expect(ws.find(w => w.id === 'tester')!.dependsOn).toEqual(['coder']);
    expect(ws.find(w => w.id === 'reviewer')!.dependsOn).toEqual(['coder', 'tester']);
    expect(ws.some(w => w.prompt.includes('Add OAuth'))).toBe(true);
  });

  it('securityAudit: scanner -> analyzer -> fixer', () => {
    const ws = CollaborationTemplates.securityAudit('./src');
    expect(ws.map(w => w.id)).toEqual(['scanner', 'analyzer', 'fixer']);
    expect(ws.find(w => w.id === 'analyzer')!.dependsOn).toEqual(['scanner']);
    expect(ws.find(w => w.id === 'fixer')!.dependsOn).toEqual(['analyzer']);
  });

  it('refactoring: analyzer -> planner -> refactorer -> validator', () => {
    const ws = CollaborationTemplates.refactoring('./src/legacy');
    expect(ws.map(w => w.id)).toEqual(['analyzer', 'planner', 'refactorer', 'validator']);
    expect(ws.find(w => w.id === 'planner')!.dependsOn).toEqual(['analyzer']);
    expect(ws.find(w => w.id === 'validator')!.dependsOn).toEqual(['refactorer']);
  });
});

describe('dual command wiring', () => {
  it('exposes run / templates / status subcommands', () => {
    const cmd = createDualModeCommand();
    expect(cmd.name()).toBe('dual');
    const subs = cmd.commands.map(c => c.name()).sort();
    expect(subs).toEqual(['run', 'status', 'templates']);
  });

  it('`run` accepts a positional [template] and a repeatable --worker', () => {
    const run = createDualModeCommand().commands.find(c => c.name() === 'run')!;
    const optionNames = run.options.map(o => o.long);
    expect(optionNames).toContain('--worker');
    expect(optionNames).toContain('--parallel-workers');
    expect(optionNames).toContain('--template');
    // a positional argument is registered for [template]
    expect((run as unknown as { _args: unknown[] })._args.length).toBeGreaterThan(0);
  });
});

describe('DualModeOrchestrator', () => {
  const orch = () => new DualModeOrchestrator({ projectPath: '/tmp' });

  it('uses safe defaults (codex command, not claude)', () => {
    const o = orch() as unknown as { config: Record<string, unknown> };
    expect(o.config.codexCommand).toBe('codex');
    expect(o.config.claudeCommand).toBe('claude');
    expect(o.config.maxConcurrent).toBe(4);
    expect(o.config.sharedNamespace).toBe('collaboration');
  });

  it('buildDependencyLevels groups a linear pipeline one-per-level', () => {
    const ws: WorkerConfig[] = [
      { id: 'a', platform: 'claude', role: 'a', prompt: 'x' },
      { id: 'b', platform: 'codex', role: 'b', prompt: 'y', dependsOn: ['a'] },
      { id: 'c', platform: 'codex', role: 'c', prompt: 'z', dependsOn: ['b'] },
    ];
    const levels = (orch() as unknown as { buildDependencyLevels(w: WorkerConfig[]): WorkerConfig[][] }).buildDependencyLevels(ws);
    expect(levels.map(l => l.map(w => w.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('buildDependencyLevels puts independent workers in the same level', () => {
    const ws: WorkerConfig[] = [
      { id: 'a', platform: 'claude', role: 'a', prompt: 'x' },
      { id: 'b', platform: 'codex', role: 'b', prompt: 'y' },
      { id: 'c', platform: 'codex', role: 'c', prompt: 'z', dependsOn: ['a', 'b'] },
    ];
    const levels = (orch() as unknown as { buildDependencyLevels(w: WorkerConfig[]): WorkerConfig[][] }).buildDependencyLevels(ws);
    expect(levels.length).toBe(2);
    expect(new Set(levels[0].map(w => w.id))).toEqual(new Set(['a', 'b']));
    expect(levels[1].map(w => w.id)).toEqual(['c']);
  });

  it('buildDependencyLevels breaks a circular dependency instead of looping forever', () => {
    const ws: WorkerConfig[] = [
      { id: 'a', platform: 'claude', role: 'a', prompt: 'x', dependsOn: ['b'] },
      { id: 'b', platform: 'codex', role: 'b', prompt: 'y', dependsOn: ['a'] },
    ];
    const levels = (orch() as unknown as { buildDependencyLevels(w: WorkerConfig[]): WorkerConfig[][] }).buildDependencyLevels(ws);
    expect(levels.flat().map(w => w.id).sort()).toEqual(['a', 'b']);
  });
});
