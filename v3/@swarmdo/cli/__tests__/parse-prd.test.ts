import { describe, it, expect } from 'vitest';
import {
  extractJsonArray,
  validateTasks,
  topoSort,
  decomposePrd,
  buildDecomposePrompt,
  type DecomposeRunner,
  type ParsedTask,
} from '../src/task/parse-prd.ts';

describe('parse-prd: extractJsonArray', () => {
  it('extracts a bare array', () => {
    expect(extractJsonArray('[{"a":1}]')).toBe('[{"a":1}]');
  });
  it('extracts from prose-wrapped output', () => {
    expect(extractJsonArray('Here are the tasks:\n[{"ref":"T1"}]\nDone.')).toBe('[{"ref":"T1"}]');
  });
  it('extracts from a ```json fence', () => {
    const out = 'Sure:\n```json\n[{"ref":"T1"},{"ref":"T2"}]\n```';
    expect(extractJsonArray(out)).toBe('[{"ref":"T1"},{"ref":"T2"}]');
  });
  it('is bracket-depth aware with nested arrays', () => {
    const s = '[{"dependsOn":["T1","T2"]},{"dependsOn":[]}]';
    expect(extractJsonArray(`noise ${s} more`)).toBe(s);
  });
  it('ignores brackets inside strings', () => {
    const s = '[{"title":"handle ] and ["}]';
    expect(extractJsonArray(s)).toBe(s);
  });
  it('returns null when no array present', () => {
    expect(extractJsonArray('no json here')).toBeNull();
  });
});

describe('parse-prd: validateTasks', () => {
  it('coerces valid tasks and defaults priority', () => {
    const w: string[] = [];
    const tasks = validateTasks(
      [{ ref: 'T1', title: 'A', description: 'do a', priority: 'high', dependsOn: [] },
       { ref: 'T2', title: 'B', dependsOn: ['T1'] }],
      w,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks[1].priority).toBe('normal'); // defaulted
    expect(tasks[1].dependsOn).toEqual(['T1']);
    expect(w).toHaveLength(0);
  });
  it('drops tasks without a title and records it', () => {
    const w: string[] = [];
    const tasks = validateTasks([{ ref: 'T1' }, { ref: 'T2', title: 'ok' }], w);
    expect(tasks.map(t => t.ref)).toEqual(['T2']);
    expect(w.join()).toMatch(/missing title/);
  });
  it('strips unresolved and self dependency refs', () => {
    const w: string[] = [];
    const tasks = validateTasks(
      [{ ref: 'T1', title: 'A', dependsOn: ['T1', 'GHOST'] },
       { ref: 'T2', title: 'B', dependsOn: ['T1'] }],
      w,
    );
    expect(tasks[0].dependsOn).toEqual([]); // self + ghost stripped
    expect(tasks[1].dependsOn).toEqual(['T1']);
    expect(w.join()).toMatch(/unresolved/);
  });
  it('assigns fresh refs on collision', () => {
    const w: string[] = [];
    const tasks = validateTasks([{ ref: 'T1', title: 'A' }, { ref: 'T1', title: 'B' }], w);
    expect(new Set(tasks.map(t => t.ref)).size).toBe(2);
  });
  it('returns [] for non-array input', () => {
    expect(validateTasks({ nope: true }, [])).toEqual([]);
  });
});

describe('parse-prd: topoSort', () => {
  const mk = (ref: string, dependsOn: string[]): ParsedTask => ({ ref, title: ref, description: '', priority: 'normal', dependsOn });

  it('orders dependencies before dependents', () => {
    const w: string[] = [];
    const ordered = topoSort([mk('T3', ['T2']), mk('T1', []), mk('T2', ['T1'])], w);
    const pos = (r: string) => ordered.findIndex(t => t.ref === r);
    expect(pos('T1')).toBeLessThan(pos('T2'));
    expect(pos('T2')).toBeLessThan(pos('T3'));
    expect(w).toHaveLength(0);
  });
  it('breaks cycles and keeps the result acyclic + complete', () => {
    const w: string[] = [];
    const tasks = [mk('A', ['B']), mk('B', ['A'])]; // 2-cycle
    const ordered = topoSort(tasks, w);
    expect(ordered).toHaveLength(2);
    expect(w.join()).toMatch(/cycle/);
    // No task may still depend on one that comes after it.
    const byPos = new Map(ordered.map((t, i) => [t.ref, i]));
    for (const t of ordered) for (const d of t.dependsOn) expect(byPos.get(d)!).toBeLessThan(byPos.get(t.ref)!);
  });
  it('preserves original order among independent tasks', () => {
    const ordered = topoSort([mk('T1', []), mk('T2', []), mk('T3', [])], []);
    expect(ordered.map(t => t.ref)).toEqual(['T1', 'T2', 'T3']);
  });
});

describe('parse-prd: decomposePrd (injected runner, no billable call)', () => {
  const opts = { model: 'sonnet', maxBudgetUsd: 1, timeoutMs: 1000, cwd: '/tmp', maxTasks: 20 };

  it('runs the full pipeline on well-formed model output', () => {
    const runner: DecomposeRunner = () => ({
      ok: true,
      costUsd: 0.012,
      text: 'Tasks:\n```json\n[{"ref":"T2","title":"Build API","dependsOn":["T1"]},{"ref":"T1","title":"Design schema","priority":"high","dependsOn":[]}]\n```',
    });
    const r = decomposePrd('Build a thing', opts, runner);
    expect(r.tasks.map(t => t.ref)).toEqual(['T1', 'T2']); // topologically ordered
    expect(r.tasks[0].priority).toBe('high');
    expect(r.costUsd).toBe(0.012);
  });

  it('passes the doc + max-tasks into the prompt', () => {
    let seen = '';
    const runner: DecomposeRunner = (req) => { seen = req.prompt; return { ok: true, costUsd: null, text: '[]' }; };
    decomposePrd('MY-UNIQUE-SPEC-TEXT', { ...opts, maxTasks: 7 }, runner);
    expect(seen).toContain('MY-UNIQUE-SPEC-TEXT');
    expect(seen).toContain('at most 7');
  });

  it('warns instead of throwing on non-JSON output', () => {
    const runner: DecomposeRunner = () => ({ ok: true, costUsd: null, text: 'I cannot do that' });
    const r = decomposePrd('x', opts, runner);
    expect(r.tasks).toEqual([]);
    expect(r.warnings.join()).toMatch(/no JSON array/);
  });

  it('clamps to max-tasks', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ref: `T${i}`, title: `t${i}`, dependsOn: [] }));
    const runner: DecomposeRunner = () => ({ ok: true, costUsd: null, text: JSON.stringify(many) });
    const r = decomposePrd('x', { ...opts, maxTasks: 5 }, runner);
    expect(r.tasks).toHaveLength(5);
    expect(r.warnings.join()).toMatch(/clamped/);
  });

  it('handles a runner that returns no output', () => {
    const runner: DecomposeRunner = () => ({ ok: false, costUsd: null, text: '' });
    const r = decomposePrd('x', opts, runner);
    expect(r.tasks).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('parse-prd: buildDecomposePrompt', () => {
  it('includes the schema and the document', () => {
    const p = buildDecomposePrompt('DOCBODY', 15);
    expect(p).toContain('dependsOn');
    expect(p).toContain('acyclic');
    expect(p).toContain('DOCBODY');
    expect(p).toContain('at most 15');
  });
});
