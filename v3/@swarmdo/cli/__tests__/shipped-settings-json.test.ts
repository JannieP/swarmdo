/**
 * Every `.claude/settings.json` we ship must be parseable JSON.
 *
 * #107: the cli's own settings.json shipped in the npm tarball with unescaped
 * inner quotes in all 9 hook command strings —
 *   "command": "node "$CLAUDE_PROJECT_DIR/...cjs" pre-bash"
 * — so Claude Code could not read a single hook or the statusLine. It reached
 * the registry via root package.json `files: ["v3/@swarmdo/cli/.claude/**"]`
 * and the cli's own `files: [".claude"]`, and survived because nothing ever
 * JSON.parse'd these files in CI: `swarmdo init` GENERATES settings.json from
 * settings-generator.ts, so the generator's tests pass while the checked-in
 * artifact rots. Drift originated in the rufflo->swarmdo rename (d4294bad1).
 *
 * This guards the checked-in artifacts, not the generator.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Repo root, from v3/@swarmdo/cli/__tests__ */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

/** Every settings.json shipped via a package.json `files[]` entry. */
const SHIPPED_SETTINGS = [
  '.claude/settings.json',
  'v3/@swarmdo/cli/.claude/settings.json',
];

describe('shipped .claude/settings.json artifacts', () => {
  for (const rel of SHIPPED_SETTINGS) {
    const abs = join(REPO_ROOT, rel);

    it(`${rel} is valid JSON`, () => {
      expect(existsSync(abs), `${rel} is missing`).toBe(true);
      const raw = readFileSync(abs, 'utf-8');
      // The assertion that would have caught #107.
      expect(() => JSON.parse(raw), `${rel} does not parse`).not.toThrow();
    });

    it(`${rel} hook + statusLine commands are non-empty strings`, () => {
      const cfg = JSON.parse(readFileSync(abs, 'utf-8'));

      for (const [event, blocks] of Object.entries(cfg.hooks ?? {})) {
        for (const block of blocks as Array<{ hooks?: Array<{ command?: unknown }> }>) {
          for (const hook of block.hooks ?? []) {
            expect(typeof hook.command, `${rel} ${event} command is not a string`).toBe('string');
            expect((hook.command as string).length, `${rel} ${event} command is empty`).toBeGreaterThan(0);
          }
        }
      }

      if (cfg.statusLine) {
        expect(typeof cfg.statusLine.command).toBe('string');
        expect(cfg.statusLine.command.length).toBeGreaterThan(0);
      }
    });
  }
});
