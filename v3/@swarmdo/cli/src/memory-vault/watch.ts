/**
 * watch.ts — debounced change collection for vault auto-sync (phase 2 of the
 * dual-plane memory strategy: edit notes in Obsidian, they sync back to the
 * vector DB as you save).
 *
 * Editors fire bursts of fs events per save (write + rename + metadata);
 * the collector coalesces them into one flush after a quiet window, filters
 * to real notes (.md, not INDEX.md, not dotfiles), and hands relative paths
 * to the sync callback. Pure timing via an injectable scheduler so tests run
 * on fake clocks.
 */

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Should this relative path participate in a sync? */
export function isSyncablePath(relPath: string): boolean {
  const base = relPath.split('/').pop() ?? relPath;
  if (!base.endsWith('.md')) return false;
  if (base === 'INDEX.md') return false;
  if (relPath.split('/').some((seg) => seg.startsWith('.'))) return false;
  return true;
}

export class ChangeCollector {
  private pending = new Set<string>();
  private handle: unknown = null;

  constructor(
    private readonly flush: (paths: string[]) => void,
    private readonly quietMs = 1500,
    private readonly scheduler: Scheduler = realScheduler,
  ) {}

  /** Record a change; (re)arms the quiet-window timer. */
  add(relPath: string): void {
    if (!isSyncablePath(relPath)) return;
    this.pending.add(relPath);
    if (this.handle !== null) this.scheduler.clear(this.handle);
    this.handle = this.scheduler.set(() => this.fire(), this.quietMs);
  }

  /** Flush immediately (shutdown path). No-op when empty. */
  drain(): void {
    if (this.handle !== null) this.scheduler.clear(this.handle);
    this.handle = null;
    this.fire();
  }

  get size(): number {
    return this.pending.size;
  }

  private fire(): void {
    this.handle = null;
    if (this.pending.size === 0) return;
    const batch = [...this.pending].sort();
    this.pending.clear();
    this.flush(batch);
  }
}
