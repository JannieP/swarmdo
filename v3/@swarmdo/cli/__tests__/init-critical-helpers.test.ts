/**
 * #111 — guards against the divergence that made #108 non-functional for every
 * `swarmdo init` user.
 *
 * Two helper trees exist: this repo's root `.claude/helpers/` (canonical, where
 * features are developed) and the shipped `v3/@swarmdo/cli/.claude/helpers/`
 * that `init` actually deploys (resolved via require.resolve('@swarmdo/cli')).
 * They had silently diverged: root was `.cjs` + the #108 SubagentStart handlers,
 * the shipped tree was stale `.js` with none of it — so init users got a
 * settings.json calling `agent-register` on a handler that did not define it,
 * requiring helpers that were never shipped.
 *
 * These tests encode the two invariants that would have caught it:
 *   1. Every helper hook-handler.cjs require()s is shipped in the CLI tree AND
 *      in CRITICAL_HELPERS (so both fresh-init bulk-copy and upgrade force-copy
 *      deliver it).
 *   2. The shipped CLI copy of each critical helper is byte-identical to root,
 *      so a fix landing in root can never again miss the tree that ships.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CRITICAL_HELPERS } from '../src/init/executor.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const ROOT_HELPERS = join(REPO_ROOT, '.claude', 'helpers');
const CLI_HELPERS = join(REPO_ROOT, 'v3', '@swarmdo', 'cli', '.claude', 'helpers');

/** The .cjs helpers hook-handler.cjs pulls in via safeRequire(path.join(...)). */
function requiredCjsHelpers(handlerPath: string): string[] {
  const src = readFileSync(handlerPath, 'utf-8');
  const names = new Set<string>();
  const re = /safeRequire\(path\.join\(helpersDir,\s*'([^']+\.cjs)'\)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.add(m[1]);
  return [...names];
}

describe('#111 init critical-helper invariants', () => {
  const shippedHandler = join(CLI_HELPERS, 'hook-handler.cjs');
  const required = requiredCjsHelpers(shippedHandler);

  it('the shipped hook-handler actually requires helpers (guard against an empty match)', () => {
    // If the regex ever stops matching, every assertion below goes vacuous —
    // exactly the trap that let a flat readdir hide files. Anchor on a known one.
    expect(required).toContain('agent-bridge-hook.cjs');
    expect(required.length).toBeGreaterThanOrEqual(4);
  });

  it('every helper the shipped handler requires is itself shipped in the CLI tree', () => {
    const missing = required.filter((h) => !existsSync(join(CLI_HELPERS, h)));
    expect(missing, `shipped hook-handler.cjs require()s helpers absent from the CLI tree: ${missing.join(', ')}`).toEqual([]);
  });

  it('every required helper is in CRITICAL_HELPERS so upgrades force-refresh it', () => {
    // Fresh init bulk-copies the dir; an upgrade only rewrites CRITICAL_HELPERS.
    // A new require missing from this list = upgrading users never get it (#111).
    const notForced = required.filter((h) => !CRITICAL_HELPERS.includes(h));
    expect(notForced, `hook-handler.cjs requires these but they are not force-updated on upgrade: ${notForced.join(', ')}`).toEqual([]);
  });

  it('every CRITICAL_HELPERS entry exists in the shipped CLI tree', () => {
    const absent = CRITICAL_HELPERS.filter((h) => !existsSync(join(CLI_HELPERS, h)));
    expect(absent, `CRITICAL_HELPERS lists files not present in the CLI tree: ${absent.join(', ')}`).toEqual([]);
  });

  it('each critical helper shipped by the CLI is byte-identical to canonical root', () => {
    // The core anti-divergence guard: a fix landing in root/.claude/helpers must
    // reach the tree init deploys, or this fails. intelligence.cjs and
    // auto-memory-hook.mjs had ALSO drifted despite being force-updated — this
    // catches that class, not just the missing-file class.
    const drifted: string[] = [];
    for (const h of CRITICAL_HELPERS) {
      const rootPath = join(ROOT_HELPERS, h);
      const cliPath = join(CLI_HELPERS, h);
      if (!existsSync(rootPath) || !existsSync(cliPath)) continue; // covered above
      if (readFileSync(rootPath, 'utf-8') !== readFileSync(cliPath, 'utf-8')) drifted.push(h);
    }
    expect(drifted, `CLI helper tree has drifted from canonical root for: ${drifted.join(', ')}`).toEqual([]);
  });

  it('no stale .js duplicate shadows a .cjs helper in the shipped tree', () => {
    // router.js/session.js/memory.js/statusline.js lingered next to their .cjs
    // replacements; the bulk copy shipped both. Keep the tree unambiguous.
    const cjs = new Set(readdirSync(CLI_HELPERS).filter((f) => f.endsWith('.cjs')).map((f) => f.slice(0, -4)));
    const shadows = readdirSync(CLI_HELPERS).filter((f) => f.endsWith('.js') && cjs.has(f.slice(0, -3)));
    expect(shadows, `stale .js duplicates shadowing .cjs helpers: ${shadows.join(', ')}`).toEqual([]);
  });
});
