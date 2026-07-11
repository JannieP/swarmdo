/**
 * #53 — the auto-memory JsonFileBackend must not let the store bloat with
 * duplicate memories. Two guarantees, both regression-tested here:
 *   1. query({type: 'hybrid'}) must NOT filter entries — `type` is a QueryType
 *      search STRATEGY, not an entry MemoryType. Treating it as an entry filter
 *      returned [] for the bridge's hash-fetch, zeroing out import dedup.
 *   2. dedupeByContentSignature + initialize() auto-heal a store already bloated
 *      by the pre-fix import bug (same memory under many distinct ids).
 *
 * The hook exports these behind a run-guard so importing it here is
 * side-effect-free (no command dispatch, no process.exit).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs helper, no types
import { JsonFileBackend, dedupeByContentSignature } from '../.claude/helpers/auto-memory-hook.mjs';

const seed = (be: any, entries: any[]) => { for (const e of entries) be.entries.set(e.id, e); };

describe('auto-memory JsonFileBackend.query (#53)', () => {
  it('a QueryType strategy (type:hybrid) does NOT filter out entries by MemoryType', async () => {
    const be = new JsonFileBackend(path.join(tmpdir(), 'never-written-53a.json'));
    seed(be, [
      { id: 'a', namespace: 'auto-memory', type: 'semantic', content: 'x', metadata: { contentHash: 'h1' } },
      { id: 'b', namespace: 'auto-memory', type: 'semantic', content: 'y', metadata: { contentHash: 'h2' } },
    ]);
    // Pre-#53 this returned [] (e.type 'semantic' !== opts.type 'hybrid'),
    // which made the bridge's fetchExistingContentHashes see 0 hashes.
    const hybrid = await be.query({ type: 'hybrid', namespace: 'auto-memory', limit: 10_000 });
    expect(hybrid.map((e: any) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('filters by namespace and honors limit', async () => {
    const be = new JsonFileBackend(path.join(tmpdir(), 'never-written-53b.json'));
    seed(be, [
      { id: 'a', namespace: 'auto-memory' },
      { id: 'b', namespace: 'tasks' },
      { id: 'c', namespace: 'auto-memory' },
    ]);
    expect((await be.query({ namespace: 'auto-memory' })).map((e: any) => e.id).sort()).toEqual(['a', 'c']);
    expect((await be.query({ limit: 2 })).length).toBe(2);
  });
});

describe('auto-memory dedupeByContentSignature (#53)', () => {
  it('collapses same-content / distinct-id entries, keeps the first, preserves distinct ones', () => {
    const dup = { namespace: 'auto-memory', metadata: { contentHash: 'H' }, content: 'same' };
    const out = dedupeByContentSignature([
      { id: 'd1', ...dup }, { id: 'd2', ...dup }, { id: 'd3', ...dup },
      { id: 'other', namespace: 'auto-memory', metadata: { contentHash: 'X' }, content: 'different' },
    ]);
    expect(out.map((e: any) => e.id)).toEqual(['d1', 'other']);
  });

  it('does not merge identical content across different namespaces', () => {
    const out = dedupeByContentSignature([
      { id: 'a', namespace: 'auto-memory', content: 'same' },
      { id: 'b', namespace: 'tasks', content: 'same' },
    ]);
    expect(out.length).toBe(2);
  });

  it('falls back to raw content when no contentHash is present', () => {
    const out = dedupeByContentSignature([
      { id: 'a', namespace: 'n', content: 'body' },
      { id: 'b', namespace: 'n', content: 'body' },
      { id: 'c', namespace: 'n', content: 'other' },
    ]);
    expect(out.map((e: any) => e.id)).toEqual(['a', 'c']);
  });
});

describe('auto-memory initialize() auto-heal (#53)', () => {
  it('collapses an already-bloated store on load and rewrites it once', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'swarmdo-amh-'));
    const file = path.join(dir, 'store.json');
    const dup = { namespace: 'auto-memory', metadata: { contentHash: 'H' }, content: 'x' };
    const bloated = [
      { id: '1', ...dup }, { id: '2', ...dup }, { id: '3', ...dup }, { id: '4', ...dup },
      { id: 'u', namespace: 'auto-memory', metadata: { contentHash: 'U' }, content: 'unique' },
    ];
    writeFileSync(file, JSON.stringify(bloated));

    const be = new JsonFileBackend(file);
    await be.initialize();

    // 4 identical copies collapse to 1, plus the unique entry.
    expect(await be.count()).toBe(2);
    // Auto-healed: the on-disk store is rewritten to the deduped set, so the
    // bloat is cleaned once rather than re-read every session.
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk.length).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves a clean store untouched (no needless rewrite)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'swarmdo-amh-'));
    const file = path.join(dir, 'store.json');
    const clean = [
      { id: 'a', namespace: 'auto-memory', metadata: { contentHash: 'A' }, content: 'a' },
      { id: 'b', namespace: 'auto-memory', metadata: { contentHash: 'B' }, content: 'b' },
    ];
    writeFileSync(file, JSON.stringify(clean));
    const be = new JsonFileBackend(file);
    await be.initialize();
    expect(await be.count()).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});
