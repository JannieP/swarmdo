/**
 * #43 Phase 1 — the UserPromptSubmit intelligence hook (generateIntelligenceStub)
 * must inject the matched memory CONTENT under a token budget, not just an
 * 80-char label, so stored memories are usable mid-session. Lexical match is
 * reused (no per-prompt embedding cost); only the injection changed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateIntelligenceStub } from '../src/init/helpers-generator.ts';

let root: string;
let cwd0: string;
let helper: { init: () => void; getContext: (p: string) => string | null };

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'swarmdo-ctx-'));
  mkdirSync(path.join(root, '.swarmdo', 'data'), { recursive: true });
  // The hook loads from .swarmdo/data/auto-memory-store.json (STORE_PATH).
  const store = {
    entries: [
      { id: 'm1', summary: 'commit-push-in-phases', category: 'auto-memory', confidence: 0.8,
        content: 'Commit and push in phases: make incremental commits per logical unit, one push per phase, never one big batch.' },
      { id: 'm2', summary: 'always-bump-version', category: 'feedback', confidence: 0.9,
        content: 'USER RULE increment the version on EVERY commit no exceptions patch-bump the trio in lockstep.' },
    ],
  };
  writeFileSync(path.join(root, '.swarmdo', 'data', 'auto-memory-store.json'), JSON.stringify(store));
  const helperPath = path.join(root, 'helper.cjs');
  writeFileSync(helperPath, generateIntelligenceStub());
  cwd0 = process.cwd();
  process.chdir(root); // the emitted hook resolves STORE_PATH from process.cwd()
  helper = createRequire(import.meta.url)(helperPath);
  helper.init();
});

afterAll(() => {
  process.chdir(cwd0);
  rmSync(root, { recursive: true, force: true });
});

describe('intelligence hook — content injection (#43)', () => {
  it('injects the matched memory CONTENT, not just an 80-char label', () => {
    const out = helper.getContext('commit and push my version bump in phases') ?? '';
    expect(out).toContain('[INTELLIGENCE] Relevant patterns for this task:');
    // Real content bodies present — the whole point of the change.
    expect(out).toMatch(/incremental commits per logical unit/);
    expect(out).toMatch(/increment the version on EVERY commit/);
    // A matched line now carries more than the old 80-char label cap.
    const contentLine = out.split('\n').find((l) => l.includes('commit-push-in-phases'))!;
    expect(contentLine.length).toBeGreaterThan(80);
  });

  it('keeps the whole injection within the ~800-token (3200-char) budget', () => {
    const out = helper.getContext('commit push version bump phases') ?? '';
    expect(out.length).toBeLessThan(3600); // budget + header/label overhead
  });

  it('returns null for a prompt that matches nothing', () => {
    expect(helper.getContext('xyzzy plugh quux nonsense')).toBeNull();
  });
});
