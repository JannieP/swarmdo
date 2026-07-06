import { describe, it, expect } from 'vitest';
import { ChangeCollector, isSyncablePath, type Scheduler } from '../src/memory-vault/watch.ts';

/** Manual fake scheduler — fire() runs the armed callback. */
function fakeScheduler(): Scheduler & { fire: () => void; cleared: number } {
  let armed: (() => void) | null = null;
  return {
    cleared: 0,
    set(fn: () => void) { armed = fn; return fn; },
    clear() { this.cleared++; armed = null; },
    fire() { const f = armed; armed = null; if (f) f(); },
  };
}

describe('vault-watch: isSyncablePath', () => {
  it('accepts namespace notes, rejects INDEX/dotfiles/non-md', () => {
    expect(isSyncablePath('patterns/auth.md')).toBe(true);
    expect(isSyncablePath('INDEX.md')).toBe(false);
    expect(isSyncablePath('patterns/INDEX.md')).toBe(false);
    expect(isSyncablePath('.obsidian/workspace.json')).toBe(false);
    expect(isSyncablePath('patterns/.trash.md')).toBe(false);
    expect(isSyncablePath('notes/todo.txt')).toBe(false);
  });
});

describe('vault-watch: ChangeCollector', () => {
  it('coalesces a burst into one sorted flush', () => {
    const sched = fakeScheduler();
    const batches: string[][] = [];
    const c = new ChangeCollector((b) => batches.push(b), 1500, sched);
    c.add('b/two.md');
    c.add('a/one.md');
    c.add('b/two.md'); // duplicate collapses
    expect(sched.cleared).toBe(2); // each add re-arms
    sched.fire();
    expect(batches).toEqual([['a/one.md', 'b/two.md']]);
    expect(c.size).toBe(0);
  });

  it('separate quiet windows flush separately', () => {
    const sched = fakeScheduler();
    const batches: string[][] = [];
    const c = new ChangeCollector((b) => batches.push(b), 1500, sched);
    c.add('x.md');
    sched.fire();
    c.add('y.md');
    sched.fire();
    expect(batches).toEqual([['x.md'], ['y.md']]);
  });

  it('ignores unsyncable paths entirely (no timer armed)', () => {
    const sched = fakeScheduler();
    const batches: string[][] = [];
    const c = new ChangeCollector((b) => batches.push(b), 1500, sched);
    c.add('INDEX.md');
    c.add('.obsidian/cache');
    sched.fire();
    expect(batches).toEqual([]);
  });

  it('drain flushes pending immediately and is a no-op when empty', () => {
    const sched = fakeScheduler();
    const batches: string[][] = [];
    const c = new ChangeCollector((b) => batches.push(b), 1500, sched);
    c.add('z.md');
    c.drain();
    c.drain();
    expect(batches).toEqual([['z.md']]);
  });
});
